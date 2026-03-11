import { useState, useEffect, useRef } from "react";
import { API_BASE } from "../constants/api";

// ── Types ────────────────────────────────────────────────────────────────

type HealthStatus = "ok" | "degraded" | "error" | "offline";

interface MenuBarProps {
  onOpenArchitect: () => void;
  onOpenLaunchpad: () => void;
}

// ── Status Config ────────────────────────────────────────────────────────

const STATUS_DISPLAY: Record<HealthStatus, { label: string; color: string }> = {
  ok: { label: "OK", color: "#3B82F6" },
  degraded: { label: "Degraded", color: "#facc15" },
  error: { label: "Error", color: "#ff4d4f" },
  offline: { label: "Offline", color: "#94A3B8" },
};

const MENU_HEIGHT = 48; /* var(--space-12) */

// ── Component ────────────────────────────────────────────────────────────

export function MenuBar({
  onOpenArchitect,
  onOpenLaunchpad,
}: MenuBarProps): React.ReactElement {
  const [health, setHealth] = useState<HealthStatus>("ok");
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/system/health`);
        if (!res.ok) throw new Error("not ok");
        const data = await res.json();
        if (mountedRef.current) {
          setHealth(
            (data.status as HealthStatus) === "ok"
              ? "ok"
              : (data.status as HealthStatus) === "degraded"
                ? "degraded"
                : "error",
          );
        }
      } catch {
        if (mountedRef.current) setHealth("offline");
      }
    };

    poll();
    const id = setInterval(poll, 30_000);

    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, []);

  const st = STATUS_DISPLAY[health];

  return (
    <div
      className="desktop-shell__taskbar"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: "var(--space-12)",
        minHeight: "var(--space-12)",
        background: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(16px) saturate(180%)",
        WebkitBackdropFilter: "blur(16px) saturate(180%)",
        borderBottom: "1px solid var(--color-border-subtle)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: `0 var(--space-4)`,
        zIndex: 10000,
        fontFamily: "var(--font-system)",
        fontSize: 11,
        letterSpacing: 0.08,
        color: "var(--color-text-primary)",
        userSelect: "none",
      }}
    >
      {/* Left: Brand + System Status */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)" }}>
        <span
          style={{
            fontSize: 13,
            fontWeight: "var(--font-weight-semibold)",
            letterSpacing: 2,
          }}
        >
          GAMMA OS
        </span>
        <span
          title={`System: ${health}`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            fontSize: 11,
            color: "var(--color-text-secondary)",
            cursor: "default",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "999px",
              backgroundColor: st.color,
              boxShadow:
                health === "ok"
                  ? "0 0 0 1px rgba(59, 130, 246, 0.35)"
                  : "0 0 0 1px rgba(148, 163, 184, 0.35)",
            }}
          />
          <span>{st.label}</span>
        </span>
      </div>

      {/* Right: Global application menu */}
      <div className="desktop-shell__menu" style={{ display: "flex", alignItems: "center", gap: "var(--space-4)" }}>
        <button
          className="desktop-shell__menu-item"
          onClick={onOpenLaunchpad}
          title="Apps"
        >
          Apps
        </button>
        <button
          className="desktop-shell__menu-item"
          onClick={onOpenArchitect}
          title="System Architect"
        >
          Architect
        </button>
      </div>
    </div>
  );
}

export { MENU_HEIGHT };
