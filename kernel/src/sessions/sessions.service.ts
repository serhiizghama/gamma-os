import { Injectable, Inject, Logger, ServiceUnavailableException } from '@nestjs/common';
import Redis from 'ioredis';
import { ulid } from 'ulid';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { GatewayWsService } from '../gateway/gateway-ws.service';
import type { WindowSession, CreateSessionDto } from './sessions.interfaces';
import { ToolWatchdogService } from '../gateway/tool-watchdog.service';
import type { AgentStatus, WindowStateSyncSnapshot } from '@gamma/types';

const SESSIONS_KEY = 'gamma:sessions';

/** Flatten an object to [key, value, key, value, ...] for XADD */
function flattenEntry(obj: Record<string, unknown>): string[] {
  const args: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    args.push(k, typeof v === 'string' ? v : JSON.stringify(v));
  }
  return args;
}

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly gatewayWs: GatewayWsService,
    private readonly toolWatchdog: ToolWatchdogService,
  ) {}

  /** Create a new window↔session mapping */
  async create(dto: CreateSessionDto): Promise<WindowSession> {
    const session: WindowSession = {
      windowId: dto.windowId,
      appId: dto.appId,
      sessionKey: dto.sessionKey,
      agentId: dto.agentId,
      createdAt: Date.now(),
      status: 'idle',
    };

    await this.redis.hset(SESSIONS_KEY, dto.windowId, JSON.stringify(session));

    // Keep Gateway's in-memory mapping in sync so events can be routed
    this.gatewayWs.registerWindowSession(dto.sessionKey, dto.windowId);

    return session;
  }

  /** List all active sessions */
  async findAll(): Promise<WindowSession[]> {
    const raw = await this.redis.hgetall(SESSIONS_KEY);
    return Object.values(raw).map(
      (json) => JSON.parse(json) as WindowSession,
    );
  }

  /** Get a session by windowId */
  async findByWindowId(windowId: string): Promise<WindowSession | null> {
    const raw = await this.redis.hget(SESSIONS_KEY, windowId);
    if (!raw) return null;
    return JSON.parse(raw) as WindowSession;
  }

  /** Find a session by OpenClaw sessionKey */
  async findBySessionKey(
    sessionKey: string,
  ): Promise<WindowSession | null> {
    const all = await this.findAll();
    return all.find((s) => s.sessionKey === sessionKey) ?? null;
  }

  /** Update session status in Redis */
  async updateStatus(
    windowId: string,
    status: WindowSession['status'],
  ): Promise<void> {
    const session = await this.findByWindowId(windowId);
    if (!session) return;
    session.status = status;
    await this.redis.hset(
      SESSIONS_KEY,
      windowId,
      JSON.stringify(session),
    );
  }

  /** Abort a running agent session (spec §4.2) */
  async abort(windowId: string): Promise<boolean> {
    const session = await this.findByWindowId(windowId);
    if (!session) return false;

    // Send abort to Gateway
    await this.gatewayWs.abortRun(session.sessionKey);

    // Immediately update Redis state — don't wait for Gateway confirmation
    await this.redis.hset(
      `gamma:state:${windowId}`,
      'status', 'aborted',
      'runId', '',
    );

    // Push aborted lifecycle event to SSE stream
    await this.redis.xadd(
      `gamma:sse:${windowId}`, '*',
      'type', 'lifecycle_error',
      'windowId', windowId,
      'runId', '',
      'message', 'Run aborted by user',
    );

    // Clear watchdog timers for this window
    this.toolWatchdog.clearWindow(windowId);

    return true;
  }

  /** Get F5 recovery snapshot from gamma:state:<windowId> (spec §4.1) */
  async getSyncSnapshot(windowId: string): Promise<WindowStateSyncSnapshot | null> {
    const session = await this.findByWindowId(windowId);
    if (!session) return null;

    const raw = await this.redis.hgetall(`gamma:state:${windowId}`);

    return {
      windowId,
      sessionKey: session.sessionKey,
      status: (raw.status as AgentStatus) ?? 'idle',
      runId: raw.runId || null,
      streamText: raw.streamText || null,
      thinkingTrace: raw.thinkingTrace || null,
      pendingToolLines: raw.pendingToolLines ? (JSON.parse(raw.pendingToolLines) as string[]) : [],
      lastEventAt: raw.lastEventAt ? Number(raw.lastEventAt) : null,
      lastEventId: raw.lastEventId || null,
    };
  }

  // ── v1.6: Send user message to agent ──────────────────────────────────

  async sendMessage(windowId: string, message: string): Promise<boolean> {
    const session = await this.findByWindowId(windowId);
    if (!session) return false;

    const nowMs = Date.now();

    // 1. Echo user message into SSE for instant UI feedback
    await this.redis.xadd(
      `gamma:sse:${windowId}`, '*',
      ...flattenEntry({
        type: 'user_message',
        windowId,
        text: message,
        ts: nowMs,
      }),
    );

    // 2. Write to memory bus for decision tree reconstruction
    await this.redis.xadd(
      'gamma:memory:bus', '*',
      ...flattenEntry({
        id: ulid(),
        sessionKey: session.sessionKey,
        windowId,
        kind: 'text',
        content: message,
        ts: nowMs,
      }),
    );

    // 3. Forward to OpenClaw Gateway (fire-and-forget dispatch)
    const { accepted } = this.gatewayWs.sendMessage(session.sessionKey, message, windowId);
    if (!accepted) {
      await this.redis.xadd(
        `gamma:sse:${windowId}`, '*',
        ...flattenEntry({
          type: 'lifecycle_error',
          windowId,
          runId: '',
          message: 'Gateway not connected — message not sent',
        }),
      );
      throw new ServiceUnavailableException('OpenClaw Gateway not connected');
    }

    // 4. Update lastEventAt for GC freshness tracking
    await this.redis.hset(`gamma:state:${windowId}`, 'lastEventAt', String(nowMs));

    return true;
  }

  /** Remove a session mapping (v1.6: explicit Gateway kill) */
  async remove(windowId: string): Promise<boolean> {
    const existing = await this.findByWindowId(windowId);
    if (!existing) return false;

    // 1. Kill the Gateway session to free LLM context memory
    try {
      await this.gatewayWs.deleteSession(existing.sessionKey);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to kill Gateway session ${existing.sessionKey}: ${msg}`);
    }

    // 2. Clean up Redis
    await this.redis.hdel(SESSIONS_KEY, windowId);
    await this.redis.del(`gamma:sse:${windowId}`);
    await this.redis.del(`gamma:state:${windowId}`);

    // 3. Clear watchdog timers
    this.toolWatchdog.clearWindow(windowId);

    // 4. Unregister from in-memory routing
    this.gatewayWs.unregisterWindowSession(existing.sessionKey);

    this.logger.log(`Removed session ${windowId} (sessionKey=${existing.sessionKey})`);
    return true;
  }
}
