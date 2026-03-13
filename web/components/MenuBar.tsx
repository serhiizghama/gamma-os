import React, { useState, useEffect, useRef } from "react";
import { useOSStore } from "../store/useOSStore";
import { AboutModal } from "./AboutModal";
import type { WindowNode } from "@gamma/types";

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

// ── Minimized window chip (lives in MenuBar) ──────────────────────────────

function MinimizedWindowChip({
  win,
  onRestore,
}: {
  win: WindowNode;
  onRestore: () => void;
}): React.ReactElement {
  const [hovered, setHovered] = useState(false);

  const abbr = win.title
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

  return (
    <button
      id={`dock-btn-${win.id}`}
      onClick={onRestore}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={`Restore "${win.title}"`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        height: 22,
        padding: "0 8px",
        borderRadius: 5,
        border: `1px solid ${hovered ? "rgba(59,130,246,0.5)" : "rgba(255,255,255,0.1)"}`,
        background: hovered
          ? "rgba(37,99,235,0.25)"
          : "rgba(255,255,255,0.06)",
        color: hovered ? "rgba(147,197,253,1)" : "rgba(255,255,255,0.65)",
        cursor: "pointer",
        fontSize: 11,
        fontWeight: 500,
        fontFamily: "var(--font-system)",
        letterSpacing: "0.02em",
        transition: "background 140ms ease, border-color 140ms ease, color 140ms ease",
        whiteSpace: "nowrap",
        maxWidth: 120,
        flexShrink: 0,
        userSelect: "none",
      }}
    >
      {/* tiny window icon */}
      <span
        style={{
          fontSize: 9,
          lineHeight: 1,
          opacity: 0.75,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 13,
          height: 10,
          borderRadius: 2,
          border: "1px solid currentColor",
          flexShrink: 0,
          position: "relative",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            background: "currentColor",
            opacity: 0.5,
            borderRadius: "1px 1px 0 0",
          }}
        />
        {abbr[0]}
      </span>
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: 80,
        }}
      >
        {win.title}
      </span>
    </button>
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
  const focusWindow   = useOSStore((s) => s.focusWindow);
  const minimizedWindows = useOSStore((s) =>
    Object.values(s.windows).filter((w) => w.isMinimized)
  );

  const [aboutOpen, setAboutOpen] = useState(false);

  return (
    <>
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
      {/* ── Left: Brand + minimized window chips ────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        {/* Gamma γ glyph + name — clickable "About" trigger */}
        <button
          onClick={() => setAboutOpen(true)}
          title="About Gamma OS"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: "3px 6px",
            borderRadius: 6,
            transition: "background 140ms ease",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
        >
          <svg
            viewBox="0 0 20 24"
            width="14"
            height="16"
            style={{ opacity: 0.85, flexShrink: 0 }}
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
              fontFamily: "var(--font-system)",
            }}
          >
            Gamma OS
          </span>
        </button>
      </div>

      {/* ── Minimized window chips ───────────────────────────── */}
      {minimizedWindows.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            flexShrink: 0,
            maxWidth: "40vw",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: 1,
              height: 14,
              background: "var(--color-border-subtle)",
              flexShrink: 0,
              borderRadius: 1,
              marginRight: 2,
            }}
          />
          {minimizedWindows.map((win) => (
            <MinimizedWindowChip
              key={win.id}
              win={win}
              onRestore={() => focusWindow(win.id)}
            />
          ))}
        </div>
      )}

      {/* ── Right: Tray ─────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
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

    {/* About Gamma OS modal */}
    {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
    </>
  );
}
