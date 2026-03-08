# Gamma OS — Phase 1 Technical Specification & PRD

---

## 1. Architecture Overview & User Flow

### High-Level System Design

```
┌─────────────────────────────────────────────────────────┐
│                     Browser (Client)                     │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │                  <GammaOS />                     │   │
│  │  ┌─────────────┐  ┌──────────────────────────┐  │   │
│  │  │  <Desktop /> │  │    <WindowManager />     │  │   │
│  │  │  background  │  │  [WindowNode] × N        │  │   │
│  │  │  wallpaper   │  │  each: ErrorBoundary     │  │   │
│  │  └─────────────┘  └──────────────────────────┘  │   │
│  │  ┌─────────────────────────────────────────────┐ │   │
│  │  │              <Launchpad />                  │ │   │
│  │  │         (mounted, visibility toggled)        │ │   │
│  │  └─────────────────────────────────────────────┘ │   │
│  │  ┌─────────────────────────────────────────────┐ │   │
│  │  │    <Dock />  +  <NotificationCenter />      │ │   │
│  │  └─────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│         Zustand Store (OS Kernel State)                  │
└───────────────────────────┬─────────────────────────────┘
                            │ SSE  /api/v1/system/events
                            │ REST /api/v1/apps
┌───────────────────────────▼─────────────────────────────┐
│                    Node.js Backend                        │
│  Express / Fastify + Redis Streams                       │
└──────────────┬──────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────┐
│                       Redis                              │
│  Stream key: gamma:system:events                         │
│  XADD → auto-ID, XREAD → fan-out, MAXLEN → auto-prune   │
└─────────────────────────────────────────────────────────┘
```

### Phase 1 User Interaction Flow

1. **Boot** → `<GammaOS />` mounts, Zustand store initializes, SSE connection opens with `Last-Event-ID` header
2. **Desktop renders** → wallpaper visible, Dock anchored bottom, `<Launchpad />` mounted but `visibility: hidden`
3. **User clicks "Apps"** → `launchpadOpen = true` → desktop dims, Launchpad grid fades in
4. **User clicks app icon** → `openWindow(appId)` → `WindowNode` added, `focusedWindowId` set
5. **User drags TitleBar** → `pointermove` → local Ref + RAF (no Zustand). On `pointerup` → single `updateWindowPosition`
6. **User resizes window** → drag resize handle → local Ref + RAF updates CSS vars. On `pointerup` → single `updateWindowDimensions`
7. **User minimizes** → `isMinimized: true`, component stays mounted, `visibility: hidden`
8. **SSE event** → Redis Stream → Node.js → client toast → click → `focusWindow(id)`
9. **Window closes** → app component `useEffect` cleanup fires → WebSocket closed, intervals cleared, WebGL destroyed → `delete state.windows[id]`
10. **Window crashes** → `ErrorBoundary` catches, fallback renders, OS kernel alive

---

## 2. UI/UX & CSS Architecture

### Core Design Tokens (CSS Variables)

```css
:root {
  /* Glass morphism */
  --glass-bg: rgba(30, 30, 32, 0.72);
  --glass-border: rgba(255, 255, 255, 0.08);
  --glass-blur: blur(20px) saturate(180%);
  --glass-shadow: 0 22px 70px rgba(0, 0, 0, 0.56);

  /* macOS window chrome */
  --window-bg: rgba(28, 28, 30, 0.85);
  --window-titlebar-height: 28px;
  --window-radius: 12px;
  --window-border: 1px solid rgba(255, 255, 255, 0.06);
  --window-min-width: 320px;
  --window-min-height: 200px;

  /* Dock */
  --dock-bg: rgba(255, 255, 255, 0.12);
  --dock-blur: blur(24px) saturate(200%);
  --dock-radius: 18px;
  --dock-icon-size: 56px;
  --dock-padding: 8px 12px;

  /* Typography */
  --font-system: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif;
  --text-primary: rgba(255, 255, 255, 0.92);
  --text-secondary: rgba(255, 255, 255, 0.48);

  /* Notifications */
  --notif-bg: rgba(44, 44, 46, 0.9);
  --notif-radius: 14px;
  --notif-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);

  /* Traffic lights */
  --btn-close: #ff5f57;
  --btn-minimize: #febc2e;
  --btn-maximize: #28c840;

  /* Motion */
  --spring-fast: cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-smooth: cubic-bezier(0.25, 0.46, 0.45, 0.94);
  --duration-fast: 180ms;
  --duration-normal: 280ms;
  --duration-slow: 420ms;
}
```

