import React from "react";
import { useOSStore } from "../store/useOSStore";

interface TitleBarProps {
  windowId: string;
  title: string;
  onDragStart: (e: React.PointerEvent<HTMLDivElement>) => void;
  /** true if app has agent (agent-prompt.md); enables ✨ button */
  hasAgent?: boolean;
  /** whether the AI assistant panel is open */
  agentPanelOpen?: boolean;
  /** called when ✨ is clicked (only when hasAgent) */
  onToggleAgent?: () => void;
}

export function TitleBar({
  windowId,
  title,
  onDragStart,
  hasAgent = false,
  agentPanelOpen = false,
  onToggleAgent,
}: TitleBarProps): React.ReactElement {
  const closeWindow = useOSStore((s) => s.closeWindow);
  const minimizeWindow = useOSStore((s) => s.minimizeWindow);
  const maximizeWindow = useOSStore((s) => s.maximizeWindow);

  return (
    <div className="window-titlebar" onPointerDown={onDragStart}>
      {/* Traffic lights — stop propagation so clicks don't start drag */}
      <div
        className="window-titlebar__lights"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          className="btn-close"
          onClick={(e) => {
            e.stopPropagation();
            closeWindow(windowId);
          }}
          aria-label="Close"
        />
        <button
          className="btn-minimize"
          onClick={(e) => {
            e.stopPropagation();
            minimizeWindow(windowId);
          }}
          aria-label="Minimize"
        />
        <button
          className="btn-maximize"
          onClick={(e) => {
            e.stopPropagation();
            maximizeWindow(windowId);
          }}
          aria-label="Maximize"
        />
      </div>

      <span className="window-titlebar__title">{title}</span>

      {/* AI Assistant toggle — only active when hasAgent */}
      <div
        className="window-titlebar__spacer"
        style={{ display: "flex", alignItems: "center", gap: 4 }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (hasAgent && onToggleAgent) onToggleAgent();
          }}
          title={hasAgent ? "Toggle AI Assistant" : "No agent configured"}
          aria-label={hasAgent ? "Toggle AI Assistant" : "No agent configured"}
          style={{
            flexShrink: 0,
            background: agentPanelOpen ? "rgba(255,255,255,0.08)" : "transparent",
            border: "none",
            borderRadius: 4,
            cursor: hasAgent ? "pointer" : "default",
            opacity: hasAgent ? 1 : 0.4,
            padding: "4px 6px",
            fontSize: 14,
            lineHeight: 1,
            color: agentPanelOpen
              ? "var(--color-accent-primary)"
              : "var(--color-text-secondary)",
            transition: "opacity 0.15s, color 0.15s, background 0.15s",
          }}
          onMouseEnter={(e) => {
            if (hasAgent) {
              e.currentTarget.style.color = "var(--color-text-primary)";
              if (!agentPanelOpen) {
                e.currentTarget.style.background = "rgba(255,255,255,0.05)";
              }
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = agentPanelOpen
              ? "var(--color-accent-primary)"
              : "var(--color-text-secondary)";
            e.currentTarget.style.background = agentPanelOpen
              ? "rgba(255,255,255,0.08)"
              : "transparent";
          }}
        >
          ✨
        </button>
      </div>
    </div>
  );
}
