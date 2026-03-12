import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AgentStatus } from "@gamma/types";
import { useThrottledValue } from "../hooks/useThrottledValue";

// ── Types ─────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  thinking?: string;
  toolCalls?: ToolCallEntry[];
  ts: number;
}

export interface ToolCallEntry {
  name: string;
  args?: string;
  result?: string;
  isError?: boolean;
}

interface MessageListProps {
  messages: ChatMessage[];
  pendingToolLines: string[];
  accentColor: string;
  status: AgentStatus;
}

// ── Helpers ───────────────────────────────────────────────────────────────

const MAX_TOOL_LEN = 64;

function isAllowedImageSrc(src: string | undefined): boolean {
  if (!src || typeof src !== "string") return false;
  const s = src.trim().toLowerCase();
  return s.startsWith("https://") || s.startsWith("http://") || s.startsWith("data:image/");
}

function truncate(str: string, max = MAX_TOOL_LEN): string {
  return str.length <= max ? str : str.slice(0, max) + "… (truncated)";
}

// ── Avatar ────────────────────────────────────────────────────────────────

function Avatar({ role }: { role: "user" | "assistant" }): React.ReactElement {
  const isUser = role === "user";
  return (
    <div
      style={{
        width: 26,
        height: 26,
        borderRadius: "50%",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: isUser ? 11 : 12,
        fontWeight: 700,
        marginTop: 2,
        background: isUser
          ? "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)"
          : "rgba(59,130,246,0.12)",
        border: isUser
          ? "none"
          : "1px solid rgba(59,130,246,0.25)",
        color: isUser ? "#fff" : "rgba(96,165,250,0.9)",
        userSelect: "none",
        letterSpacing: isUser ? 0 : "0.02em",
      }}
    >
      {isUser ? "U" : "γ"}
    </div>
  );
}

// ── Thinking Block ────────────────────────────────────────────────────────

function ThinkingBlock({ text }: { text: string }): React.ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      style={{
        marginBottom: 8,
        padding: "6px 10px",
        background: "rgba(0,0,0,0.25)",
        borderRadius: 6,
        border: "1px solid rgba(255,255,255,0.06)",
        fontSize: 12,
        color: "var(--color-text-secondary)",
      }}
    >
      <summary
        style={{
          cursor: "pointer",
          userSelect: "none",
          fontFamily: "'SF Mono', 'Fira Code', monospace",
          fontSize: 11,
          color: "var(--color-text-secondary)",
          listStyle: "none",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span style={{ opacity: 0.7 }}>💭</span>
        <span>Thinking</span>
      </summary>
      <pre
        style={{
          marginTop: 6,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          fontFamily: "'SF Mono', 'Fira Code', monospace",
          fontSize: 11,
          lineHeight: 1.5,
          color: "var(--color-text-secondary)",
          userSelect: "text",
        }}
      >
        {text}
      </pre>
    </details>
  );
}

// ── Safe Image ────────────────────────────────────────────────────────────

function SafeMarkdownImage({
  src,
  alt,
  ...props
}: React.ImgHTMLAttributes<HTMLImageElement>): React.ReactElement | null {
  if (!isAllowedImageSrc(src)) return null;
  return (
    <img
      {...props}
      src={src}
      alt={alt ?? ""}
      className="agent-chat-markdown-img"
      loading="lazy"
    />
  );
}

// ── Code Block ────────────────────────────────────────────────────────────

function CodeBlockWithCopy({
  children,
  ...preProps
}: React.ComponentPropsWithoutRef<"pre">): React.ReactElement {
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleCopy = async () => {
    const codeEl = containerRef.current?.querySelector("code");
    const text = codeEl?.textContent?.trim() ?? "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isBlockCode = React.Children.toArray(children).some(
    (c) => typeof c === "object" && c !== null && (c as React.ReactElement).type === "code",
  );

  return (
    <div className="agent-chat-code-block" ref={containerRef}>
      {isBlockCode && (
        <button
          type="button"
          className="agent-chat-code-copy"
          onClick={handleCopy}
          aria-label={copied ? "Copied" : "Copy"}
          title={copied ? "Copied!" : "Copy"}
        >
          {copied ? "✓" : "⎘"}
        </button>
      )}
      <pre {...preProps}>{children}</pre>
    </div>
  );
}