### Animation Strategy (Zero Layout Thrashing)

**Rule:** Only animate `transform` and `opacity`. Never `width`, `height`, `top`, `left`.

```css
@keyframes windowOpen {
  from { opacity: 0; transform: scale(0.92) translateY(8px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}

@keyframes windowMinimize {
  to { opacity: 0; transform: scale(0.08) translate(var(--dock-target-x), var(--dock-target-y)); }
}

.window {
  position: absolute;
  width: var(--win-w);
  height: var(--win-h);
  transform: translate(var(--win-x, 0px), var(--win-y, 0px));
  will-change: transform, opacity;
  animation: windowOpen var(--duration-normal) var(--spring-fast) forwards;
}

.window--minimized {
  visibility: hidden;
  pointer-events: none;
}

.desktop--launchpad-open {
  backdrop-filter: blur(20px) brightness(0.7);
  transition: backdrop-filter var(--duration-normal) var(--ease-smooth);
}
```

### Drag & Drop — Two-Phase (No Zustand during motion)

```
pointermove → RAF → el.style.setProperty('--win-x', x)  ← 0 React re-renders
pointerup   → updateWindowPosition(id, {x, y})           ← 1 Zustand write
```

### Window Resize — Two-Phase (Same pattern as drag)

```
pointermove → RAF → el.style.setProperty('--win-w', w)  ← 0 React re-renders
                    el.style.setProperty('--win-h', h)
pointerup   → updateWindowDimensions(id, {width, height}) ← 1 Zustand write
```

---

## 3. React Component Architecture

```
<GammaOS />                              # Root kernel. SSE hook. OS-level ErrorBoundary.
├── <Desktop />                          # Wallpaper. Launchpad blur class.
├── <Launchpad />                        # Always mounted. visibility toggled.
│   └── <AppIcon /> × N                 # onClick → openWindow(appId)
├── <WindowManager />                    # Maps store.windows → WindowNode. Pure renderer.
│   └── <ErrorBoundary key={id}>        # Per-window. Resets on re-open via key.
│       └── <WindowNode id={id} />      # Drag, resize, focus. CSS vars via local Ref.
│           ├── <TitleBar />            # Traffic lights. Drag handle (onPointerDown).
│           ├── <AppContent appId />    # Dynamic import. MUST implement cleanup contract.
│           └── <ResizeHandles />       # 8 handles (N/S/E/W + corners). Each onPointerDown.
├── <Dock />                             # Fixed bottom. Icons + minimized slots.
│   ├── <DockIcon appId />
│   └── <DockMinimizedSlot id />        # onClick → focusWindow(id)
└── <NotificationCenter />               # SSE toast queue.
    └── <ToastNotification />
```

### Single Responsibility

| Component | Responsibility |
|---|---|
| `<GammaOS />` | SSE init, global keyboard shortcuts (Esc), OS-level ErrorBoundary |
| `<Desktop />` | Wallpaper render, launchpad overlay class |
| `<Launchpad />` | App grid, visibility toggle, outside-click dismiss |
| `<WindowManager />` | Map store.windows → components, nothing else |
| `<ErrorBoundary />` | Catch render errors, render fallback |
| `<WindowNode />` | Drag + resize via local refs, click-to-focus |
| `<TitleBar />` | Traffic light buttons, drag initiation |
| `<ResizeHandles />` | 8 resize handles, resize initiation |
| `<AppContent />` | Dynamic app import, **owns cleanup contract** |
| `<Dock />` | Icon rendering, magnification, minimized slots |
| `<NotificationCenter />` | SSE event → toast queue |

### Focus detection — zero N re-renders

```typescript
// Inside <WindowNode id={id} />
const isFocused = useOSStore(s => s.focusedWindowId === id);
// Re-renders ONLY when this specific window's focus changes
```

---

## 4. Global State Management (Zustand & TypeScript)

### TypeScript Interfaces

