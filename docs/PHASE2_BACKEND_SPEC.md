# Gamma OS — Phase 2: Backend Integration Specification
**Version:** 1.0  
**Status:** Draft  
**Audience:** Senior Backend Developer (NestJS + Redis)

---

## 1. Overview

Phase 2 connects Gamma OS (React-based Web OS) to the **OpenClaw Gateway** running locally on the Mac Mini M4. The result is a live OS where:

- Each open **Window** maps to an **OpenClaw agent session**
- Agents stream responses via SSE into the OS window's content area
- A dedicated **System Architect Agent** can generate `.tsx` files, commit them via Git, and hot-reload them into the UI without a full rebuild
- All agent "thought tokens" are intercepted and pushed to `gamma:memory:bus` (Redis Streams)

```
Browser (Gamma OS React)
    │  SSE /api/stream/:windowId
    ▼
NestJS Backend (gamma-os-server)
    │  WS / HTTP  │  Redis Pub/Sub + Streams
    ▼              ▼
OpenClaw Gateway   Redis 7+
    │
    ▼
Claude / local models / sub-agents
```

---

## 2. Technology Stack

| Layer | Tech |
|---|---|
| Backend framework | NestJS 10 + Fastify adapter |
| Realtime | SSE (client←server), WS (server→OpenClaw) |
| State bus | Redis Streams (ioredis) |
| FS watcher | `chokidar` |
| Git integration | `simple-git` |
| Process runner | `execa` |
| Config | `@nestjs/config` + `.env` |

---

## 3. TypeScript Interfaces

```typescript
// ── OpenClaw Gateway ──────────────────────────────────────────

/** WS frame types received from OpenClaw Gateway */
export type GWFrameType = "res" | "event";

export interface GWFrame<T = unknown> {
  type: GWFrameType;
  id?: string;
  ok?: boolean;
  event?: string;
  payload?: T;
  seq?: number;
}

export interface GWConnectParams {
  minProtocol: 3;
  maxProtocol: 3;
  client: { id: string; version: string; platform: string; mode: "operator" };
  role: "operator";
  scopes: ["operator.read", "operator.write"];
  auth: { token: string };
  device: { id: string; publicKey: string; signature: string; signedAt: number; nonce: string };
}

/** Streamed agent output delta */
export interface GWAgentDelta {
  sessionKey: string;
  text?: string;
  thinking?: string;
  toolCall?: { name: string; args: unknown };
  toolResult?: { name: string; result: unknown };
  done: boolean;
  stopReason?: string;
}

// ── Gamma OS Session Mapping ──────────────────────────────────

/** One-to-one map: Gamma window ↔ OpenClaw session */
export interface WindowSession {
  windowId: string;      // Zustand window UUID
  appId: string;         // e.g. "terminal", "browser"
  sessionKey: string;    // OpenClaw session key (e.g. "window-abc123")
  agentId: string;       // OpenClaw agent id (e.g. "serhii" or "architect")
  createdAt: number;
  status: "idle" | "running" | "error";
}

// ── SSE Events (NestJS → Browser) ────────────────────────────

export type GammaSSEEvent =
  | { type: "delta";  windowId: string; text: string }
  | { type: "thinking"; windowId: string; thought: string }
  | { type: "done";   windowId: string; stopReason: string }
  | { type: "tool";   windowId: string; name: string; args: unknown }
  | { type: "component_ready"; appId: string; modulePath: string }
  | { type: "error";  windowId: string; message: string };

// ── App Scaffolding ───────────────────────────────────────────

export interface ScaffoldRequest {
  appId: string;         // target app id, e.g. "weather"
  displayName: string;   // window title
  sourceCode: string;    // full .tsx content from agent
  commit: boolean;       // whether to git commit
}

export interface ScaffoldResult {
  ok: boolean;
  filePath: string;      // absolute path to written file
  commitHash?: string;
  modulePath: string;    // relative path for dynamic import
  error?: string;
}

// ── Memory Bus ───────────────────────────────────────────────

export interface MemoryBusEntry {
  id: string;            // Redis Stream message id
  sessionKey: string;
  windowId: string;
  kind: "thought" | "tool_call" | "tool_result" | "text";
  content: string;
  ts: number;
}
```

---

## 4. API Surface

### 4.1 REST / SSE Endpoints

