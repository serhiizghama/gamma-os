import React, { useState, useCallback, useEffect, useRef } from "react";

type Op = "+" | "-" | "*" | "/" | null;

const NEON = "#00e5ff";
const NEON_DIM = "#00aabb";
const PURPLE = "#a855f7";
const DARK_BG = "#06060e";
const DISPLAY_BG = "#03030a";
const BORDER = "#1a1a3a";

interface Btn {
  label: string;
  val: string;
  type: "num" | "op" | "action" | "eq";
  wide?: boolean;
}

interface Spark {
  tx: number;
  ty: number;
  size: number;
  color: string;
  delay: number;
  duration: number;
}

interface Explosion {
  id: number;
  x: number;
  y: number;
  sparks: Spark[];
  ringColor: string;
}

const BUTTONS: Btn[] = [
  { label: "AC",  val: "ac",  type: "action" },
  { label: "+/−", val: "neg", type: "action" },
  { label: "%",   val: "%",   type: "action" },
  { label: "÷",   val: "/",   type: "op" },
  { label: "7",   val: "7",   type: "num" },
  { label: "8",   val: "8",   type: "num" },
  { label: "9",   val: "9",   type: "num" },
  { label: "×",   val: "*",   type: "op" },
  { label: "4",   val: "4",   type: "num" },
  { label: "5",   val: "5",   type: "num" },
  { label: "6",   val: "6",   type: "num" },
  { label: "−",   val: "-",   type: "op" },
  { label: "1",   val: "1",   type: "num" },
  { label: "2",   val: "2",   type: "num" },
  { label: "3",   val: "3",   type: "num" },
  { label: "+",   val: "+",   type: "op" },
  { label: "0",   val: "0",   type: "num", wide: true },
  { label: "·",   val: ".",   type: "num" },
  { label: "=",   val: "=",   type: "eq" },
];

function format(n: string): string {
  if (n === "Error") return n;
  const num = parseFloat(n);
  if (isNaN(num)) return n;
  const s = n.includes(".") ? n : num.toLocaleString("en", { maximumFractionDigits: 10 });
  return s.length > 14 ? num.toPrecision(8) : s;
}

function createExplosion(x: number, y: number, btnType: Btn["type"]): Explosion {
  const id = Date.now() + Math.random();

  const colorsByType: Record<Btn["type"], string[]> = {
    eq:     ["#00e5ff", "#ffffff", "#00ffaa", "#00e5ff"],
    op:     ["#a855f7", "#d88cff", "#cc66ff", "#ffffff"],
    action: ["#6666cc", "#9999ff", "#8888dd", "#aaaaff"],
    num:    ["#00e5ff", "#00aabb", "#88eeff", "#ffffff"],
  };
  const colors = colorsByType[btnType];

  const count = btnType === "eq" ? 18 : 12;
  const sparks: Spark[] = Array.from({ length: count }, (_, i) => {
    // spread in all directions with slight randomness
    const baseAngle = (i / count) * Math.PI * 2;
    const angle = baseAngle + (Math.random() - 0.5) * 0.6;
    const dist = 35 + Math.random() * 55;
    return {
      tx: Math.cos(angle) * dist,
      ty: Math.sin(angle) * dist,
      size: 2 + Math.random() * 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      delay: Math.random() * 60,
      duration: 380 + Math.random() * 200,
    };
  });

  return { id, x, y, sparks, ringColor: colors[0] };
}