```typescript
// types/os.ts

export interface WindowCoordinates {
  x: number;
  y: number;
}

export interface WindowDimensions {
  width: number;
  height: number;
}

export interface WindowNode {
  id: string;                      // uuid v4
  appId: string;
  title: string;
  coordinates: WindowCoordinates;
  dimensions: WindowDimensions;
  zIndex: number;
  isMinimized: boolean;
  isMaximized: boolean;
  // ❌ NO isFocused here — was causing O(N) re-renders
  prevCoordinates?: WindowCoordinates;
  prevDimensions?: WindowDimensions;
  openedAt: number;
}

export interface Notification {
  id: string;
  appId: string;
  title: string;
  body: string;
  timestamp: number;
  read: boolean;
}

export interface OSStore {
  windows: Record<string, WindowNode>;
  zIndexCounter: number;
  focusedWindowId: string | null;   // ✅ scalar — O(1) focus, O(1) re-render

  launchpadOpen: boolean;
  notifications: Notification[];
  toastQueue: Notification[];

  openWindow: (appId: string, title: string) => void;
  closeWindow: (id: string) => void;
  minimizeWindow: (id: string) => void;
  focusWindow: (id: string) => void;
  maximizeWindow: (id: string) => void;
  updateWindowPosition: (id: string, coords: WindowCoordinates) => void;  // pointerup only
  updateWindowDimensions: (id: string, dims: WindowDimensions) => void;   // pointerup only

  toggleLaunchpad: () => void;
  closeLaunchpad: () => void;

  pushNotification: (n: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  dismissToast: (id: string) => void;
}
```

### Zustand Store

```typescript
// store/useOSStore.ts
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { v4 as uuid } from 'uuid';

const INITIAL_Z = 100;

export const useOSStore = create<OSStore>()(
  immer((set) => ({
    windows: {},
    zIndexCounter: INITIAL_Z,
    focusedWindowId: null,
    launchpadOpen: false,
    notifications: [],
    toastQueue: [],

    openWindow: (appId, title) => set(state => {
      const id = uuid();
      const z = state.zIndexCounter + 1;
      state.windows[id] = {
        id, appId, title,
        coordinates: { x: 120 + Math.random() * 80, y: 80 + Math.random() * 40 },
        dimensions: { width: 800, height: 560 },
        zIndex: z,
        isMinimized: false,
        isMaximized: false,
        openedAt: Date.now(),
      };
      state.zIndexCounter = z;
      state.focusedWindowId = id;
    }),

    closeWindow: (id) => set(state => {
      delete state.windows[id];
      if (state.focusedWindowId === id) {
        const remaining = Object.values(state.windows)
          .filter(w => !w.isMinimized)
          .sort((a, b) => b.zIndex - a.zIndex);
        state.focusedWindowId = remaining[0]?.id ?? null;
      }
    }),

    minimizeWindow: (id) => set(state => {
      if (!state.windows[id]) return;
      state.windows[id].isMinimized = true;
      if (state.focusedWindowId === id) {
        const remaining = Object.values(state.windows)
          .filter(w => !w.isMinimized && w.id !== id)
          .sort((a, b) => b.zIndex - a.zIndex);
        state.focusedWindowId = remaining[0]?.id ?? null;
      }
    }),

    focusWindow: (id) => set(state => {
      if (!state.windows[id]) return;
      const z = state.zIndexCounter + 1;
      state.windows[id].isMinimized = false;
      state.windows[id].zIndex = z;
      state.zIndexCounter = z;
      state.focusedWindowId = id;
    }),

    maximizeWindow: (id) => set(state => {
      const w = state.windows[id];
      if (!w) return;
      if (w.isMaximized) {
        w.coordinates = w.prevCoordinates ?? w.coordinates;
        w.dimensions = w.prevDimensions ?? w.dimensions;
        w.isMaximized = false;
      } else {
        w.prevCoordinates = { ...w.coordinates };
        w.prevDimensions = { ...w.dimensions };
        w.coordinates = { x: 0, y: 0 };
        w.dimensions = { width: window.innerWidth, height: window.innerHeight };
        w.isMaximized = true;
      }
    }),

    // ⚠️ ONLY called on pointerup — never on pointermove
    updateWindowPosition: (id, coords) => set(state => {
      if (state.windows[id]) state.windows[id].coordinates = coords;
    }),

    // ⚠️ ONLY called on pointerup — never on pointermove
    updateWindowDimensions: (id, dims) => set(state => {
      if (state.windows[id]) state.windows[id].dimensions = dims;
    }),

    toggleLaunchpad: () => set(state => { state.launchpadOpen = !state.launchpadOpen; }),
    closeLaunchpad: () => set(state => { state.launchpadOpen = false; }),

    pushNotification: (n) => set(state => {
      const notif: Notification = { ...n, id: uuid(), timestamp: Date.now(), read: false };
      state.notifications.unshift(notif);
      state.toastQueue.push(notif);
    }),

    dismissToast: (id) => set(state => {
      state.toastQueue = state.toastQueue.filter(t => t.id !== id);
    }),
  }))
);
```

