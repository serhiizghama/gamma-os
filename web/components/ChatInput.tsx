import React, { useState, useCallback } from "react";
import type { AgentStatus } from "@gamma/types";

interface ChatInputProps {
  status: AgentStatus;
  accentColor?: string;
  placeholder?: string;
  onSend: (text: string) => void;
}

function SendIcon({ active }: { active: boolean }): React.ReactElement {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke={active ? "#fff" : "currentColor"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

export function ChatInput({
  status,
  placeholder = "Type a message…",
  onSend,
}: ChatInputProps): React.ReactElement {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);

  const isRunning = status === "running";
  const canSend = text.trim().length > 0 && !isRunning;

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || isRunning) return;
    onSend(trimmed);
    setText("");
  }, [text, isRunning, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div
      style={{
        padding: "10px 12px",
        background: "#0a1222",
        borderTop: "1px solid rgba(59,130,246,0.12)",
        display: "flex",
        alignItems: "flex-end",
        gap: 8,
      }}
    >
      {/* Textarea instead of input — allows multi-line, Shift+Enter */}
      <div
        style={{
          flex: 1,
          position: "relative",
          display: "flex",
          alignItems: "flex-end",
        }}
      >
        <textarea
          className="agent-chat-input"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            // Auto-resize
            e.target.style.height = "auto";
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={isRunning ? "Waiting for response…" : placeholder}
          disabled={isRunning}
          rows={1}
          style={{
            width: "100%",
            resize: "none",
            overflow: "hidden",
            background: focused
              ? "rgba(15,23,42,0.9)"
              : "rgba(10,16,30,0.8)",
            border: focused
              ? "1px solid rgba(59,130,246,0.45)"
              : "1px solid rgba(255,255,255,0.08)",
            borderRadius: 10,
            padding: "9px 12px",
            color: "var(--color-text-primary)",
            fontFamily: "var(--font-system)",
            fontSize: 13,
            lineHeight: 1.5,
            outline: "none",
            transition: "border-color 180ms ease, background 180ms ease, box-shadow 180ms ease",
            boxShadow: focused
              ? "0 0 0 3px rgba(59,130,246,0.12), 0 2px 8px rgba(0,0,0,0.3)"
              : "0 1px 4px rgba(0,0,0,0.2)",
            minHeight: 38,
            maxHeight: 120,
            display: "block",
          }}
        />
      </div>

      {/* Send button */}
      <button
        onClick={handleSend}
        disabled={!canSend}
        title={isRunning ? "Waiting…" : "Send (Enter)"}
        style={{
          flexShrink: 0,
          width: 36,
          height: 36,
          borderRadius: 10,
          border: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: canSend ? "pointer" : "not-allowed",
          background: canSend
            ? "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)"
            : "rgba(255,255,255,0.06)",
          color: canSend ? "#fff" : "rgba(148,163,184,0.4)",
          boxShadow: canSend ? "0 2px 10px rgba(37,99,235,0.4)" : "none",
          transition: "all 180ms ease",
          transform: canSend ? "scale(1)" : "scale(0.95)",
        }}
        onMouseEnter={(e) => {
          if (canSend) e.currentTarget.style.transform = "scale(1.06)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = canSend ? "scale(1)" : "scale(0.95)";
        }}
      >
        <SendIcon active={canSend} />
      </button>
    </div>
  );
}
