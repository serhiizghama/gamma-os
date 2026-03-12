import React, { useEffect, useRef, useState, useCallback } from "react";

// ── Timings ───────────────────────────────────────────────────────────────
const BOOT_DURATION  = 5000;
const EXIT_DELAY     = 600;
const EXIT_DURATION  = 1000;

// ── Status sequence ───────────────────────────────────────────────────────
const STATUS_LINES = [
  { at: 0.00, text: "[ BIOS ] Gamma Core v2.0 initializing..." },
  { at: 0.10, text: "[ MEM  ] Scanning memory banks... 32GB OK" },
  { at: 0.22, text: "[ GPU  ] Quantum renderer online" },
  { at: 0.35, text: "[ NET  ] Neural mesh connected" },
  { at: 0.50, text: "[ FS   ] Mounting virtual filesystem... OK" },
  { at: 0.65, text: "[ SYS  ] Loading window compositor" },
  { at: 0.78, text: "[ AI   ] Architect agent bootstrapping" },
  { at: 0.90, text: "[ BOOT ] All systems nominal" },
  { at: 0.97, text: "[ READY] Gamma OS — Welcome, Serhii." },
];

// ── Particle canvas ───────────────────────────────────────────────────────
const CANVAS_SCALE = 0.45;
const CANVAS_FPS   = 40;
const CANVAS_FRAME = 1000 / CANVAS_FPS;

function ParticleCanvas({ progress }: { progress: number }): React.ReactElement {
  const ref = useRef<HTMLCanvasElement>(null);
  const progressRef = useRef(progress);
  progressRef.current = progress;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true })!;

    const resize = () => {
      canvas.width  = Math.floor(window.innerWidth  * CANVAS_SCALE);
      canvas.height = Math.floor(window.innerHeight * CANVAS_SCALE);
    };
    resize();
    window.addEventListener("resize", resize);

    interface Particle {
      x: number; y: number; vx: number; vy: number;
      r: number; alpha: number; hue: number;
    }

    const particles: Particle[] = [];
    const seed = () => {
      const W = canvas.width, H = canvas.height;
      for (let i = 0; i < 90; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist  = Math.random() * Math.min(W, H) * 0.48;
        particles.push({
          x: W / 2 + Math.cos(angle) * dist,
          y: H / 2 + Math.sin(angle) * dist,
          vx: (Math.random() - 0.5) * 0.22,
          vy: (Math.random() - 0.5) * 0.22,
          r:  1.0 + Math.random() * 2.0,
          alpha: 0.4 + Math.random() * 0.6,
          hue: 190 + Math.random() * 60, // cyan → blue
        });
      }
      // scatter
      for (let i = 0; i < 60; i++) {
        particles.push({
          x: Math.random() * W,
          y: Math.random() * H,
          vx: (Math.random() - 0.5) * 0.12,
          vy: (Math.random() - 0.5) * 0.12,
          r:  0.5 + Math.random() * 1.4,
          alpha: 0.15 + Math.random() * 0.35,
          hue: 210 + Math.random() * 40,
        });
      }
    };
    seed();

    let rafId = 0, lastTs = 0;

    const draw = (ts: number) => {
      rafId = requestAnimationFrame(draw);
      if (ts - lastTs < CANVAS_FRAME) return;
      lastTs = ts;

      const W = canvas.width, H = canvas.height;
      const p = progressRef.current;
      const globalAlpha = Math.min(p * 5, 1);

      ctx.clearRect(0, 0, W, H);

      // Move + bounce
      for (const n of particles) {
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0)  { n.x = 0;  n.vx = Math.abs(n.vx); }
        if (n.x > W)  { n.x = W;  n.vx = -Math.abs(n.vx); }
        if (n.y < 0)  { n.y = 0;  n.vy = Math.abs(n.vy); }
        if (n.y > H)  { n.y = H;  n.vy = -Math.abs(n.vy); }
      }

      // Connections
      const CONN_DIST = 100 + p * 40;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const d  = Math.sqrt(dx * dx + dy * dy);
          if (d < CONN_DIST) {
            const a = (1 - d / CONN_DIST) * 0.32 * globalAlpha;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `hsla(210,100%,60%,${a})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      }

      // Nodes
      for (const n of particles) {
        const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 3);
        glow.addColorStop(0, `hsla(${n.hue},100%,70%,${n.alpha * globalAlpha})`);
        glow.addColorStop(1, `hsla(${n.hue},100%,70%,0)`);
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r * 3, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${n.hue},100%,80%,${n.alpha * globalAlpha})`;
        ctx.fill();
      }

      // Data pulse ring at center
      if (p > 0.3) {
        const cx = W / 2, cy = H / 2;
        const ringR = (p - 0.3) * Math.min(W, H) * 0.8;
        const ringA = Math.max(0, (0.7 - p) * 0.5);
        if (ringA > 0) {
          ctx.beginPath();
          ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(0,229,255,${ringA})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    };

    rafId = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.75 }}
    />
  );
}