### Window Resize Implementation

```typescript
// Inside <ResizeHandles /> — same two-phase pattern as drag
type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const onResizePointerDown = (edge: ResizeEdge) => (e: React.PointerEvent) => {
  e.stopPropagation(); // prevent drag from firing
  const w = windows[id];
  const initW = w.dimensions.width;
  const initH = w.dimensions.height;
  const initX = w.coordinates.x;
  const initY = w.coordinates.y;
  const startX = e.clientX;
  const startY = e.clientY;

  const onMove = (ev: PointerEvent) => {
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;

    let newW = initW, newH = initH, newX = initX, newY = initY;

    if (edge.includes('e')) newW = Math.max(320, initW + dx);
    if (edge.includes('s')) newH = Math.max(200, initH + dy);
    if (edge.includes('w')) { newW = Math.max(320, initW - dx); newX = initX + (initW - newW); }
    if (edge.includes('n')) { newH = Math.max(200, initH - dy); newY = initY + (initH - newH); }

    // DOM-only during resize — zero React
    requestAnimationFrame(() => {
      nodeRef.current!.style.setProperty('--win-w', `${newW}px`);
      nodeRef.current!.style.setProperty('--win-h', `${newH}px`);
      nodeRef.current!.style.setProperty('--win-x', `${newX}px`);
      nodeRef.current!.style.setProperty('--win-y', `${newY}px`);
    });
  };

  const onUp = (ev: PointerEvent) => {
    window.removeEventListener('pointermove', onMove);
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    // Single Zustand write to persist
    let newW = initW, newH = initH, newX = initX, newY = initY;
    if (edge.includes('e')) newW = Math.max(320, initW + dx);
    if (edge.includes('s')) newH = Math.max(200, initH + dy);
    if (edge.includes('w')) { newW = Math.max(320, initW - dx); newX = initX + (initW - newW); }
    if (edge.includes('n')) { newH = Math.max(200, initH - dy); newY = initY + (initH - newH); }
    updateWindowDimensions(id, { width: newW, height: newH });
    updateWindowPosition(id, { x: newX, y: newY });
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp, { once: true });
};
```

### Re-render Guarantee

| Action | Windows that re-render |
|---|---|
| `openWindow` | 1 new window |
| `focusWindow(id)` | 1 (zIndex) |
| `pointermove` drag | 0 — DOM only |
| `pointerup` drag | 1 (coordinates) |
| `pointermove` resize | 0 — DOM only |
| `pointerup` resize | 1 (dimensions) |
| `pushNotification` | 0 windows |

---

## 5. Fault Tolerance & Lifecycle Management

### Error Boundary

```typescript
// components/WindowErrorBoundary.tsx
import { Component, ErrorInfo, ReactNode } from 'react';

interface Props { windowId: string; appId: string; children: ReactNode; }
interface State { hasError: boolean; error?: Error; }

export class WindowErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[GammaOS] Window ${this.props.windowId} crashed:`, error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="window-crash-fallback">
          <span>⚠️</span>
          <p>{this.props.appId} crashed</p>
          <p>{this.state.error?.message}</p>
          <button onClick={() => this.setState({ hasError: false })}>Restart</button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

### Minimized Window Lifecycle

```
OPEN      → mounted, visible,  pointer-events: auto
MINIMIZED → mounted, hidden,   pointer-events: none   (visibility: hidden)
CLOSED    → cleanup fires → unmounted → removed from store
```

### [FIX #2] App Cleanup Contract — Mandatory

**Every `<AppContent />` component MUST implement cleanup on unmount.** This is a hard architectural rule, not optional.

When `closeWindow(id)` fires:
1. Zustand removes window from store
2. React unmounts `<WindowNode />` → `<AppContent />`
3. `useEffect` cleanup fires — **this is the only guarantee against zombie processes**

Without explicit cleanup: WebSocket stays open, `setInterval` keeps firing, WebGL context stays allocated. These are invisible memory leaks.

