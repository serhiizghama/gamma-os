import React, { useEffect, useRef } from "react";
import { useOSStore } from "../store/useOSStore";

// ── Canvas Nebula ─────────────────────────────────────────────────────────
//
// Performance strategy:
//  1. Render at SCALE (30%) resolution → CSS stretches to 100% → free softness,
//     zero filter: blur() overhead (no composite layer per blob).
//  2. Hard 30fps cap via timestamp delta — skips frames when browser is busy.
//  3. Single <canvas> element = single composite layer total.
//  4. Gradient blobs use ctx.createRadialGradient — hardware path, no overdraw stacking.

const SCALE = 0.3; // render resolution ratio
const TARGET_FPS = 30;
const FRAME_MS = 1000 / TARGET_FPS;

interface Blob {
  // base position [0..1]
  bx: number;
  by: number;
  // orbit amplitude [0..1]
  ax: number;
  ay: number;
  // radius as fraction of min(W,H)
  r: number;
  // animation speed (radians/ms)
  sx: number;
  sy: number;
  // phase offset
  px: number;
  py: number;
  // RGBA color components
  rgb: [number, number, number];
  // peak opacity at center
  alpha: number;
}

const BLOBS: Blob[] = [
  { bx: 0.12, by: 0.12, ax: 0.18, ay: 0.14, r: 0.70, sx: 0.00028, sy: 0.00021, px: 0.0, py: 0.0, rgb: [59,  130, 246], alpha: 0.50 }, // accent blue  — top-left
  { bx: 0.82, by: 0.18, ax: 0.14, ay: 0.16, r: 0.60, sx: 0.00020, sy: 0.00031, px: 1.2, py: 2.1, rgb: [99,  102, 241], alpha: 0.42 }, // indigo       — top-right
  { bx: 0.30, by: 0.72, ax: 0.16, ay: 0.12, r: 0.58, sx: 0.00034, sy: 0.00018, px: 2.5, py: 0.8, rgb: [56,  189, 248], alpha: 0.38 }, // cyan         — bottom-left
  { bx: 0.75, by: 0.78, ax: 0.12, ay: 0.18, r: 0.65, sx: 0.00022, sy: 0.00028, px: 3.8, py: 1.5, rgb: [37,   99, 235], alpha: 0.40 }, // deep blue    — bottom-right
  { bx: 0.50, by: 0.45, ax: 0.10, ay: 0.10, r: 0.45, sx: 0.00040, sy: 0.00035, px: 5.0, py: 3.3, rgb: [96,  165, 250], alpha: 0.28 }, // soft blue    — center
];

function NebulaCanvas(): React.ReactElement {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const resize = () => {
      canvas.width  = Math.max(1, Math.floor(window.innerWidth  * SCALE));
      canvas.height = Math.max(1, Math.floor(window.innerHeight * SCALE));
    };
    resize();

    const onResize = () => resize();
    window.addEventListener("resize", onResize);

    let rafId = 0;
    let lastTs = 0;

    const draw = (ts: number) => {
      rafId = requestAnimationFrame(draw);

      // Hard fps cap
      if (ts - lastTs < FRAME_MS) return;
      lastTs = ts;

      const W = canvas.width;
      const H = canvas.height;
      const minDim = Math.min(W, H);

      // Dark base gradient (top → bottom)
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#0d1528");
      bg.addColorStop(1, "#04060f");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Blob pass — each blob: compute animated center, draw radial gradient rect
      ctx.globalCompositeOperation = "lighter"; // additive blending = natural color mix

      for (const b of BLOBS) {
        const cx = (b.bx + Math.sin(ts * b.sx + b.px) * b.ax) * W;
        const cy = (b.by + Math.cos(ts * b.sy + b.py) * b.ay) * H;
        const r  = b.r * minDim;

        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0.00, `rgba(${b.rgb},${b.alpha})`);
        g.addColorStop(0.35, `rgba(${b.rgb},${(b.alpha * 0.4).toFixed(3)})`);
        g.addColorStop(0.70, `rgba(${b.rgb},${(b.alpha * 0.08).toFixed(3)})`);
        g.addColorStop(1.00, `rgba(${b.rgb},0)`);

        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }

      ctx.globalCompositeOperation = "source-over";

      // Vignette — darken edges, draw over blobs
      const vig = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.72);
      vig.addColorStop(0.40, "rgba(0,0,0,0)");
      vig.addColorStop(1.00, "rgba(0,0,0,0.62)");
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, W, H);
    };

    rafId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        // imageRendering: bilinear by default — the upscaling provides natural softness
      }}
    />
  );
}

