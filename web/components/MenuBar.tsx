import { useState, useEffect, useRef } from "react";
import { API_BASE } from "../constants/api";

// ── Types ────────────────────────────────────────────────────────────────

type HealthStatus = "ok" | "degraded" | "error" | "offline";

interface MenuBarProps {
  onOpenArchitect: () => void;
  onOpenLaunchpad: () => void;
}

// ── Status colors (indicator only — no text labels) ───────────────────────

const STATUS_COLOR: Record<HealthStatus, string> = {
  ok: "#10B981",
  degraded: "#facc15",
  error: "#ff4d4f",
  offline: "#94A3B8",
};

const MENU_HEIGHT = 32;

// ── OS System Tray Icons (minimal SVG placeholders) ───────────────────────

function WiFiIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" />
      <path d="M5 8a4 4 0 0 1 6 0" />
      <path d="M3 5.5a7 7 0 0 1 10 0" />
      <path d="M1 3a10 10 0 0 1 14 0" />
    </svg>
  );
}

function BatteryIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="5" width="12" height="6" rx="1.5" />
      <path d="M13 7v2h1.5V7H13Z" fill="currentColor" />
    </svg>
  );
}

function ClockIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4v4l3 2" strokeLinecap="round" />
    </svg>
  );
}

// ── Component ────────────────────────────────────────────────────────────

export function MenuBar({
  onOpenArchitect,
  onOpenLaunchpad,
}: MenuBarProps): React.ReactElement {
  const [health, setHealth] = useState<HealthStatus>("ok");
  const [time, setTime] = useState(() => new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }));
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

  useEffect(() => {
    const id = setInterval(() => {
      setTime(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const statusColor = STATUS_COLOR[health];
  const isOnline = health === "ok";

  return (
    <div
      className="desktop-shell__taskbar"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: MENU_HEIGHT,
        minHeight: MENU_HEIGHT,
        background: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(16px) saturate(180%)",
        WebkitBackdropFilter: "blur(16px) saturate(180%)",
        borderBottom: "1px solid var(--color-border-subtle)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
        zIndex: 10000,
        fontFamily: "var(--font-system)",
        color: "var(--color-text-primary)",
        userSelect: "none",
      }}
    >
      {/* Left: Branding */}
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "var(--color-text-primary)",
          letterSpacing: 2,
        }}
      >
        Gamma OS
      </span>

      {/* Right: System Tray */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <button
          onClick={onOpenLaunchpad}
          title="Apps"
          style={TRAY_BTN}
          aria-label="Open Apps"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <rect x="2" y="2" width="4" height="4" rx="0.5" />
            <rect x="10" y="2" width="4" height="4" rx="0.5" />
            <rect x="2" y="10" width="4" height="4" rx="0.5" />
            <rect x="10" y="10" width="4" height="4" rx="0.5" />
          </svg>
        </button>
        <button
          onClick={onOpenArchitect}
          title="System Architect"
          style={TRAY_BTN}
          aria-label="System Architect"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="8" cy="5" r="1.5" />
            <path d="M8 8v4M6 10h4" stroke="currentColor" strokeWidth="1.2" fill="none" />
          </svg>
        </button>
        <span style={TRAY_ICON} title="Wi-Fi">
          <WiFiIcon />
        </span>
        <span style={TRAY_ICON} title="Battery">
          <BatteryIcon />
        </span>
        <span style={TRAY_ICON} title={time}>
          <ClockIcon />
        </span>
        <div
          title={`System status: ${health}`}
          style={{
            width: 8,
            height: 8,
            borderRadius: "999px",
            backgroundColor: statusColor,
            boxShadow: isOnline ? "0 0 8px rgba(16, 185, 129, 0.4)" : "none",
            flexShrink: 0,
          }}
        />
      </div>
    </div>
  );
}

const TRAY_BTN: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 28,
  padding: 0,
  background: "transparent",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  color: "var(--color-text-primary)",
  opacity: 0.9,
};

const TRAY_ICON: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "var(--color-text-primary)",
  opacity: 0.9,
};

export { MENU_HEIGHT };