**Mandatory pattern for every app component:**

```typescript
// Every app component MUST follow this pattern
export function AgentMonitorApp() {
  const wsRef = useRef<WebSocket | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);

  useEffect(() => {
    // Init connections
    wsRef.current = new WebSocket('wss://...');
    intervalRef.current = setInterval(tick, 1000);

    // ✅ MANDATORY cleanup — fires on closeWindow → unmount
    return () => {
      wsRef.current?.close();
      if (intervalRef.current) clearInterval(intervalRef.current);
      // WebGL context: lose it explicitly to free GPU memory
      glRef.current?.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, []);
}
```

**Enforcement:** Code review gate — PRs adding new app components must include cleanup block or be rejected.

### [NOTE] Security & Sandboxing Roadmap

**Phase 1 (current):** All apps run in the same JS thread as the OS kernel. Acceptable because all app code is first-party and trusted. Apps have access to `window` and `useOSStore.getState()` — this is a known tradeoff.

**Phase 2 (future — third-party or autonomous AI agents):** Must migrate to isolated execution:

```
Option A: <iframe sandbox="allow-scripts allow-same-origin">
  - Full DOM isolation
  - Communication via postMessage with typed message schema
  - OS kernel is not reachable from iframe context

Option B: Web Workers
  - No DOM access (safe for logic-only agents)
  - OffscreenCanvas for WebGL rendering
  - postMessage for bidirectional communication
  - Shared state via SharedArrayBuffer (requires COOP/COEP headers)
```

This is a Phase 2 concern. Phase 1 implementation proceeds with same-thread execution.

---

## 6. Backend Contracts — Redis Streams

### [FIX #3] Redis Streams Replace ZSET + Pub/Sub

**Previous pattern (eliminated):**
- `ZSET` for event log + manual `ZREMRANGEBYSCORE` on every write → O(log N) write + cleanup overhead at high RPS
- `Pub/Sub` for fan-out → no persistence, message lost if subscriber not connected at publish time

**Redis Streams — designed exactly for this:**
- `XADD gamma:system:events MAXLEN ~ 10000 * field value` — appends event, auto-generates monotonic ID, auto-prunes to 10k entries in one atomic command
- `XREAD COUNT 100 STREAMS gamma:system:events lastId` — replay missed events using stream ID as cursor (native `Last-Event-ID` equivalent)
- No separate Pub/Sub channel needed — stream acts as both persistent log and delivery mechanism

```
XADD gamma:system:events MAXLEN ~ 10000 * type notification payload {...}
  → returns: "1709123456789-0"  (millisecond timestamp + sequence = monotonic ID)
  → auto-prunes stream to ~10000 entries (~ = approximate, more efficient)
  → all XREAD consumers receive it

XREAD BLOCK 0 COUNT 10 STREAMS gamma:system:events 1709123456000-0
  → returns all entries after given ID
  → BLOCK 0 = wait indefinitely (long-poll style, perfect for SSE)
```

### Node.js SSE Implementation (Redis Streams)

```typescript
// events/systemBus.ts
import { createClient } from 'redis';

const writeClient  = createClient({ url: process.env.REDIS_URL });
const readClient   = createClient({ url: process.env.REDIS_URL }); // blocking reads need own client

await Promise.all([writeClient.connect(), readClient.connect()]);

const STREAM_KEY = 'gamma:system:events';
const STREAM_MAXLEN = 10_000;

export interface SSEPayload {
  type: 'notification' | 'agent_status' | 'system_alert';
  data: object;
}

// Emit from anywhere in backend — cluster-safe, no INCR needed (stream auto-IDs)
export async function emitSystemEvent(payload: SSEPayload): Promise<string> {
  const id = await writeClient.xAdd(
    STREAM_KEY,
    '*',                          // auto-generate ID (timestamp-based, monotonic)
    { type: payload.type, data: JSON.stringify(payload.data) },
    { TRIM: { strategy: 'MAXLEN', strategyModifier: '~', threshold: STREAM_MAXLEN } }
  );
  return id; // e.g. "1709123456789-0"
}
```

