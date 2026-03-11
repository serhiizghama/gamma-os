import type { AgentStatus } from "@gamma/types";

interface ChatHeaderProps {
  title: string;
  status: AgentStatus;
  accentColor: string;
}

const STATUS_CONFIG: Record<AgentStatus, { label: string; color: string }> = {
  idle: { label: "Idle", color: "var(--color-text-secondary)" },
  running: { label: "Thinking…", color: "var(--color-accent-primary)" },
  error: { label: "Error", color: "#ff4d4f" },
  aborted: { label: "Aborted", color: "#f97316" },
};

export function ChatHeader({
  title,
  status,
}: ChatHeaderProps): React.ReactElement {
  const cfg = STATUS_CONFIG[status];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 14px",
        background: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(16px) saturate(180%)",
        WebkitBackdropFilter: "blur(16px) saturate(180%)",
        borderBottom: "1px solid var(--color-border-subtle)",
        fontFamily: "var(--font-system)",
        fontSize: 13,
        color: "var(--color-text-primary)",
        userSelect: "none",
      }}
    >
      <span
        style={{
          fontWeight: 600,
          color: "var(--color-text-primary)",
          letterSpacing: 0.2,
        }}
      >
        {title}
      </span>
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11,
          color: "var(--color-text-secondary)",
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: cfg.color,
            boxShadow: "0 0 0 1px var(--color-border-subtle)",
            animation:
              status === "running" ? "pulse 1.4s ease-in-out infinite" : "none",
          }}
        />
        {cfg.label}
      </span>
    </div>
  );
}