```
POST   /api/sessions          Create window↔session mapping
DELETE /api/sessions/:windowId  Destroy session
POST   /api/sessions/:windowId/send  Send user message to agent
GET    /api/stream/:windowId   SSE stream for window (text/event-stream)
POST   /api/scaffold           Scaffold a new app component
GET    /api/memory-bus         SSE stream of memory bus entries (all windows)
GET    /api/sessions           List active window→session mappings
```

### 4.2 Session Lifecycle

```
Browser opens window "terminal"
  → POST /api/sessions { windowId, appId: "terminal", agentId: "serhii" }
  → NestJS creates OpenClaw session via WS: sessions_spawn or sessions_send
  → Stores WindowSession in Redis Hash  HSET gamma:sessions windowId <json>
  → Returns { sessionKey }

Browser connects SSE
  → GET /api/stream/abc123
  → NestJS subscribes to Redis Stream gamma:sse:abc123
  → Pumps events to browser as text/event-stream

User sends message
  → POST /api/sessions/abc123/send { message }
  → NestJS forwards to OpenClaw via tools/invoke: sessions_send
  → Agent response streams back through WS → Redis → SSE
```

---

## 5. OpenClaw Gateway Connection

### 5.1 WebSocket Client (NestJS Service)

```typescript
// src/gateway/gateway-ws.service.ts
@Injectable()
export class GatewayWsService implements OnModuleInit {
  private ws: WebSocket;

  async onModuleInit() {
    await this.connect();
  }

  private async connect() {
    this.ws = new WebSocket(`ws://localhost:${GW_PORT}`);

    this.ws.on("message", (raw) => this.handleFrame(JSON.parse(raw.toString())));

    // 1. Wait for connect.challenge
    const challenge = await this.waitForEvent("connect.challenge");

    // 2. Sign nonce (Ed25519 keypair stored in .env)
    const signature = await signChallenge(challenge.payload.nonce, DEVICE_PRIVATE_KEY);

    // 3. Handshake
    this.send({
      type: "req", id: ulid(), method: "connect",
      params: {
        minProtocol: 3, maxProtocol: 3,
        client: { id: "gamma-os-bridge", version: "1.0.0", platform: "macos", mode: "operator" },
        role: "operator",
        scopes: ["operator.read", "operator.write"],
        auth: { token: process.env.OPENCLAW_GATEWAY_TOKEN },
        device: {
          id: DEVICE_ID,
          publicKey: DEVICE_PUBLIC_KEY,
          signature,
          signedAt: Date.now(),
          nonce: challenge.payload.nonce,
        },
      },
    });

    // 4. Wait for hello-ok
    await this.waitForResponse();
  }

  /** Invoke a single tool via HTTP (simpler for non-streaming) */
  async invokeTool(tool: string, args: Record<string, unknown>, sessionKey = "main") {
    const res = await fetch(`http://localhost:${GW_PORT}/tools/invoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENCLAW_GATEWAY_TOKEN}`,
      },
      body: JSON.stringify({ tool, args, sessionKey }),
    });
    return res.json();
  }
}
```

### 5.2 Session Spawning

When a window opens, NestJS spawns an isolated OpenClaw session:

```typescript
// For interactive app windows (terminal, browser, etc.)
await gatewayWs.invokeTool("sessions_spawn", {
  task: `You are the ${appId} app in Gamma OS. Await user input.`,
  mode: "session",
  label: `gamma-${windowId}`,
}, "main");
```

The returned `sessionKey` is stored in `gamma:sessions` Redis Hash.

---

## 6. SSE Multiplexer

NestJS aggregates **N agent streams** into per-window SSE pipes via Redis Streams.

```
OpenClaw WS stream (per session)
  ↓
GatewayWsService.handleFrame()
  ↓ XADD gamma:sse:<windowId> * type delta text "..."
Redis Stream gamma:sse:<windowId>
  ↓ XREAD BLOCK 0 STREAMS gamma:sse:<windowId> $
SseController — pumps to browser EventSource
```

```typescript
// src/sse/sse.controller.ts
@Controller("api/stream")
export class SseController {
  constructor(private readonly redis: Redis) {}

  @Sse(":windowId")
  stream(@Param("windowId") windowId: string): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      const streamKey = `gamma:sse:${windowId}`;
      let lastId = "$";

