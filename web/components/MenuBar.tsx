import React, { useState, useEffect, useRef } from "react";
import { useOSStore } from "../store/useOSStore";

export const MENU_HEIGHT = 32;

// ── Icons ─────────────────────────────────────────────────────────────────

function MessageSquareIcon(): React.ReactElement {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function GridIcon(): React.ReactElement {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
      <rect x="2" y="2" width="4" height="4" rx="0.5" />
      <rect x="10" y="2" width="4" height="4" rx="0.5" />
      <rect x="2" y="10" width="4" height="4" rx="0.5" />
      <rect x="10" y="10" width="4" height="4" rx="0.5" />
    </svg>
  );
}

// ── Clock ─────────────────────────────────────────────────────────────────

function getClockString(): string {
  const now = new Date();
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const day = days[now.getDay()];
  const h = now.getHours().toString().padStart(2, "0");
  const m = now.getMinutes().toString().padStart(2, "0");
  return `${day} ${h}:${m}`;
}

function Clock(): React.ReactElement {
  const [clock, setClock] = useState(getClockString);

  useEffect(() => {
    // Sync to the next full second boundary, then tick every second
    const msUntilNextSec = 1000 - (Date.now() % 1000);
    const initial = setTimeout(() => {
      setClock(getClockString());
      const id = setInterval(() => setClock(getClockString()), 1000);
      return () => clearInterval(id);
    }, msUntilNextSec);
    return () => clearTimeout(initial);
  }, []);

  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 500,
        color: "var(--color-text-secondary)",
        fontVariantNumeric: "tabular-nums",
        letterSpacing: "0.02em",
        minWidth: 66,
        textAlign: "right",
        fontFamily: "var(--font-system)",
        userSelect: "none",
      }}
    >
      {clock}
    </span>
  );
}

// ── Active Window Title ───────────────────────────────────────────────────

/**
 * Reads focused window from the OS store and animates title transitions.
 * Fade-out (150ms) → swap text → fade-in (180ms) on every focus change.
 */
function ActiveWindowTitle(): React.ReactElement {
  const focusedWindowId = useOSStore((s) => s.focusedWindowId);
  const windows         = useOSStore((s) => s.windows);

  // Derive the title to display (null = no active window / desktop)
  const focusedWin = focusedWindowId ? windows[focusedWindowId] : null;
  const targetTitle: string | null =
    focusedWin && !focusedWin.isMinimized ? focusedWin.title : null;

  // Stable ref avoids stale-closure issues inside the timeout
  const targetRef = useRef(targetTitle);
  targetRef.current = targetTitle;

  // What's currently rendered (lags targetTitle by one transition)
  const [displayTitle, setDisplayTitle] = useState<string | null>(targetTitle);
  const [opacity, setOpacity]           = useState(1);
  const [translateY, setTranslateY]     = useState(0);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (targetTitle === displayTitle) return;
    if (inFlightRef.current) {
      // Already animating — just jump to latest value when fade is done
      return;
    }

    inFlightRef.current = true;

    // Phase 1: fade + slide up (out)
    setOpacity(0);
    setTranslateY(-4);

    const swap = setTimeout(() => {
      setDisplayTitle(targetRef.current);
      setTranslateY(4); // start slightly below before sliding in

      // Phase 2: fade + slide down (in), small rAF delay so DOM updates first
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setOpacity(1);
          setTranslateY(0);
          setTimeout(() => { inFlightRef.current = false; }, 200);
        });
      });
    }, 160);

    return () => clearTimeout(swap);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetTitle]);

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        pointerEvents: "none",
        minWidth: 0,
        padding: "0 16px",
      }}
    >
      <span
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: displayTitle
            ? "var(--color-text-primary)"
            : "var(--color-text-secondary)",
          opacity,
          transform: `translateY(${translateY}px)`,
          transition: "opacity 160ms ease, transform 160ms ease",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: "100%",
          fontFamily: "var(--font-system)",
          letterSpacing: displayTitle ? "0.01em" : "0.06em",
          userSelect: "none",
        }}
      >
        {displayTitle ?? "Desktop"}
      </span>
    </div>
  );
}

// ── Separator ─────────────────────────────────────────────────────────────

function Sep(): React.ReactElement {
  return (
    <span
      style={{
        width: 1,
        height: 14,
        background: "var(--color-border-subtle)",
        flexShrink: 0,
        borderRadius: 1,
      }}
    />
  );
}

// ── TrayButton ────────────────────────────────────────────────────────────

function TrayButton({
  onClick,
  title,
  label,
  children,
  active = false,
}: {
  onClick: () => void;
  title: string;
  label: string;
  children: React.ReactNode;
  active?: boolean;
}): React.ReactElement {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={label}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        padding: 0,
        background: active || hovered ? "rgba(255,255,255,0.08)" : "transparent",
        border: "none",
        borderRadius: 6,
        cursor: "pointer",
        color: active
          ? "var(--color-accent-primary)"
          : hovered
          ? "var(--color-text-primary)"
          : "var(--color-text-secondary)",
        transition: "color 150ms ease, background 150ms ease",
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

// ── MenuBar ───────────────────────────────────────────────────────────────

interface MenuBarProps {
  onOpenArchitect: () => void;
  onOpenLaunchpad: () => void;
}

export function MenuBar({
  onOpenArchitect,
  onOpenLaunchpad,
}: MenuBarProps): React.ReactElement {
  const architectOpen = useOSStore((s) => s.architectOpen);
  const launchpadOpen = useOSStore((s) => s.launchpadOpen);

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
        background: "rgba(15, 23, 42, 0.72)",
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
        borderBottom: "1px solid var(--color-border-subtle)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 12px",
        zIndex: 10000,
        fontFamily: "var(--font-system)",
        color: "var(--color-text-primary)",
        userSelect: "none",
      }}
    >
      {/* ── Left: Brand ─────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        {/* Gamma γ glyph */}
        <svg
          viewBox="0 0 20 24"
          width="14"
          height="16"
          style={{ opacity: 0.75, flexShrink: 0 }}
          aria-hidden
        >
          <path
            d="M2 3 L10 13 L10 22 M18 3 L10 13"
            stroke="var(--color-accent-primary)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--color-text-primary)",
            letterSpacing: "0.12em",
          }}
        >
          Gamma OS
        </span>
      </div>

      {/* ── Center: Active window title (animated) ───────────── */}
      <ActiveWindowTitle />

      {/* ── Right: Tray ─────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        <Clock />
        <Sep />
        <TrayButton
          onClick={onOpenLaunchpad}
          title="Launchpad"
          label="Open Apps"
          active={launchpadOpen}
        >
          <GridIcon />
        </TrayButton>
        <TrayButton
          onClick={onOpenArchitect}
          title="System Architect"
          label="System Architect"
          active={architectOpen}
        >
          <MessageSquareIcon />
        </TrayButton>
      </div>
    </div>
  );
}