export function CalculatorApp(): React.ReactElement {
  const [display, setDisplay] = useState("0");
  const [prev, setPrev] = useState<string | null>(null);
  const [op, setOp] = useState<Op>(null);
  const [fresh, setFresh] = useState(false);
  // For repeating last operation when = is pressed multiple times
  const [lastOp, setLastOp] = useState<Op>(null);
  const [lastOperand, setLastOperand] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [pressed, setPressed] = useState<string | null>(null);
  const [glitch, setGlitch] = useState(false);
  const [explosions, setExplosions] = useState<Explosion[]>([]);
  const [numAnimKey, setNumAnimKey] = useState(0);
  const [numAnimType, setNumAnimType] = useState<"type" | "result">("type");
  const [displayFlash, setDisplayFlash] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const styleRef = useRef<HTMLStyleElement | null>(null);

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      @keyframes scanline {
        0%   { transform: translateY(-100%); }
        100% { transform: translateY(200%); }
      }
      @keyframes flicker {
        0%,100% { opacity:1; }
        92%{ opacity:1; } 93%{ opacity:0.85; } 94%{ opacity:1; } 96%{ opacity:0.9; } 97%{ opacity:1; }
      }
      @keyframes glitch {
        0%   { text-shadow: 2px 0 #ff00ff, -2px 0 #00ffff; transform: translate(0); }
        20%  { text-shadow: -2px 0 #ff00ff, 2px 0 #00ffff; transform: translate(-3px, 1px); }
        40%  { text-shadow: 2px 0 #ff00ff, -2px 0 #00ffff; transform: translate(3px, -1px); }
        60%  { text-shadow: -2px 0 #ff00ff, 2px 0 #00ffff; transform: translate(0); }
        80%  { text-shadow: 2px 0 #ff00ff; transform: translate(1px); }
        100% { text-shadow: 0 0 8px #00e5ff, 0 0 20px #00e5ff; transform: translate(0); }
      }
      @keyframes spark-fly {
        0%   { transform: translate(0, 0) scale(1); opacity: 1; }
        60%  { opacity: 0.7; }
        100% { transform: translate(var(--tx), var(--ty)) scale(0.1); opacity: 0; }
      }
      @keyframes ring-expand {
        0%   { transform: translate(-50%, -50%) scale(0.2); opacity: 0.9; }
        100% { transform: translate(-50%, -50%) scale(2.8); opacity: 0; }
      }
      @keyframes num-type {
        0%   { transform: scale(1.18) translateX(4px); opacity: 0.5;
                text-shadow: 0 0 24px #fff, 0 0 40px #00e5ff; }
        55%  { transform: scale(0.97) translateX(0); opacity: 1; }
        100% { transform: scale(1) translateX(0); }
      }
      @keyframes num-result {
        0%   { transform: scale(2.6); opacity: 0; filter: blur(10px);
                text-shadow: 0 0 80px #fff, 0 0 140px #00e5ff, 0 0 200px #a855f7; }
        35%  { transform: scale(0.9); opacity: 1; filter: blur(0);
                text-shadow: 0 0 40px #00e5ff, 0 0 80px #00e5ff; }
        65%  { transform: scale(1.06); }
        85%  { transform: scale(0.98); }
        100% { transform: scale(1);
                text-shadow: 0 0 12px rgba(0,229,255,0.6), 0 0 30px rgba(0,229,255,0.27); }
      }
      @keyframes display-flash {
        0%   { opacity: 0.5; }
        100% { opacity: 0; }
      }
      .calc-display-anim { animation: flicker 5s infinite; }
      .calc-glitch        { animation: glitch 0.35s ease-out; }
      .calc-num-type      { animation: num-type 0.16s ease-out forwards; }
      .calc-num-result    { animation: num-result 0.45s cubic-bezier(0.22,1,0.36,1) forwards; }
    `;
    document.head.appendChild(style);
    styleRef.current = style;
    return () => { styleRef.current?.remove(); };
  }, []);

  const triggerGlitch = useCallback(() => {
    setGlitch(true);
    setTimeout(() => setGlitch(false), 380);
  }, []);

  const triggerNumAnim = useCallback((type: "type" | "result") => {
    setNumAnimType(type);
    setNumAnimKey(k => k + 1);
    if (type === "result") {
      setDisplayFlash(true);
      setTimeout(() => setDisplayFlash(false), 400);
    }
  }, []);

  const flash = useCallback((val: string) => {
    setPressed(val);
    setTimeout(() => setPressed(null), 130);
  }, []);

  const spawnExplosion = useCallback((btn: Btn, e: React.MouseEvent) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const explosion = createExplosion(x, y, btn.type);
    setExplosions(prev => [...prev, explosion]);
    // cleanup after longest possible animation
    setTimeout(() => {
      setExplosions(prev => prev.filter(ex => ex.id !== explosion.id));
    }, 700);
  }, []);

  const compute = useCallback((a: string, operator: Op, b: string): string => {
    const x = parseFloat(a), y = parseFloat(b);
    if (isNaN(x) || isNaN(y)) return "Error";
    let result: number;
    switch (operator) {
      case "+": result = x + y; break;
      case "-": result = x - y; break;
      case "*": result = x * y; break;
      case "/":
        if (y === 0) return "Error"; // Division by zero is undefined
        result = x / y;
        break;
      default: return b;
    }
    if (!isFinite(result)) return "Error";
    // Avoid floating-point drift: round to 10 significant digits
    const rounded = parseFloat(result.toPrecision(10));
    return String(rounded);
  }, []);

  const handle = useCallback((btn: Btn) => {
    flash(btn.val);

    if (btn.type === "action") {
      if (btn.val === "ac") {
        setDisplay("0"); setPrev(null); setOp(null); setFresh(false);
        setLastOp(null); setLastOperand(null);
      }
      else if (btn.val === "neg") setDisplay(d => (d === "0" || d === "Error") ? "0" : String(parseFloat(d) * -1));
      else if (btn.val === "%")   setDisplay(d => d === "Error" ? d : String(parseFloat(d) / 100));
      return;
    }

    // If display shows Error, block ops until user clears
    if (display === "Error" && btn.type === "op") return;

    if (btn.type === "op") {
      const newOp = btn.val as Op;
      if (op && prev !== null && !fresh) {
        // Chain: 5 + 3 * → compute 5+3 first, then start * with 8
        const res = compute(prev, op, display);
        setDisplay(res); setPrev(res);
      } else {
        setPrev(display);
      }
      setOp(newOp); setFresh(true);
      return;
    }

    if (btn.type === "eq") {
      if (op && prev !== null) {
        // Normal case: compute and save last op+operand for repeat
        const opSym = op === "*" ? "×" : op === "/" ? "÷" : op;
        const expr = `${format(prev)} ${opSym} ${format(display)}`;
        const res = compute(prev, op, display);
        setHistory(h => [`${expr} = ${format(res)}`, ...h].slice(0, 6));
        triggerGlitch();
        triggerNumAnim("result");
        setLastOp(op);
        setLastOperand(display);
        setDisplay(res); setPrev(null); setOp(null); setFresh(false);
      } else if (lastOp && lastOperand !== null) {
        // Repeat last operation: 5 + 3 = 8 → = → 11 → = → 14
        const opSym = lastOp === "*" ? "×" : lastOp === "/" ? "÷" : lastOp;
        const expr = `${format(display)} ${opSym} ${format(lastOperand)}`;
        const res = compute(display, lastOp, lastOperand);
        setHistory(h => [`${expr} = ${format(res)}`, ...h].slice(0, 6));
        triggerGlitch();
        triggerNumAnim("result");
        setDisplay(res);
      }
      return;
    }

    // Number / dot input
    triggerNumAnim("type");
    setDisplay(d => {
      // Clear error state on any digit press
      if (d === "Error") {
        setFresh(false);
        return btn.val === "." ? "0." : btn.val;
      }
      if (btn.val === "." && d.includes(".")) return d;
      if (fresh || d === "0") {
        setFresh(false);
        return btn.val === "." ? "0." : btn.val;
      }
      if (d.replace("-", "").replace(".", "").length >= 14) return d;
      return d + btn.val;
    });
  }, [op, prev, fresh, lastOp, lastOperand, display, compute, flash, triggerGlitch, triggerNumAnim]);

  const getBtnStyle = (btn: Btn): React.CSSProperties => {
    const isPressed = pressed === btn.val;
    const base: React.CSSProperties = {
      gridColumn: btn.wide ? "span 2" : undefined,
      border: "1px solid",
      borderRadius: 10,
      cursor: "pointer",
      fontSize: "clamp(14px, 2vw, 22px)",
      fontWeight: 600,
      fontFamily: "'SF Mono', 'Fira Code', monospace",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "all 0.08s ease",
      userSelect: "none",
      minHeight: 0,
    };

    if (btn.type === "eq") return { ...base,
      background: isPressed ? `${NEON}33` : `linear-gradient(135deg, ${NEON}22, ${NEON}44)`,
      borderColor: isPressed ? NEON : NEON_DIM,
      color: NEON,
      boxShadow: isPressed ? `0 0 20px ${NEON}99, inset 0 0 10px ${NEON}22` : `0 0 8px ${NEON}44`,
      transform: isPressed ? "scale(0.93)" : "scale(1)",
      fontSize: "clamp(16px, 2.5vw, 26px)",
    };
    if (btn.type === "op") return { ...base,
      background: isPressed ? `${PURPLE}44` : `${PURPLE}15`,
      borderColor: isPressed ? PURPLE : `${PURPLE}77`,
      color: PURPLE,
      boxShadow: isPressed ? `0 0 14px ${PURPLE}88` : `0 0 4px ${PURPLE}22`,
      transform: isPressed ? "scale(0.93)" : "scale(1)",
    };
    if (btn.type === "action") return { ...base,
      background: isPressed ? "#1e1e38" : "#111128",
      borderColor: isPressed ? "#5555bb" : "#252545",
      color: "#9999cc",
      transform: isPressed ? "scale(0.93)" : "scale(1)",
    };
    return { ...base,
      background: isPressed ? "#181835" : "#0d0d1e",
      borderColor: isPressed ? NEON + "55" : BORDER,
      color: "#dde0ff",
      transform: isPressed ? "scale(0.93)" : "scale(1)",
      boxShadow: isPressed ? `0 0 8px ${NEON}33` : "none",
    };
  };

  const opLabel = op === "*" ? "×" : op === "/" ? "÷" : op;
  const displayFontSize = display.length > 14 ? "clamp(18px,3vw,32px)"
    : display.length > 9  ? "clamp(22px,4vw,42px)"
    : display.length > 6  ? "clamp(28px,5vw,54px)"
    : "clamp(36px,6vw,72px)";

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%", height: "100%",
        background: DARK_BG,
        fontFamily: "'SF Mono', 'Fira Code', 'Courier New', monospace",
        display: "flex", flexDirection: "column",
        position: "relative", overflow: "hidden",
      }}
    >
      {/* Scanline */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 5, overflow: "hidden" }}>
        <div style={{
          width: "100%", height: 3,
          background: "linear-gradient(transparent, rgba(0,229,255,0.05), transparent)",
          animation: "scanline 7s linear infinite",
        }} />
      </div>

      {/* Explosion particles layer */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 20 }}>
        {explosions.map(ex => (
          <React.Fragment key={ex.id}>
            {/* Shockwave ring */}
            <div style={{
              position: "absolute",
              left: ex.x,
              top: ex.y,
              width: 40,
              height: 40,
              borderRadius: "50%",
              border: `2px solid ${ex.ringColor}`,
              boxShadow: `0 0 8px ${ex.ringColor}`,
              animation: "ring-expand 0.45s ease-out forwards",
            }} />
            {/* Sparks */}
            {ex.sparks.map((spark, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: ex.x,
                  top: ex.y,
                  width: spark.size,
                  height: spark.size,
                  borderRadius: "50%",
                  background: spark.color,
                  boxShadow: `0 0 ${spark.size * 2}px ${spark.color}`,
                  ["--tx" as string]: `${spark.tx}px`,
                  ["--ty" as string]: `${spark.ty}px`,
                  animation: `spark-fly ${spark.duration}ms ease-out ${spark.delay}ms forwards`,
                  opacity: 0,
                  marginLeft: -spark.size / 2,
                  marginTop: -spark.size / 2,
                }}
              />
            ))}
          </React.Fragment>
        ))}
      </div>

      {/* Display area */}
      <div className="calc-display-anim" style={{
        background: DISPLAY_BG,
        borderBottom: `1px solid ${BORDER}`,
        padding: "16px 24px 20px",
        flexShrink: 0,
        display: "flex", flexDirection: "column", justifyContent: "flex-end",
        minHeight: "22%",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Flash overlay on result */}
        {displayFlash && (
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: `radial-gradient(ellipse at 80% 60%, ${NEON}22 0%, ${PURPLE}11 40%, transparent 70%)`,
            animation: "display-flash 0.4s ease-out forwards",
            zIndex: 2,
          }} />
        )}

        {/* History */}
        <div style={{ marginBottom: 6, position: "relative", zIndex: 3 }}>
          {history.slice(0, 3).map((h, i) => (
            <div key={i} style={{
              fontSize: "clamp(9px, 1.2vw, 12px)",
              color: i === 0 ? "#3a3a77" : "#1e1e44",
              textAlign: "right", lineHeight: 1.7,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{h}</div>
          ))}
        </div>

        {/* Expression preview */}
        {prev !== null && (
          <div style={{
            fontSize: "clamp(11px, 1.5vw, 15px)",
            color: NEON + "55",
            textAlign: "right", marginBottom: 4,
            position: "relative", zIndex: 3,
          }}>
            {format(prev)} {opLabel}
          </div>
        )}

        {/* Main number — key forces re-mount to restart animation */}
        <div
          key={numAnimKey}
          className={[
            glitch ? "calc-glitch" : "",
            numAnimType === "result" ? "calc-num-result" : "calc-num-type",
          ].filter(Boolean).join(" ")}
          style={{
            fontSize: displayFontSize,
            fontWeight: 700,
            color: NEON,
            letterSpacing: 2,
            textShadow: `0 0 12px ${NEON}99, 0 0 30px ${NEON}44`,
            lineHeight: 1.1,
            textAlign: "right",
            whiteSpace: "nowrap",
            overflow: "hidden",
            transition: "font-size 0.1s",
            position: "relative", zIndex: 3,
          }}
        >
          {format(display)}
        </div>
      </div>

      {/* Button grid — fills remaining space */}
      <div style={{
        flex: 1,
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gridTemplateRows: "repeat(5, 1fr)",
        gap: 1,
        padding: 10,
        minHeight: 0,
      }}>
        {BUTTONS.map((btn) => (
          <button
            key={btn.val + btn.label}
            style={getBtnStyle(btn)}
            onMouseDown={(e) => {
              handle(btn);
              spawnExplosion(btn, e);
            }}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* Footer */}
      <div style={{
        textAlign: "center", padding: "6px 0 8px",
        fontSize: 9, color: "#141430", letterSpacing: 3, flexShrink: 0,
      }}>
        GAMMA OS · SYSTEM CORE
      </div>
    </div>
  );
}