// ── Tool Call Line ────────────────────────────────────────────────────────

function ToolCallLine({ entry }: { entry: ToolCallEntry }): React.ReactElement {
  if (entry.result !== undefined) {
    const icon = entry.isError ? "❌" : "✅";
    return (
      <div
        style={{
          fontFamily: "'SF Mono', 'Fira Code', monospace",
          fontSize: 11,
          color: entry.isError ? "var(--color-accent-error)" : "var(--color-text-secondary)",
          padding: "2px 0",
        }}
      >
        {icon} {entry.name} → {truncate(entry.result)}
      </div>
    );
  }
  return (
    <div
      style={{
        fontFamily: "'SF Mono', 'Fira Code', monospace",
        fontSize: 11,
        color: "var(--color-accent-primary)",
        padding: "2px 0",
      }}
    >
      🔧 {entry.name}({entry.args ? truncate(entry.args) : ""})
    </div>
  );
}

// ── Typing indicator ──────────────────────────────────────────────────────

function TypingDots(): React.ReactElement {
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center", height: 18, padding: "0 4px" }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: "rgba(96,165,250,0.7)",
            display: "inline-block",
            animation: `typingBounce 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

// ── Message Bubble ────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  status,
  isStreaming,
}: {
  msg: ChatMessage;
  accentColor: string;
  status: AgentStatus;
  isStreaming: boolean;
}): React.ReactElement {
  const isUser = msg.role === "user";

  const throttledText = useThrottledValue(msg.text, 500, status);
  const displayText = isStreaming ? throttledText : msg.text;

  const timeStr = new Date(msg.ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: isUser ? "row-reverse" : "row",
        alignItems: "flex-start",
        gap: 8,
        marginBottom: 14,
      }}
    >
      <Avatar role={msg.role} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: isUser ? "flex-end" : "flex-start",
          maxWidth: "82%",
          gap: 3,
        }}
      >
        {/* Bubble */}
        <div
          className="agent-chat-bubble"
          style={{
            padding: "9px 13px",
            borderRadius: isUser ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
            ...(isUser
              ? {
                  background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
                  color: "#ffffff",
                  boxShadow: "0 2px 12px rgba(37,99,235,0.35), 0 1px 3px rgba(0,0,0,0.3)",
                  border: "none",
                }
              : {
                  background: "rgba(10, 16, 34, 0.82)",
                  color: "var(--color-text-primary)",
                  border: "1px solid rgba(59,130,246,0.14)",
                  boxShadow:
                    "0 2px 16px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)",
                  borderLeft: "2px solid rgba(59,130,246,0.35)",
                }),
            fontFamily: "var(--font-system)",
            fontSize: 13,
            lineHeight: 1.65,
            wordBreak: "break-word",
          }}
        >
          {msg.thinking && <ThinkingBlock text={msg.thinking} />}
          {msg.toolCalls?.map((tc, i) => (
            <ToolCallLine key={`${msg.id}-tool-${i}`} entry={tc} />
          ))}

          {isUser ? (
            <span style={{ userSelect: "text" }}>{msg.text}</span>
          ) : (
            <div className="agent-chat-markdown">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{ pre: CodeBlockWithCopy, img: SafeMarkdownImage }}
              >
                {displayText}
              </ReactMarkdown>
              {isStreaming && !displayText && <TypingDots />}
            </div>
          )}
        </div>

        {/* Timestamp */}
        <span
          style={{
            fontSize: 10,
            color: "rgba(148,163,184,0.45)",
            letterSpacing: "0.02em",
            paddingLeft: isUser ? 0 : 4,
            paddingRight: isUser ? 4 : 0,
          }}
        >
          {timeStr}
        </span>
      </div>
    </div>
  );
}

// ── Pending tool lines (live stream) ─────────────────────────────────────

function PendingTools({ lines }: { lines: string[] }): React.ReactElement {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "flex-start",
        marginBottom: 14,
      }}
    >
      <Avatar role="assistant" />
      <div
        style={{
          padding: "9px 13px",
          background: "rgba(10,16,34,0.82)",
          border: "1px solid rgba(59,130,246,0.14)",
          borderLeft: "2px solid rgba(59,130,246,0.35)",
          borderRadius: "4px 16px 16px 16px",
          boxShadow: "0 2px 16px rgba(0,0,0,0.45)",
        }}
      >
        {lines.map((line, i) => (
          <div
            key={i}
            style={{
              fontFamily: "'SF Mono', 'Fira Code', monospace",
              fontSize: 11,
              color: "var(--color-accent-primary)",
              padding: "1px 0",
            }}
          >
            {line}
          </div>
        ))}
        <TypingDots />
      </div>
    </div>
  );
}

// ── MessageList ───────────────────────────────────────────────────────────

export function MessageList({
  messages,
  pendingToolLines,
  accentColor,
  status,
}: MessageListProps): React.ReactElement {
  const bottomRef = useRef<HTMLDivElement>(null);

  const lastAssistantIndex = messages.reduce<number>(
    (idx, msg, index) => (msg.role === "assistant" ? index : idx),
    -1,
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pendingToolLines]);

  return (
    <>
      {/* Keyframes injected once */}
      <style>{`
        @keyframes typingBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
          30% { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>

      <div
        className="agent-chat-message-list"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
          padding: "16px 14px",
          display: "flex",
          flexDirection: "column",
          color: "var(--color-text-primary)",
          // Darker than the wrapper — creates clear depth hierarchy
          background: "#07101e",
          // Subtle dot texture
          backgroundImage: `
            radial-gradient(circle, rgba(59,130,246,0.08) 1px, transparent 1px),
            url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><text x="50%25" y="50%25" font-family="system-ui" font-weight="800" font-size="14" fill="rgba(59,130,246,0.03)" transform="rotate(-38 80 80)" text-anchor="middle" letter-spacing="3">GAMMA OS</text></svg>')
          `,
          backgroundSize: "28px 28px, 160px 160px",
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              opacity: 0.35,
              pointerEvents: "none",
            }}
          >
            <svg viewBox="0 0 80 100" style={{ width: 36, height: "auto" }}>
              {([
                [[14,8],[24,22],[34,36],[40,48]],
                [[66,8],[56,22],[46,36],[40,48]],
                [[40,48],[40,66],[40,88]],
              ] as number[][][]).map((arm, ai) =>
                arm.slice(0,-1).map((pt,i) => (
                  <line key={`${ai}-${i}`}
                    x1={pt[0]} y1={pt[1]}
                    x2={arm[i+1][0]} y2={arm[i+1][1]}
                    stroke="rgba(96,165,250,0.6)" strokeWidth="1.4"/>
                ))
              )}
              {([[40,48,2.5]] as [number,number,number][]).map(([cx,cy,r],i) => (
                <circle key={i} cx={cx} cy={cy} r={r} fill="rgba(96,165,250,0.7)"/>
              ))}
            </svg>
            <span style={{ fontSize: 12, fontFamily: "var(--font-system)", color: "var(--color-text-secondary)", letterSpacing: "0.04em" }}>
              System Architect ready
            </span>
          </div>
        )}

        {messages.map((msg, index) => {
          const isStreaming =
            status === "running" &&
            msg.role === "assistant" &&
            index === lastAssistantIndex &&
            index === messages.length - 1;

          return (
            <MessageBubble
              key={msg.id}
              msg={msg}
              accentColor={accentColor}
              status={status}
              isStreaming={isStreaming}
            />
          );
        })}

        {pendingToolLines.length > 0 && (
          <PendingTools lines={pendingToolLines} />
        )}

        <div ref={bottomRef} />
      </div>
    </>
  );
}
