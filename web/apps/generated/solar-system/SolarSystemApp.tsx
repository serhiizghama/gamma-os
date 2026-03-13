/**
 * Solar System — Gamma OS
 * Top-down heliocentric view with real orbital mechanics.
 * Scroll: zoom | Drag: pan | Click planet: info | 📅 date picker | Speed control
 */
import React, { useRef, useEffect, useState, useCallback } from "react";

// ── Epoch ──────────────────────────────────────────────────────────────────
const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);

// ── Planet definitions ─────────────────────────────────────────────────────
interface PlanetDef {
  name: string;
  color: string;
  glow: string;
  r: number;       // base visual radius (px at zoom=1)
  sma: number;     // semi-major axis, AU
  period: number;  // orbital period, days
  L0: number;      // mean longitude at J2000, degrees
  moons: number;
  desc: string;
  rings?: boolean;
}

const PLANETS: PlanetDef[] = [
  {
    name:"Mercury", color:"#a09880", glow:"#c8b89a", r:4,
    sma:0.387, period:87.97, L0:252.25, moons:0,
    desc:"Closest to the Sun. Surface temperature swings from −180 °C to 430 °C — no atmosphere to buffer the heat.",
  },
  {
    name:"Venus", color:"#e8cda0", glow:"#f5e080", r:7,
    sma:0.723, period:224.70, L0:181.98, moons:0,
    desc:"Hottest planet at 465 °C average. Dense CO₂ atmosphere creates a runaway greenhouse effect. The Sun rises in the west.",
  },
  {
    name:"Earth", color:"#4b9cd3", glow:"#6bbfff", r:7.5,
    sma:1.000, period:365.25, L0:100.47, moons:1,
    desc:"Our home. The only known planet with life. 71 % of the surface is liquid water.",
  },
  {
    name:"Mars", color:"#c1440e", glow:"#e06030", r:5,
    sma:1.524, period:686.97, L0:355.43, moons:2,
    desc:"The Red Planet. Olympus Mons is the tallest volcano in the solar system at 21 km. Home of many rover missions.",
  },
  {
    name:"Jupiter", color:"#c88b3a", glow:"#dfa050", r:18,
    sma:5.203, period:4332.59, L0:34.40, moons:95,
    desc:"Largest planet — 1 300 Earths would fit inside. The Great Red Spot is a storm raging for over 350 years.",
  },
  {
    name:"Saturn", color:"#e4d191", glow:"#f0e060", r:15,
    sma:9.537, period:10759.22, L0:50.08, moons:146,
    desc:"Famous for its stunning ring system made of ice and rock. The least dense planet — it would float on water.",
    rings: true,
  },
  {
    name:"Uranus", color:"#7de8e8", glow:"#9fffff", r:11,
    sma:19.191, period:30688.5, L0:314.06, moons:28,
    desc:"Ice giant rotating on its side at 98° axial tilt. Has 13 faint rings and experiences 84-year-long seasons.",
  },
  {
    name:"Neptune", color:"#4b70dd", glow:"#6090ff", r:11,
    sma:30.069, period:60182, L0:304.35, moons:16,
    desc:"Fastest winds in the solar system — up to 2 100 km/h. One orbit around the Sun takes 165 Earth years.",
  },
];

// ── Speed presets ──────────────────────────────────────────────────────────
const SPEEDS = [
  { label:"⏸ Pause",  daysPerSec: 0        },
  { label:"1 d/s",    daysPerSec: 1        },
  { label:"30 d/s",   daysPerSec: 30       },
  { label:"1 yr/s",   daysPerSec: 365.25   },
  { label:"10 yr/s",  daysPerSec: 3652.5   },
];

// ── Math helpers ───────────────────────────────────────────────────────────
const toRad = (d: number) => d * Math.PI / 180;