// ── RGB Glitch Logo ───────────────────────────────────────────────────────

function GlitchLogo({ progress }: { progress: number }): React.ReactElement {
  // Glitch intensity: ramps up 0→0.6, then calms as we approach 100%
  const intensity = progress < 0.6
    ? progress / 0.6
    : 1 - (progress - 0.6) / 0.4;
  const shouldGlitch = intensity > 0.05;

  const base: React.CSSProperties = {
    fontSize: "clamp(38px, 6.5vw, 88px)",
    fontWeight: 900,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    fontFamily: "'SF Pro Display', -apple-system, sans-serif",
    lineHeight: 1,
    userSelect: "none",
    display: "block",
  };

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      {/* Red ghost */}
      {shouldGlitch && (
        <span aria-hidden style={{
          ...base,
          position: "absolute", top: 0, left: 0,
          color: "#ff003c",
          opacity: intensity * 0.6,
          mixBlendMode: "screen",
          animation: `glitchR ${1.8 + intensity * 0.6}s infinite`,
          pointerEvents: "none",
        }}>GAMMA OS</span>
      )}
      {/* Cyan ghost */}
      {shouldGlitch && (
        <span aria-hidden style={{
          ...base,
          position: "absolute", top: 0, left: 0,
          color: "#00e5ff",
          opacity: intensity * 0.55,
          mixBlendMode: "screen",
          animation: `glitchB ${2.1 + intensity * 0.4}s infinite`,
          pointerEvents: "none",
        }}>GAMMA OS</span>
      )}
      {/* Main */}
      <span style={{
        ...base,
        position: "relative",
        background: progress > 0.9
          ? "linear-gradient(90deg, #60a5fa, #00e5ff, #a78bfa, #60a5fa)"
          : "linear-gradient(90deg, #3b82f6, #00c4ff)",
        backgroundSize: "200% 100%",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
        animation: progress > 0.9 ? "gradientShift 2s linear infinite" : "none",
        textShadow: "none",
        filter: progress > 0.9
          ? `drop-shadow(0 0 20px rgba(0,229,255,0.6))`
          : `drop-shadow(0 0 ${8 * intensity}px rgba(59,130,246,0.5))`,
      }}>GAMMA OS</span>
    </div>
  );
}

// ── Segmented progress bar ────────────────────────────────────────────────

const SEGMENTS = 24;