```typescript
// routes/events.ts
app.get('/api/v1/system/events', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Last-Event-ID from browser header = last Redis Stream ID seen by client
  // On fresh connect: '0-0' (read from beginning of available log)
  // On reconnect: browser sends last received ID automatically
  let lastId = (req.headers['last-event-id'] as string) || '0-0';

  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000);

  // Each SSE connection gets its own blocking read loop
  const readerClient = readClient.duplicate();
  await readerClient.connect();

  let active = true;

  req.on('close', async () => {
    active = false;
    clearInterval(heartbeat);
    await readerClient.disconnect();
  });

  // Blocking read loop — XREAD BLOCK waits for new entries, no polling
  while (active) {
    const results = await readerClient.xRead(
      [{ key: STREAM_KEY, id: lastId }],
      { COUNT: 100, BLOCK: 25_000 } // 25s block timeout matches heartbeat
    );

    if (!results || !active) continue;

    for (const stream of results) {
      for (const entry of stream.messages) {
        const { type, data } = entry.message;
        res.write(`id: ${entry.id}\n`);
        res.write(`event: ${type}\n`);
        res.write(`data: ${data}\n\n`);
        lastId = entry.id; // advance cursor
      }
    }
  }
});
```

### Why This Works Across Instances

| Scenario | Old (ZSET+PubSub) | New (Redis Streams) |
|---|---|---|
| Server restart | ❌ eventLog lost | ✅ stream persists |
| PM2 cluster | ❌ split-brain Pub/Sub | ✅ all read from same stream |
| K8s rolling deploy | ❌ missed events | ✅ `Last-Event-ID` = stream cursor |
| High RPS cleanup | ❌ `ZREMRANGEBYSCORE` on every write | ✅ `MAXLEN ~` in XADD, amortized |
| New subscriber joins late | ❌ Pub/Sub = lost | ✅ XREAD from any past ID |

### GET `/api/v1/apps`

```typescript
interface InstalledApp {
  id: string;
  name: string;
  icon: string;
  version: string;
  category: 'system' | 'agent' | 'utility';
  singleton: boolean;
}

interface AppsResponse {
  apps: InstalledApp[];
  schema_version: 1;
}
```

### SSE Event Payloads

```typescript
interface NotificationPayload {
  appId: string;
  title: string;
  body: string;
  priority: 'low' | 'normal' | 'high';
}

// Wire format (Redis Stream entry → SSE):
// id: 1709123456789-0
// event: notification
// data: {"appId":"agent-monitor","title":"Agent done","body":"3.2s","priority":"normal"}
```

### Client-Side SSE

```typescript
// hooks/useSystemEvents.ts
export function useSystemEvents() {
  const pushNotification = useOSStore(s => s.pushNotification);

  useEffect(() => {
    const connect = () => {
      // Browser auto-sends Last-Event-ID on reconnect
      // Value = last Redis Stream ID — backend uses it as XREAD cursor
      const es = new EventSource('/api/v1/system/events');

      es.addEventListener('notification', (e: MessageEvent) => {
        const payload: NotificationPayload = JSON.parse(e.data);
        pushNotification({ appId: payload.appId, title: payload.title, body: payload.body });
      });

      es.onerror = () => {
        es.close();
        setTimeout(connect, 3_000);
      };

      return es;
    };

    const es = connect();
    return () => es.close();
  }, []);
}
```

---

## Architectural Decision Log

| # | Decision | Rationale |
|---|---|---|
| 1 | `focusedWindowId` scalar in store | Eliminates O(N) re-renders on focus change |
| 2 | Drag + Resize via local Ref + RAF; Zustand only on `pointerup` | Guarantees 60fps, zero React involvement during motion |
| 3 | Redis Streams (`XADD MAXLEN`) replaces ZSET + Pub/Sub | Single structure for both persistence and fan-out; `MAXLEN ~` auto-prunes; cursor-based replay |
| 4 | `visibility: hidden` for minimized windows | Preserves WebSocket, WebGL, local state — no remount cost |
| 5 | ErrorBoundary `key={windowId}` | Auto-reset on re-open, no stale error state |
| 6 | Mandatory cleanup contract in every `<AppContent />` | Prevents zombie WebSockets, intervals, and WebGL contexts on window close |
| 7 | Phase 1 same-thread execution; Phase 2 iframe/Worker sandbox | Pragmatic for first-party apps; isolation deferred to when third-party agents exist |
| 8 | 8-handle resize (`n/s/e/w/ne/nw/se/sw`) | Full OS-grade window resizing from any edge or corner |

---

*Gamma OS Phase 1 Spec v3 — revised 2026-03-08*