      const poll = async () => {
        const results = await this.redis.xread(
          "BLOCK", 5000, "STREAMS", streamKey, lastId
        );
        if (!results) return poll();

        for (const [, messages] of results) {
          for (const [id, fields] of messages) {
            lastId = id;
            const entry = parseStreamEntry(fields);
            subscriber.next({ data: JSON.stringify(entry) } as MessageEvent);
            if (entry.type === "done") subscriber.complete();
          }
        }
        poll();
      };

      poll();
      return () => subscriber.complete();
    });
  }
}
```

---

## 7. Memory Bus Interception

All "thinking" tokens and tool calls are intercepted and written to `gamma:memory:bus` (separate Redis Stream for observability / AI decision tree UI).

```typescript
// Inside GatewayWsService.handleFrame()
private async handleFrame(frame: GWFrame) {
  if (frame.event !== "agent.delta") return;

  const delta = frame.payload as GWAgentDelta;
  const windowId = this.sessionToWindow.get(delta.sessionKey);
  if (!windowId) return;

  // 1. Push to per-window SSE stream
  const entry: GammaSSEEvent = delta.thinking
    ? { type: "thinking", windowId, thought: delta.thinking }
    : { type: "delta",   windowId, text: delta.text ?? "" };

  await this.redis.xadd(`gamma:sse:${windowId}`, "*", ...flattenEntry(entry));

  // 2. Intercept thought tokens → memory bus
  if (delta.thinking) {
    const mem: MemoryBusEntry = {
      id: ulid(),
      sessionKey: delta.sessionKey,
      windowId,
      kind: "thought",
      content: delta.thinking,
      ts: Date.now(),
    };
    await this.redis.xadd("gamma:memory:bus", "*", ...flattenEntry(mem));
  }

  // 3. Tool calls
  if (delta.toolCall) {
    await this.redis.xadd("gamma:memory:bus", "*", ...flattenEntry({
      id: ulid(), sessionKey: delta.sessionKey, windowId,
      kind: "tool_call", content: JSON.stringify(delta.toolCall), ts: Date.now(),
    }));
  }

  if (delta.done) {
    await this.redis.xadd(`gamma:sse:${windowId}`, "*",
      ...flattenEntry({ type: "done", windowId, stopReason: delta.stopReason ?? "stop" })
    );
  }
}
```

---

## 8. App Scaffolding Pipeline

The **System Architect Agent** (OpenClaw agent id: `architect`) generates new React components and injects them into the live app without rebuilding.

### 8.1 Flow

```
1. User asks: "Build me a Weather app"
2. Architect Agent generates full WeatherApp.tsx source
3. Agent calls POST /api/scaffold { appId:"weather", sourceCode:"..." }
4. NestJS writes file to apps/generated/WeatherApp.tsx
5. NestJS runs: git add && git commit -m "feat: generated WeatherApp"
6. NestJS publishes SSE event: { type:"component_ready", appId:"weather", modulePath:"./apps/generated/WeatherApp" }
7. React frontend does: const mod = await import(modulePath); registers app in registry
8. User opens Weather from Launchpad — no reload needed
```

### 8.2 NestJS Scaffold Service

```typescript
// src/scaffold/scaffold.service.ts
@Injectable()
export class ScaffoldService {
  private readonly appsDir = path.resolve(__dirname, "../../gamma-os/apps/generated");
  private readonly git = simpleGit(path.resolve(__dirname, "../../gamma-os"));

  async scaffold(req: ScaffoldRequest): Promise<ScaffoldResult> {
    // 1. Sanitize appId
    const safeId = req.appId.replace(/[^a-z0-9-]/gi, "");
    const fileName = `${pascal(safeId)}App.tsx`;
    const filePath = path.join(this.appsDir, fileName);

    // 2. Write file
    await fs.mkdir(this.appsDir, { recursive: true });
    await fs.writeFile(filePath, req.sourceCode, "utf8");

    // 3. Git commit
    let commitHash: string | undefined;
    if (req.commit) {
      await this.git.add(filePath);
      const result = await this.git.commit(
        `feat: generated ${req.displayName} app`,
        { "--author": "serhiizghama <zmrser@gmail.com>" }
      );
      commitHash = result.commit;
    }

    // 4. Notify SSE bus
    const modulePath = `./apps/generated/${fileName.replace(".tsx", "")}`;
    await this.redis.xadd("gamma:sse:broadcast", "*",
      ...flattenEntry({ type: "component_ready", appId: safeId, modulePath })
    );

    return { ok: true, filePath, commitHash, modulePath };
  }
}
```

### 8.3 FS Watcher (hot-reload fallback)

```typescript
// src/scaffold/scaffold-watcher.service.ts
@Injectable()
export class ScaffoldWatcherService implements OnModuleInit {
  onModuleInit() {
    chokidar
      .watch(APPS_GENERATED_DIR, { ignoreInitial: true })
      .on("add", (filePath) => this.onNewFile(filePath))
      .on("change", (filePath) => this.onNewFile(filePath));
  }