function SegmentedBar({ progress }: { progress: number }): React.ReactElement {
  const filled = Math.floor(progress * SEGMENTS);
  const partial = (progress * SEGMENTS) % 1; // fractional fill of the next block

  return (
    <div style={{ display: "flex", gap: 3, alignItems: "stretch" }}>
      {Array.from({ length: SEGMENTS }).map((_, i) => {
        const isFull    = i < filled;
        const isPartial = i === filled;
        const fillPct   = isFull ? 1 : isPartial ? partial : 0;

        return (
          <div
            key={i}
            style={{
              flex: 1, height: 6, borderRadius: 2, overflow: "hidden",
              background: "rgba(0,100,180,0.18)",
              boxShadow: isFull ? "0 0 4px rgba(0,229,255,0.3)" : "none",
              transition: "box-shadow 0.1s",
            }}
          >
            <div
              style={{
                width: `${fillPct * 100}%`,
                height: "100%",
                background: i < SEGMENTS * 0.7
                  ? "linear-gradient(90deg, #1d4ed8, #3b82f6)"
                  : i < SEGMENTS * 0.9
                  ? "linear-gradient(90deg, #3b82f6, #00c4ff)"
                  : "linear-gradient(90deg, #00c4ff, #a78bfa)",
                boxShadow: fillPct > 0
                  ? "0 0 8px rgba(0,196,255,0.9), 0 0 2px #fff"
                  : "none",
                transition: "width 120ms linear",
                borderRadius: 2,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

// ── Typewriter status line ────────────────────────────────────────────────

function TypewriterLine({ text, speed = 28 }: { text: string; speed?: number }): React.ReactElement {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDisplayed("");
    setDone(false);
    let i = 0;
    const id = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) { clearInterval(id); setDone(true); }
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);

  return (
    <span>
      {displayed}
      {!done && (
        <span style={{ animation: "cursorBlink 0.7s step-end infinite", marginLeft: 1 }}>▌</span>
      )}
    </span>
  );
}

// ── Scanline overlay ──────────────────────────────────────────────────────

function Scanlines(): React.ReactElement {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute", inset: 0, pointerEvents: "none", zIndex: 3,
        backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.04) 2px, rgba(0,0,0,0.04) 4px)",
        backgroundSize: "100% 4px",
      }}
    />
  );
}

// ── Boot Screen ───────────────────────────────────────────────────────────

export function BootScreen({ onDone }: { onDone: () => void }): React.ReactElement {
  const [progress,     setProgress]     = useState(0);
  const [statusIdx,    setStatusIdx]    = useState(0);
  const [exiting,      setExiting]      = useState(false);
  const [exitOpacity,  setExitOpacity]  = useState(1);
  const [exitScale,    setExitScale]    = useState(1);
  const [flashWhite,   setFlashWhite]   = useState(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // Derive which status line to show
  const currentStatus = STATUS_LINES[statusIdx]?.text ?? STATUS_LINES[STATUS_LINES.length - 1].text;

  const startExit = useCallback(() => {
    setExiting(true);
    const start = performance.now();
    const fade = (now: number) => {
      const t = Math.min((now - start) / EXIT_DURATION, 1);
      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      setExitOpacity(1 - eased);
      setExitScale(1 + eased * 0.06);
      setFlashWhite(t < 0.15 ? t / 0.15 : t > 0.25 ? 0 : (0.25 - t) / 0.10);
      if (t < 1) requestAnimationFrame(fade);
      else onDoneRef.current();
    };
    requestAnimationFrame(fade);
  }, []);

  useEffect(() => {
    let frame = 0;
    const start = performance.now();

    const tick = (ts: number) => {
      const p = Math.min((ts - start) / BOOT_DURATION, 1);
      setProgress(p);

      // Advance status line
      let nextIdx = STATUS_LINES.length - 1;
      for (let i = 0; i < STATUS_LINES.length; i++) {
        if (p >= STATUS_LINES[i].at) nextIdx = i;
      }
      setStatusIdx(nextIdx);

      if (p < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        setTimeout(startExit, EXIT_DELAY);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [startExit]);

  return (
    <>
      {/* Keyframes */}
      <style>{`
        @keyframes glitchR {
          0%,100% { transform: translate(0,0); clip-path: inset(0 0 0 0); }
          10%      { transform: translate(-3px, 1px); clip-path: inset(15% 0 60% 0); }
          20%      { transform: translate(3px, -1px); clip-path: inset(50% 0 20% 0); }
          30%      { transform: translate(-1px, 2px); clip-path: inset(5% 0 85% 0); }
          40%      { transform: translate(0,0); clip-path: inset(0 0 0 0); }
        }
        @keyframes glitchB {
          0%,100% { transform: translate(0,0); clip-path: inset(0 0 0 0); }
          15%      { transform: translate(3px, -2px); clip-path: inset(70% 0 5% 0); }
          25%      { transform: translate(-3px, 1px); clip-path: inset(30% 0 45% 0); }
          35%      { transform: translate(1px, 0); clip-path: inset(80% 0 0% 0); }
          45%      { transform: translate(0,0); clip-path: inset(0 0 0 0); }
        }
        @keyframes gradientShift {
          0%   { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        @keyframes cursorBlink {
          0%,100% { opacity: 1; } 50% { opacity: 0; }
        }
        @keyframes bootFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes hexPulse {
          0%,100% { opacity: 0.04; } 50% { opacity: 0.10; }
        }
      `}</style>

      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "#04060f",
          zIndex: 99999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          opacity: exiting ? exitOpacity : 1,
          transform: `scale(${exitScale})`,
          transformOrigin: "center center",
          transition: exiting ? "none" : undefined,
        }}
      >
        {/* Particle canvas */}
        <ParticleCanvas progress={progress} />

        {/* Scanlines */}
        <Scanlines />

        {/* White flash on exit */}
        {flashWhite > 0 && (
          <div
            aria-hidden
            style={{
              position: "absolute", inset: 0,
              background: "white",
              opacity: flashWhite * 0.55,
              zIndex: 10, pointerEvents: "none",
            }}
          />
        )}

        {/* Hex grid decoration */}
        <div
          aria-hidden
          style={{
            position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1,
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='100'%3E%3Cpolygon points='28,2 54,16 54,44 28,58 2,44 2,16' fill='none' stroke='rgba(59,130,246,0.15)' stroke-width='0.8'/%3E%3Cpolygon points='28,52 54,66 54,94 28,108 2,94 2,66' fill='none' stroke='rgba(59,130,246,0.15)' stroke-width='0.8'/%3E%3C/svg%3E")`,
            backgroundSize: "56px 100px",
            animation: "hexPulse 4s ease-in-out infinite",
          }}
        />

        {/* Center content */}
        <div
          style={{
            position: "relative",
            zIndex: 5,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 32,
            animation: "bootFadeIn 0.6s ease-out forwards",
          }}
        >
          {/* γ glyph */}
          <svg
            viewBox="0 0 80 100"
            style={{
              width: "clamp(28px, 4vw, 52px)",
              height: "auto",
              opacity: 0.7,
              filter: `drop-shadow(0 0 ${6 + progress * 10}px rgba(59,130,246,0.7))`,
              transition: "filter 0.3s",
            }}
          >
            {([
              [[14,8],[24,22],[34,36],[40,48]],
              [[66,8],[56,22],[46,36],[40,48]],
              [[40,48],[40,66],[40,88]],
            ] as number[][][]).map((arm,ai) =>
              arm.slice(0,-1).map((pt,i) => (
                <line key={`${ai}-${i}`}
                  x1={pt[0]} y1={pt[1]}
                  x2={arm[i+1][0]} y2={arm[i+1][1]}
                  stroke="rgba(96,165,250,0.85)" strokeWidth="1.6"/>
              ))
            )}
            {([[40,48,3.0]] as [number,number,number][]).map(([cx,cy,r],i) => (
              <circle key={i} cx={cx} cy={cy} r={r} fill="rgba(59,130,246,0.9)"/>
            ))}
          </svg>

          {/* Glitch logo */}
          <GlitchLogo progress={progress} />

          {/* Progress bar area */}
          <div style={{ width: "clamp(280px, 38vw, 520px)", display: "flex", flexDirection: "column", gap: 12 }}>
            <SegmentedBar progress={progress} />

            {/* Status + percentage */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <span
                key={statusIdx}
                style={{
                  fontSize: 11,
                  color: progress > 0.95 ? "rgba(0,229,255,0.9)" : "rgba(96,165,250,0.75)",
                  fontFamily: "'SF Mono','Fira Code',monospace",
                  letterSpacing: "0.04em",
                  flex: 1,
                  animation: "bootFadeIn 0.2s ease-out",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  transition: "color 0.4s",
                }}
              >
                <TypewriterLine text={currentStatus} speed={22} />
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontFamily: "'SF Mono','Fira Code',monospace",
                  color: "rgba(0,200,255,0.95)",
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  minWidth: 36,
                  textAlign: "right",
                  flexShrink: 0,
                  textShadow: progress > 0.9 ? "0 0 8px rgba(0,229,255,0.8)" : "none",
                  transition: "text-shadow 0.3s",
                }}
              >
                {Math.floor(progress * 100)}%
              </span>
            </div>
          </div>

          {/* Build info */}
          <div
            style={{
              fontSize: 10,
              color: "rgba(59,130,246,0.3)",
              letterSpacing: "0.12em",
              fontFamily: "'SF Mono','Fira Code',monospace",
              marginTop: -16,
            }}
          >
            v2.0.0 · BUILD 2026.03 · QUANTUM CORE
          </div>
        </div>
      </div>
    </>
  );
}