function shadeHex(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  const r = clamp((n >> 16) + amt);
  const g = clamp(((n >> 8) & 0xff) + amt);
  const b = clamp((n & 0xff) + amt);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/** Heliocentric angle at a given simulation timestamp (ms). */
function planetAngle(p: PlanetDef, simMs: number): number {
  const days = (simMs - J2000_MS) / 86_400_000;
  return toRad(p.L0 + (360 / p.period) * days);
}

/** Square-root compressed AU → display pixels so every planet is visible. */
const BASE_SCALE = 130;
const au2px = (sma: number, zoom: number) => Math.sqrt(sma) * BASE_SCALE * zoom;

/** Format timestamp as yyyy-MM-dd for <input type="date"> */
function toDateInput(ms: number): string {
  const d = new Date(ms);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

// ── Pre-computed background objects (deterministic, never moves) ──────────
interface Star { x: number; y: number; r: number; alpha: number; phase: number }
interface Asteroid { angle: number; sma: number; opacity: number }

function makeRNG(seed: number) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
}

function buildStars(w: number, h: number): Star[] {
  const rng = makeRNG(2024);
  return Array.from({ length: 550 }, () => ({
    x: rng() * w,
    y: rng() * h,
    r: rng() * 1.4 + 0.15,
    alpha: rng() * 0.55 + 0.35,
    phase: rng() * Math.PI * 2,
  }));
}

function buildAsteroids(): Asteroid[] {
  const rng = makeRNG(9999);
  return Array.from({ length: 340 }, () => ({
    angle:   rng() * Math.PI * 2,
    sma:     2.1 + rng() * 1.35,
    opacity: 0.1 + rng() * 0.3,
  }));
}

const STATIC_ASTEROIDS = buildAsteroids();

// ── Main component ─────────────────────────────────────────────────────────
export function SolarSystemApp(): React.ReactElement {
  // Canvas + animation refs
  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const starsRef       = useRef<Star[]>([]);
  const simMsRef       = useRef(Date.now());
  const lastTimestampR = useRef(0);
  const rafRef         = useRef(0);
  const lastDateUpd    = useRef(0);

  // Interaction refs
  const dragRef = useRef({ on: false, sx: 0, sy: 0, spx: 0, spy: 0 });

  // React state (visible UI)
  const [zoom,      setZoom]      = useState(1);
  const [pan,       setPan]       = useState({ x: 0, y: 0 });
  const [speedIdx,  setSpeedIdx]  = useState(2);     // 30 d/s default
  const [selected,  setSelected]  = useState<PlanetDef | null>(null);
  const [hovered,   setHovered]   = useState<PlanetDef | null>(null);
  const [dateLabel, setDateLabel] = useState("");
  const [dateInput, setDateInput] = useState(toDateInput(Date.now()));
  const [pickerOpen, setPickerOpen] = useState(false);

  // Mirror state → refs so the animation loop reads fresh values without restart
  const zoomRef    = useRef(zoom);
  const panRef     = useRef(pan);
  const speedRef   = useRef(speedIdx);
  const hovRef     = useRef(hovered);
  const selRef     = useRef(selected);
  zoomRef.current  = zoom;
  panRef.current   = pan;
  speedRef.current = speedIdx;
  hovRef.current   = hovered;
  selRef.current   = selected;

  // ── Canvas resize ──────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement!;
    const doResize = () => {
      canvas.width  = parent.clientWidth  || 1200;
      canvas.height = parent.clientHeight || 800;
      starsRef.current = buildStars(canvas.width, canvas.height);
    };
    doResize();
    const ro = new ResizeObserver(doResize);
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  // ── Draw loop (created once, reads state via refs) ──────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function frame(ts: number) {
      const ctx = canvas!.getContext("2d");
      if (!ctx) { rafRef.current = requestAnimationFrame(frame); return; }

      // Advance simulated time
      const dt = lastTimestampR.current ? (ts - lastTimestampR.current) / 1000 : 0;
      lastTimestampR.current = ts;
      simMsRef.current += SPEEDS[speedRef.current].daysPerSec * dt * 86_400_000;

      const t     = simMsRef.current;
      const z     = zoomRef.current;
      const ox    = panRef.current.x;
      const oy    = panRef.current.y;
      const W     = canvas!.width;
      const H     = canvas!.height;
      const cx    = W / 2 + ox;   // screen-space Sun X
      const cy    = H / 2 + oy;   // screen-space Sun Y

      // ── Background ──────────────────────────────────────────────────
      ctx.fillStyle = "#020510";
      ctx.fillRect(0, 0, W, H);

      // Subtle deep-space nebula glow around centre
      const nb = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.7);
      nb.addColorStop(0,   "rgba(14, 22, 58, 0.60)");
      nb.addColorStop(0.6, "rgba(4, 8, 28, 0.25)");
      nb.addColorStop(1,   "rgba(0, 0, 0, 0)");
      ctx.fillStyle = nb;
      ctx.fillRect(0, 0, W, H);

      // ── Stars (twinkle) ─────────────────────────────────────────────
      for (const s of starsRef.current) {
        const a = s.alpha * (0.78 + 0.22 * Math.sin(ts / 2100 + s.phase));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`;
        ctx.fill();
      }

      // ── Orbital path rings ──────────────────────────────────────────
      ctx.save();
      ctx.setLineDash([]);
      for (const pl of PLANETS) {
        ctx.beginPath();
        ctx.arc(cx, cy, au2px(pl.sma, z), 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,255,255,0.05)";
        ctx.lineWidth   = 1;
        ctx.stroke();
      }
      ctx.restore();

      // ── Asteroid belt ───────────────────────────────────────────────
      for (const a of STATIC_ASTEROIDS) {
        const dr = au2px(a.sma, z);
        ctx.beginPath();
        ctx.arc(
          cx + Math.cos(a.angle) * dr,
          cy + Math.sin(a.angle) * dr,
          0.8, 0, Math.PI * 2,
        );
        ctx.fillStyle = `rgba(188,175,155,${a.opacity.toFixed(2)})`;
        ctx.fill();
      }

      // ── Sun ─────────────────────────────────────────────────────────
      const sunR  = Math.max(13, 22 * Math.sqrt(z));
      const pulse = 1 + 0.016 * Math.sin(ts / 850);

      // Outer corona layers
      for (const [gr, ga] of [
        [sunR * 6.5 * pulse, 0.016],
        [sunR * 4.2 * pulse, 0.038],
        [sunR * 2.9,         0.075],
        [sunR * 2.0,         0.135],
      ] as [number, number][]) {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, gr);
        g.addColorStop(0,    `rgba(255,228,80,${ga})`);
        g.addColorStop(0.5,  `rgba(255,140,0,${(ga * 0.3).toFixed(3)})`);
        g.addColorStop(1,    "rgba(200,50,0,0)");
        ctx.beginPath();
        ctx.arc(cx, cy, gr, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
      }

      // Sun disc
      const sg = ctx.createRadialGradient(
        cx - sunR * 0.32, cy - sunR * 0.32, 0,
        cx, cy, sunR,
      );
      sg.addColorStop(0,    "#ffffe0");
      sg.addColorStop(0.18, "#ffdd50");
      sg.addColorStop(0.62, "#ff8800");
      sg.addColorStop(1,    "#cc2200");
      ctx.beginPath();
      ctx.arc(cx, cy, sunR, 0, Math.PI * 2);
      ctx.fillStyle = sg;
      ctx.fill();

      // ── Planets ─────────────────────────────────────────────────────
      for (const pl of PLANETS) {
        const ang  = planetAngle(pl, t);
        const dr   = au2px(pl.sma, z);
        const plx  = cx + Math.cos(ang) * dr;
        const ply  = cy + Math.sin(ang) * dr;
        const pr   = Math.max(2.5, pl.r * Math.sqrt(z));

        // Glow halo
        const gHalo = ctx.createRadialGradient(plx, ply, 0, plx, ply, pr * 4.8);
        gHalo.addColorStop(0,   pl.glow + "55");
        gHalo.addColorStop(0.45, pl.glow + "1c");
        gHalo.addColorStop(1,   "transparent");
        ctx.beginPath();
        ctx.arc(plx, ply, pr * 4.8, 0, Math.PI * 2);
        ctx.fillStyle = gHalo;
        ctx.fill();

        // Saturn rings (drawn behind body)
        if (pl.rings) {
          ctx.save();
          ctx.translate(plx, ply);
          ctx.scale(1, 0.30);
          for (const [ri, ro2, color] of [
            [pr * 1.38, pr * 1.96, "rgba(218, 200, 140, 0.62)"],
            [pr * 1.96, pr * 2.55, "rgba(202, 184, 124, 0.44)"],
            [pr * 2.55, pr * 2.90, "rgba(190, 170, 110, 0.22)"],
          ] as [number, number, string][]) {
            ctx.beginPath();
            ctx.arc(0, 0, ro2, 0, Math.PI * 2);
            ctx.arc(0, 0, ri,  0, Math.PI * 2, true);
            ctx.fillStyle = color;
            ctx.fill();
          }
          ctx.restore();
        }

        // Planet disc
        const pbg = ctx.createRadialGradient(
          plx - pr * 0.35, ply - pr * 0.35, pr * 0.06,
          plx, ply, pr,
        );
        pbg.addColorStop(0,    "#ffffff55");
        pbg.addColorStop(0.28, pl.color);
        pbg.addColorStop(1,    shadeHex(pl.color, -55));
        ctx.beginPath();
        ctx.arc(plx, ply, pr, 0, Math.PI * 2);
        ctx.fillStyle = pbg;
        ctx.fill();

        // Earth: faint atmosphere rim
        if (pl.name === "Earth") {
          const atm = ctx.createRadialGradient(plx, ply, pr * 0.9, plx, ply, pr * 1.38);
          atm.addColorStop(0, "rgba(80,170,255,0.20)");
          atm.addColorStop(1, "rgba(80,170,255,0)");
          ctx.beginPath();
          ctx.arc(plx, ply, pr * 1.38, 0, Math.PI * 2);
          ctx.fillStyle = atm;
          ctx.fill();
        }

        // Hover / selected ring
        const isHov = hovRef.current?.name  === pl.name;
        const isSel = selRef.current?.name  === pl.name;
        if (isHov || isSel) {
          ctx.beginPath();
          ctx.arc(plx, ply, pr + 5, 0, Math.PI * 2);
          ctx.strokeStyle = isSel ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.46)";
          ctx.lineWidth   = isSel ? 2 : 1.2;
          ctx.stroke();
        }

        // Label
        if (z >= 0.38) {
          const fs = Math.round(Math.min(14, 9.5 + z * 2));
          ctx.font      = `500 ${fs}px system-ui,-apple-system,sans-serif`;
          ctx.textAlign = "center";
          ctx.fillStyle = isSel ? "#fff" : "rgba(255,255,255,0.70)";
          ctx.fillText(pl.name, plx, ply + pr + 14);
        }
      }

      // ── Update date label (max once per ~800 ms) ────────────────────
      if (ts - lastDateUpd.current > 800) {
        lastDateUpd.current = ts;
        const d = new Date(simMsRef.current);
        setDateLabel(
          d.toLocaleDateString("en-US", { year:"numeric", month:"long", day:"numeric" })
        );
        setDateInput(toDateInput(simMsRef.current));
      }

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Hit-test (returns planet under cursor, or null) ────────────────────
  const hitTest = useCallback((mx: number, my: number): PlanetDef | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const cx = canvas.width  / 2 + panRef.current.x;
    const cy = canvas.height / 2 + panRef.current.y;
    const z  = zoomRef.current;
    for (const pl of PLANETS) {
      const ang = planetAngle(pl, simMsRef.current);
      const dr  = au2px(pl.sma, z);
      const plx = cx + Math.cos(ang) * dr;
      const ply = cy + Math.sin(ang) * dr;
      const pr  = Math.max(2.5, pl.r * Math.sqrt(z));
      if (Math.hypot(mx - plx, my - ply) < pr + 10) return pl;
    }
    return null;
  }, []);

  // ── Date picker ────────────────────────────────────────────────────────
  const handleDateChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setDateInput(val);
    if (!val) return;
    const ms = new Date(val).getTime();
    if (!isNaN(ms)) {
      simMsRef.current = ms;
      setSpeedIdx(0); // auto-pause
    }
  }, []);

  const jumpDays = useCallback((days: number) => {
    simMsRef.current += days * 86_400_000;
    setSpeedIdx(0);
  }, []);

  // ── Mouse / wheel handlers ─────────────────────────────────────────────
  const handleWheel = useCallback((e: React.WheelEvent) => {
    const f = e.deltaY < 0 ? 1.13 : 0.88;
    setZoom(z => Math.max(0.12, Math.min(12, z * f)));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    dragRef.current = {
      on: true,
      sx: e.clientX, sy: e.clientY,
      spx: panRef.current.x, spy: panRef.current.y,
    };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (dragRef.current.on) {
      setPan({
        x: dragRef.current.spx + e.clientX - dragRef.current.sx,
        y: dragRef.current.spy + e.clientY - dragRef.current.sy,
      });
    } else {
      const rect   = canvas.getBoundingClientRect();
      const scaleX = canvas.width  / rect.width;
      const scaleY = canvas.height / rect.height;
      const hit = hitTest(
        (e.clientX - rect.left) * scaleX,
        (e.clientY - rect.top)  * scaleY,
      );
      setHovered(hit);
      canvas.style.cursor = hit ? "pointer" : "grab";
    }
  }, [hitTest]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    const moved = Math.hypot(
      e.clientX - dragRef.current.sx,
      e.clientY - dragRef.current.sy,
    ) > 4;
    dragRef.current.on = false;
    if (!moved) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect   = canvas.getBoundingClientRect();
      const scaleX = canvas.width  / rect.width;
      const scaleY = canvas.height / rect.height;
      const hit = hitTest(
        (e.clientX - rect.left) * scaleX,
        (e.clientY - rect.top)  * scaleY,
      );
      setSelected(s => s?.name === hit?.name ? null : hit);
    }
  }, [hitTest]);

  // ── Shared glass-panel style ───────────────────────────────────────────
  const glass: React.CSSProperties = {
    background:     "rgba(2, 6, 20, 0.72)",
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
    border:         "1px solid rgba(255,255,255,0.09)",
    borderRadius:   10,
  };

  const btnBase: React.CSSProperties = {
    cursor: "pointer", fontFamily: "monospace",
    border: "1px solid transparent", borderRadius: 6,
    transition: "all 140ms",
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: "relative", width: "100%", height: "100%",
      overflow: "hidden", background: "#020510", userSelect: "none",
    }}>
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { setHovered(null); dragRef.current.on = false; }}
      />

      {/* ── TOP BAR: date + controls ────────────────────── */}
      <div style={{
        position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
        display: "flex", alignItems: "center", gap: 6,
        ...glass, padding: "5px 12px",
      }}>
        {/* Calendar toggle */}
        <button
          onClick={() => setPickerOpen(v => !v)}
          style={{
            ...btnBase,
            background: pickerOpen ? "rgba(255,200,50,0.18)" : "rgba(255,255,255,0.05)",
            borderColor: pickerOpen ? "rgba(255,200,50,0.4)" : "rgba(255,255,255,0.10)",
            color: pickerOpen ? "#ffd050" : "rgba(255,255,255,0.55)",
            fontSize: 15, padding: "1px 7px", lineHeight: 1.6,
          }}
          title="Pick a date"
        >📅</button>

        {/* Date label */}
        <span style={{
          color: "rgba(255,255,255,0.82)", fontSize: 13,
          fontFamily: "'JetBrains Mono','Courier New',monospace",
          letterSpacing: "0.05em", whiteSpace: "nowrap",
        }}>
          ☀ {dateLabel}
        </span>

        {/* TODAY button */}
        <button
          onClick={() => {
            simMsRef.current = Date.now();
            setSpeedIdx(2);
            setPickerOpen(false);
          }}
          style={{
            ...btnBase,
            background: "rgba(255,255,255,0.05)",
            borderColor: "rgba(255,255,255,0.10)",
            color: "rgba(255,255,255,0.45)",
            fontSize: 10, padding: "2px 9px",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#fff"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.45)"; }}
          title="Jump to today"
        >TODAY</button>
      </div>

      {/* ── DATE PICKER PANEL ───────────────────────────── */}
      {pickerOpen && (
        <div style={{
          position: "absolute", top: 56, left: "50%", transform: "translateX(-50%)",
          ...glass, padding: "16px 20px",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
          zIndex: 200,
        }}>
          <p style={{
            margin: 0, fontSize: 10, letterSpacing: "0.10em",
            color: "rgba(255,255,255,0.35)", fontFamily: "monospace",
          }}>TIME TRAVEL</p>

          {/* Date input */}
          <input
            type="date"
            value={dateInput}
            min="1600-01-01"
            max="2300-12-31"
            onChange={handleDateChange}
            style={{
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: 7, color: "#fff",
              fontSize: 15, padding: "7px 12px",
              fontFamily: "monospace", outline: "none",
              colorScheme: "dark", cursor: "pointer",
              letterSpacing: "0.05em",
            }}
          />

          {/* Jump buttons */}
          <div style={{ display: "flex", gap: 6 }}>
            {[
              { label: "−10 yr", days: -3652.5 },
              { label: "−1 yr",  days: -365.25 },
              { label: "+1 yr",  days:  365.25 },
              { label: "+10 yr", days:  3652.5 },
            ].map(({ label, days }) => (
              <button
                key={label}
                onClick={() => jumpDays(days)}
                style={{
                  ...btnBase,
                  background: "rgba(255,255,255,0.05)",
                  borderColor: "rgba(255,255,255,0.12)",
                  color: "rgba(255,255,255,0.55)",
                  fontSize: 11, padding: "5px 11px",
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.color = "#ffd050";
                  el.style.borderColor = "rgba(255,200,50,0.4)";
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.color = "rgba(255,255,255,0.55)";
                  el.style.borderColor = "rgba(255,255,255,0.12)";
                }}
              >{label}</button>
            ))}
          </div>

          <button
            onClick={() => setPickerOpen(false)}
            style={{
              ...btnBase,
              background: "rgba(255,200,50,0.15)",
              borderColor: "rgba(255,200,50,0.4)",
              color: "#ffd050",
              fontSize: 11, padding: "5px 30px",
              letterSpacing: "0.07em",
            }}
          >CLOSE</button>
        </div>
      )}

      {/* ── SPEED CONTROLS ──────────────────────────────── */}
      <div style={{
        position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)",
        display: "flex", gap: 4,
        ...glass, padding: "5px 8px",
      }}>
        {SPEEDS.map((s, i) => (
          <button
            key={i}
            onClick={() => setSpeedIdx(i)}
            style={{
              ...btnBase,
              padding: "5px 13px", fontSize: 11,
              background: speedIdx === i ? "rgba(255,200,50,0.18)" : "rgba(255,255,255,0.05)",
              borderColor: speedIdx === i ? "rgba(255,200,50,0.4)" : "transparent",
              color: speedIdx === i ? "#ffd050" : "rgba(255,255,255,0.48)",
            }}
          >{s.label}</button>
        ))}
      </div>

      {/* ── HINT ────────────────────────────────────────── */}
      <div style={{
        position: "absolute", bottom: 58, left: "50%", transform: "translateX(-50%)",
        color: "rgba(255,255,255,0.16)", fontSize: 10,
        fontFamily: "monospace", letterSpacing: "0.10em",
        whiteSpace: "nowrap", pointerEvents: "none",
      }}>
        SCROLL TO ZOOM · DRAG TO PAN · CLICK PLANET · 📅 TO TIME TRAVEL
      </div>

      {/* ── PLANET INFO CARD ────────────────────────────── */}
      {selected && (
        <div style={{
          position: "absolute", top: 58, right: 14, width: 262,
          ...glass,
          border: `1px solid ${selected.glow}30`,
          borderRadius: 12, padding: 20,
          boxShadow: `0 10px 36px rgba(0,0,0,0.55), 0 0 30px ${selected.glow}14`,
          color: "#fff",
        }}>
          {/* Planet header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <div style={{
              width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
              background: selected.color,
              boxShadow: `0 0 10px ${selected.glow}, 0 0 22px ${selected.glow}55`,
            }} />
            <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "0.04em" }}>
              {selected.name}
            </span>
            <button
              onClick={() => setSelected(null)}
              style={{
                marginLeft: "auto", background: "none", border: "none",
                color: "rgba(255,255,255,0.28)", cursor: "pointer",
                fontSize: 18, padding: 0, lineHeight: 1,
              }}
            >✕</button>
          </div>

          {/* Description */}
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.70, margin: "0 0 14px" }}>
            {selected.desc}
          </p>

          {/* Stats grid */}
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 14px", fontSize: 12 }}>
            {([
              ["Distance from Sun", `${selected.sma} AU`],
              ["Orbital period",
                selected.period < 1000
                  ? `${selected.period.toFixed(2)} days`
                  : `${(selected.period / 365.25).toFixed(2)} years`],
              ["Known moons", String(selected.moons)],
            ] as [string, string][]).map(([k, v]) => (
              <React.Fragment key={k}>
                <span style={{ color: "rgba(255,255,255,0.36)" }}>{k}</span>
                <span style={{ color: "rgba(255,255,255,0.88)", fontWeight: 600 }}>{v}</span>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {/* ── HOVER MINI LABEL (when no planet selected) ──── */}
      {hovered && !selected && (
        <div style={{
          position: "absolute", top: 58, right: 14,
          ...glass, borderRadius: 8, padding: "6px 15px",
          color: "rgba(255,255,255,0.82)", fontSize: 13,
          pointerEvents: "none",
          border: `1px solid ${hovered.glow}40`,
        }}>
          {hovered.name}
        </div>
      )}
    </div>
  );
}

export default SolarSystemApp;