  private async onNewFile(filePath: string) {
    const appId = path.basename(filePath, "App.tsx").toLowerCase();
    const modulePath = `./apps/generated/${path.basename(filePath, ".tsx")}`;
    await this.redis.xadd("gamma:sse:broadcast", "*",
      ...flattenEntry({ type: "component_ready", appId, modulePath })
    );
  }
}
```

### 8.4 Frontend Dynamic Import (React)

```typescript
// components/WindowNode.tsx — extended app registry
async function loadGeneratedApp(appId: string): Promise<React.ComponentType> {
  try {
    const mod = await import(
      /* @vite-ignore */
      `../apps/generated/${pascal(appId)}App.tsx`
    );
    return mod[`${pascal(appId)}App`];
  } catch {
    return AppPlaceholder;
  }
}
```

---

## 9. Redis Key Schema

| Key | Type | TTL | Description |
|---|---|---|---|
| `gamma:sessions` | Hash | — | windowId → WindowSession JSON |
| `gamma:sse:<windowId>` | Stream | 1h | Per-window SSE event stream |
| `gamma:sse:broadcast` | Stream | 1h | Global events (component_ready, etc.) |
| `gamma:memory:bus` | Stream | 24h | All thought tokens + tool calls |
| `gamma:app:registry` | Hash | — | appId → modulePath (generated apps) |

---

## 10. Environment Variables

```env
# OpenClaw Gateway
OPENCLAW_GATEWAY_URL=ws://localhost:18789
OPENCLAW_GATEWAY_TOKEN=your-token-here

# Device identity (Ed25519 keypair — generate with: openclaw keygen)
GAMMA_DEVICE_ID=gamma-os-bridge-001
GAMMA_DEVICE_PUBLIC_KEY=base64...
GAMMA_DEVICE_PRIVATE_KEY=base64...

# Redis
REDIS_URL=redis://localhost:6379

# Paths
GAMMA_OS_REPO=/Users/sputnik/.openclaw/agents/serhii/projects/gamma-os
GIT_AUTHOR_NAME=serhiizghama
GIT_AUTHOR_EMAIL=zmrser@gmail.com
```

---

## 11. NestJS Module Structure

```
gamma-os-server/
├── src/
│   ├── app.module.ts
│   ├── gateway/
│   │   ├── gateway-ws.service.ts      # WS client to OpenClaw
│   │   └── gateway.module.ts
│   ├── sessions/
│   │   ├── sessions.controller.ts     # POST/DELETE /api/sessions
│   │   ├── sessions.service.ts
│   │   └── sessions.module.ts
│   ├── sse/
│   │   ├── sse.controller.ts          # GET /api/stream/:windowId
│   │   └── sse.module.ts
│   ├── scaffold/
│   │   ├── scaffold.controller.ts     # POST /api/scaffold
│   │   ├── scaffold.service.ts
│   │   ├── scaffold-watcher.service.ts
│   │   └── scaffold.module.ts
│   ├── memory-bus/
│   │   ├── memory-bus.service.ts      # Writes to gamma:memory:bus
│   │   └── memory-bus.module.ts
│   └── redis/
│       └── redis.module.ts            # ioredis provider
├── .env
└── package.json
```

---

## 12. Implementation Order

| Priority | Module | Estimated effort |
|---|---|---|
| P0 | Redis setup + key schema | 0.5 day |
| P0 | GatewayWsService (connect + frame routing) | 1 day |
| P0 | Sessions CRUD + Redis mapping | 0.5 day |
| P0 | SSE multiplexer (per-window stream) | 1 day |
| P1 | Memory bus interception | 0.5 day |
| P1 | Scaffold service + Git integration | 1 day |
| P1 | FS watcher | 0.5 day |
| P2 | Frontend dynamic import registry | 1 day |
| P2 | Memory bus visualization in Gamma OS UI | 1 day |

**Total Phase 2 estimate: ~7 developer-days**