// ── Static dot grid (CSS only, no filter, no animation — zero cost) ───────

function GridOverlay(): React.ReactElement {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 1,
        backgroundImage:
          "radial-gradient(circle, rgba(99,130,246,0.15) 1px, transparent 1px)",
        backgroundSize: "36px 36px",
        maskImage:
          "radial-gradient(ellipse 75% 75% at 50% 50%, black 20%, transparent 100%)",
        WebkitMaskImage:
          "radial-gradient(ellipse 75% 75% at 50% 50%, black 20%, transparent 100%)",
      }}
    />
  );
}

// ── Brand watermark ───────────────────────────────────────────────────────

function BrandWatermark(): React.ReactElement {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        zIndex: 2,
        gap: "clamp(14px, 2vw, 36px)",
      }}
    >
      <svg
        viewBox="0 0 80 100"
        style={{ width: "clamp(30px, 5vw, 68px)", height: "auto", opacity: 0.40, flexShrink: 0 }}
      >
        {([
          [[14, 8],  [24, 22], [34, 36], [40, 48]],
          [[66, 8],  [56, 22], [46, 36], [40, 48]],
          [[40, 48], [40, 66], [40, 88]],
        ] as number[][][]).map((arm, ai) =>
          arm.slice(0, -1).map((pt, i) => (
            <line
              key={`${ai}-${i}`}
              x1={pt[0]} y1={pt[1]}
              x2={arm[i + 1][0]} y2={arm[i + 1][1]}
              stroke="rgba(59,130,246,0.55)"
              strokeWidth="1.4"
            />
          ))
        )}
        <line x1="24" y1="22" x2="56" y2="22" stroke="rgba(59,130,246,0.2)" strokeWidth="0.8" />
        <line x1="34" y1="36" x2="46" y2="36" stroke="rgba(59,130,246,0.2)" strokeWidth="0.8" />
        {([
          [14, 8, 2.2], [66, 8, 2.2], [24, 22, 1.6], [56, 22, 1.6],
          [34, 36, 1.4], [46, 36, 1.4], [40, 48, 2.8],
          [40, 66, 1.6], [40, 88, 2.0],
          [8, 28, 1.0], [72, 28, 1.0], [18, 58, 0.9], [54, 72, 0.9],
        ] as [number, number, number][]).map(([cx, cy, r], i) => (
          <circle
            key={i} cx={cx} cy={cy} r={r}
            fill={i === 6 ? "rgba(59,130,246,0.72)" : "rgba(96,165,250,0.38)"}
          />
        ))}
      </svg>

      <span
        style={{
          fontSize: "clamp(44px, 7.5vw, 100px)",
          fontWeight: 900,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          fontFamily: "'SF Pro Display', -apple-system, sans-serif",
          color: "transparent",
          WebkitTextStroke: "1px rgba(59,130,246,0.20)",
          textShadow: "0 0 120px rgba(59,130,246,0.10)",
          userSelect: "none",
          opacity: 0.60,
        }}
      >
        Gamma OS
      </span>
    </div>
  );
}

// ── Desktop ───────────────────────────────────────────────────────────────

export function Desktop(): React.ReactElement {
  const launchpadOpen = useOSStore((s) => s.launchpadOpen);

  return (
    <div
      className={launchpadOpen ? "desktop--launchpad-open" : undefined}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 0,
        overflow: "hidden",
        background: "#04060f",
      }}
    >
      <NebulaCanvas />
      <GridOverlay />
      <BrandWatermark />
    </div>
  );
}
