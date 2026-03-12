import React, { useEffect, useRef } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Data
// ─────────────────────────────────────────────────────────────────────────────

const INFO_ROWS: { label: string; value: string }[] = [
  { label: "Version",      value: "0.1.0 (build 1945605)"       },
  { label: "Branch",       value: "feature/system-architect-ui-overhaul" },
  { label: "Frontend",     value: "React 18 · TypeScript 5 · Vite 5"    },
  { label: "Backend",      value: "Node.js · NestJS · Redis"             },
  { label: "Architecture", value: "arm64 · macOS Darwin 24"              },
  { label: "AI Core",      value: "System Architect · claude-sonnet-4-6" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Gamma logo SVG
// ─────────────────────────────────────────────────────────────────────────────

function GammaLogo(): React.ReactElement {
  return (
    <svg
      viewBox="0 0 60 72"
      width="60"
      height="72"
      aria-hidden
      style={{ filter: "drop-shadow(0 0 18px rgba(99,102,241,0.55))" }}
    >
      <path
        d="M6 9 L30 39 L30 66 M54 9 L30 39"
        stroke="url(#gammaGrad)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <defs>
        <linearGradient id="gammaGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#818cf8" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface AboutModalProps {
  onClose: () => void;
}

export function AboutModal({ onClose }: AboutModalProps): React.ReactElement {
  const cardRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Mount animation
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    card.style.opacity = "0";
    card.style.transform = "scale(0.90) translateY(8px)";
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        card.style.transition = "opacity 220ms cubic-bezier(0.34,1.56,0.64,1), transform 220ms cubic-bezier(0.34,1.56,0.64,1)";
        card.style.opacity = "1";
        card.style.transform = "scale(1) translateY(0)";
      });
    });
  }, []);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      onClick={handleBackdropClick}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.55)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        animation: "aboutFadeIn 180ms ease forwards",
      }}
    >
      <style>{`
        @keyframes aboutFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>

      {/* Card */}
      <div
        ref={cardRef}
        style={{
          width: 420,
          background: "linear-gradient(160deg, #1e1b2e 0%, #0f172a 100%)",
          borderRadius: 20,
          border: "1px solid rgba(99,102,241,0.22)",
          boxShadow: "0 40px 100px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)",
          overflow: "hidden",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif",
          color: "#f1f5f9",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "36px 32px 24px",
            gap: 12,
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            background: "rgba(99,102,241,0.04)",
          }}
        >
          <GammaLogo />
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: "0.04em",
                color: "#f8fafc",
              }}
            >
              Gamma OS
            </div>
            <div
              style={{
                fontSize: 13,
                color: "rgba(148,163,184,0.9)",
                marginTop: 4,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Intelligent Operating Environment
            </div>
          </div>
        </div>

        {/* Info rows */}
        <div style={{ padding: "16px 0" }}>
          {INFO_ROWS.map(({ label, value }) => (
            <div
              key={label}
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                padding: "7px 28px",
                gap: 16,
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  color: "rgba(148,163,184,0.7)",
                  fontWeight: 500,
                  letterSpacing: "0.03em",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                  textTransform: "uppercase",
                }}
              >
                {label}
              </span>
              <span
                style={{
                  fontSize: 12,
                  color: "#cbd5e1",
                  textAlign: "right",
                  wordBreak: "break-all",
                }}
              >
                {value}
              </span>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div
          style={{
            margin: "0 28px",
            height: 1,
            background: "rgba(255,255,255,0.06)",
          }}
        />

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 28px",
          }}
        >
          <span
            style={{
              fontSize: 11,
              color: "rgba(100,116,139,0.8)",
              letterSpacing: "0.04em",
            }}
          >
            © 2025–2026 Serhii · Gamma OS Project
          </span>
          <button
            onClick={onClose}
            style={{
              height: 28,
              padding: "0 18px",
              background: "rgba(99,102,241,0.18)",
              border: "1px solid rgba(99,102,241,0.3)",
              borderRadius: 8,
              color: "#a5b4fc",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              letterSpacing: "0.02em",
              transition: "background 140ms ease",
              fontFamily: "inherit",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(99,102,241,0.32)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(99,102,241,0.18)"; }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
