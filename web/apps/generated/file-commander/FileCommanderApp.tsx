/**
 * File Commander — Gamma OS  v4
 * Two-panel orthodox file manager.
 * Features: dual themes (light / dark), keyboard navigation, dotfiles toggle,
 *           file viewer, copy / move / delete / rename / mkdir.
 */
import React, {
  createContext, useContext,
  useState, useEffect, useCallback, useRef,
} from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface FsEntry {
  name: string; path: string;
  type: "file" | "directory" | "symlink" | "other";
  size: number; mtime: number; ext: string;
}
interface ListResult { path: string; parent: string | null; entries: FsEntry[]; }
type PanelId = "left" | "right";

// ─────────────────────────────────────────────────────────────────────────────
// API
// ─────────────────────────────────────────────────────────────────────────────

const API = "/api/fs";
const get  = (url: string) => fetch(url).then(r => r.ok ? r.json() : r.text().then(t => Promise.reject(new Error(t))));
const post = (url: string, body: object) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then(r => r.ok ? r.json() : r.text().then(t => Promise.reject(new Error(t))));

const apiList   = (p: string, hidden = false): Promise<ListResult> =>
  get(`${API}/list?path=${encodeURIComponent(p)}${hidden ? "&showHidden=true" : ""}`);
const apiRead   = (p: string) => get(`${API}/read?path=${encodeURIComponent(p)}`);
const apiMkdir  = (p: string) => post(`${API}/mkdir`, { path: p });
const apiCopy   = (src: string, dest: string) => post(`${API}/copy`, { src, dest });
const apiRename = (src: string, dest: string) => post(`${API}/rename`, { src, dest });
const apiDelete = (p: string) =>
  fetch(`${API}/delete?path=${encodeURIComponent(p)}`, { method: "DELETE" })
    .then(r => r.ok ? r.json() : r.text().then(t => Promise.reject(new Error(t))));

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function fmtSize(b: number) {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`;
  return `${(b / 1073741824).toFixed(2)} GB`;
}
function fmtDate(ms: number) {
  const d = new Date(ms), z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`;
}
function fileIcon(e: FsEntry) {
  if (e.type === "directory") return "📁";
  if (e.type === "symlink")   return "🔗";
  const m: Record<string,string> = {
    ".ts":"📘",".tsx":"📘",".js":"📙",".jsx":"📙",".mjs":"📙",
    ".json":"📋",".jsonc":"📋",".md":"📝",".mdx":"📝",
    ".txt":"📄",".log":"📄",".csv":"📄",".html":"🌐",".htm":"🌐",
    ".css":"🎨",".scss":"🎨",".sass":"🎨",
    ".png":"🖼️",".jpg":"🖼️",".jpeg":"🖼️",".gif":"🖼️",".svg":"🖼️",".webp":"🖼️",
    ".mp4":"🎬",".mov":"🎬",".mkv":"🎬",
    ".mp3":"🎵",".wav":"🎵",".flac":"🎵",
    ".zip":"📦",".tar":"📦",".gz":"📦",".7z":"📦",".dmg":"📦",
    ".pdf":"📕",".sh":"⚙️",".bash":"⚙️",".zsh":"⚙️",
    ".py":"🐍",".rb":"💎",".go":"🐹",".rs":"🦀",
    ".c":"⚡",".cpp":"⚡",".h":"⚡",
    ".java":"☕",".kt":"☕",".swift":"🍎",
    ".env":"🔧",".yaml":"🔧",".yml":"🔧",".toml":"🔧",".ini":"🔧",
    ".lock":"🔒",
  };
  return m[e.ext] ?? "📄";
}
function parentEntry(p: string): FsEntry {
  return { name: "..", path: p, type: "directory", size: 0, mtime: 0, ext: "" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Theme system
// ─────────────────────────────────────────────────────────────────────────────

interface Theme {
  isDark: boolean;
  bg: string; panelBg: string; panelBorder: string; panelBorderActive: string;
  headerBg: string; colHeaderBg: string; statusBg: string;
  rowHover: string; rowSelected: string; rowActiveSel: string;
  text: string; textDim: string; textDir: string; textDirParent: string;
  textFile: string; textSymlink: string; textDotfile: string; textDotfileDir: string;
  accent: string; accentBright: string; accentLight: string; accentText: string;
  danger: string; dangerBg: string; dangerBorder: string;
  success: string; successBg: string; successBorder: string;
  warning: string;
  btnBg: string; btnBorder: string; btnText: string;
  inputBg: string; inputBorder: string;
  scrollbar: string; scrollbarThumb: string;
  shadow: string; shadowPanel: string; shadowActive: string; shadowModal: string;
  divider: string;
}

const lightTheme: Theme = {
  isDark: false,
  bg:                 "#eef0f5",
  panelBg:            "#ffffff",
  panelBorder:        "#dde2eb",
  panelBorderActive:  "#3b82f6",
  headerBg:           "#f8f9fb",
  colHeaderBg:        "#f2f4f8",
  statusBg:           "#f8f9fb",
  rowHover:           "#f0f5ff",
  rowSelected:        "#dbeafe",
  rowActiveSel:       "#2563eb",
  text:               "#111827",
  textDim:            "#6b7280",
  textDir:            "#1d4ed8",
  textDirParent:      "#93c5fd",
  textFile:           "#1f2937",
  textSymlink:        "#7c3aed",
  textDotfile:        "#9ca3af",
  textDotfileDir:     "#93c5fd",
  accent:             "#2563eb",
  accentBright:       "#3b82f6",
  accentLight:        "#eff6ff",
  accentText:         "#1d4ed8",
  danger:             "#dc2626",
  dangerBg:           "#fef2f2",
  dangerBorder:       "#fca5a5",
  success:            "#16a34a",
  successBg:          "#f0fdf4",
  successBorder:      "#86efac",
  warning:            "#d97706",
  btnBg:              "#ffffff",
  btnBorder:          "#d1d5db",
  btnText:            "#374151",
  inputBg:            "#f3f5f9",
  inputBorder:        "#d1d5db",
  scrollbar:          "#f0f2f5",
  scrollbarThumb:     "#cbd5e1",
  shadow:             "0 1px 2px rgba(0,0,0,0.07)",
  shadowPanel:        "0 2px 8px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)",
  shadowActive:       "0 0 0 3px #3b82f625, 0 2px 12px rgba(59,130,246,0.12)",
  shadowModal:        "0 20px 60px rgba(0,0,0,0.14), 0 4px 16px rgba(0,0,0,0.08)",
  divider:            "#e5e7eb",
};

const darkTheme: Theme = {
  isDark: true,
  bg:                 "#0d1117",
  panelBg:            "#161b26",
  panelBorder:        "#252d3d",
  panelBorderActive:  "#4d8ae8",
  headerBg:           "#1a2235",
  colHeaderBg:        "#141926",
  statusBg:           "#111622",
  rowHover:           "#1e2a3e",
  rowSelected:        "#1a3358",
  rowActiveSel:       "#1e50c8",
  text:               "#e2e8f5",
  textDim:            "#6b80a0",
  textDir:            "#60a5fa",
  textDirParent:      "#3b82f6",
  textFile:           "#d0dae8",
  textSymlink:        "#c084fc",
  textDotfile:        "#4e6080",
  textDotfileDir:     "#3b6fb5",
  accent:             "#3b82f6",
  accentBright:       "#60a5fa",
  accentLight:        "#1e3a6b",
  accentText:         "#93c5fd",
  danger:             "#f87171",
  dangerBg:           "#2d1515",
  dangerBorder:       "#7f1d1d",
  success:            "#4ade80",
  successBg:          "#14271a",
  successBorder:      "#166534",
  warning:            "#fbbf24",
  btnBg:              "#1e2a3d",
  btnBorder:          "#2d3f5a",
  btnText:            "#a0b4cc",
  inputBg:            "#111826",
  inputBorder:        "#2a3548",
  scrollbar:          "#111826",
  scrollbarThumb:     "#2a3a52",
  shadow:             "0 1px 3px rgba(0,0,0,0.4)",
  shadowPanel:        "0 4px 16px rgba(0,0,0,0.35), 0 1px 4px rgba(0,0,0,0.2)",
  shadowActive:       "0 0 0 3px #4d8ae830, 0 4px 16px rgba(77,138,232,0.18)",
  shadowModal:        "0 24px 64px rgba(0,0,0,0.7), 0 4px 16px rgba(0,0,0,0.4)",
  divider:            "#1e2a3d",
};

const ThemeCtx = createContext<Theme>(lightTheme);
const useTheme = () => useContext(ThemeCtx);

// ─────────────────────────────────────────────────────────────────────────────
// Button style helper
// ─────────────────────────────────────────────────────────────────────────────

function btn(T: Theme, variant?: "danger"|"success"|"primary"|"ghost"): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: "3px 9px", background: T.btnBg,
    border: `1px solid ${T.btnBorder}`, borderRadius: 5,
    color: T.btnText, fontFamily: "inherit", fontSize: 11,
    cursor: "pointer", flexShrink: 0, lineHeight: "16px",
    transition: "background 0.12s, border-color 0.12s",
    boxShadow: T.shadow,
  };
  if (variant === "danger")  return { ...base, background: T.dangerBg,  borderColor: T.dangerBorder,  color: T.danger,  boxShadow: "none" };
  if (variant === "success") return { ...base, background: T.successBg, borderColor: T.successBorder, color: T.success, boxShadow: "none" };
  if (variant === "primary") return { ...base, background: T.accentLight, borderColor: T.accentBright, color: T.accentText, boxShadow: "none" };
  if (variant === "ghost")   return { ...base, background: "transparent", borderColor: "transparent", color: T.textDim, boxShadow: "none" };
  return base;
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel
// ─────────────────────────────────────────────────────────────────────────────

interface PanelProps {
  id: PanelId; active: boolean;
  onActivate: () => void; onNavigate: (p: string) => void;
  onFileOpen: (e: FsEntry) => void; onSelectionChange: (e: FsEntry|null) => void;
  refreshSignal: number; showHidden: boolean;
}

function Panel({ id, active, onActivate, onNavigate, onFileOpen, onSelectionChange, refreshSignal, showHidden }: PanelProps) {
  const T = useTheme();
  const [currentPath, setCurrentPath] = useState(id === "left" ? "/Users" : "/tmp");
  const [entries, setEntries]         = useState<FsEntry[]>([]);
  const [parent, setParent]           = useState<string|null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [hoveredIdx, setHoveredIdx]   = useState<number|null>(null);
  const [pathInput, setPathInput]     = useState(id === "left" ? "/Users" : "/tmp");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string|null>(null);

  const panelRef    = useRef<HTMLDivElement>(null);
  const listRef     = useRef<HTMLDivElement>(null);
  const pathInputRef = useRef<HTMLInputElement>(null);
  const isEditing   = useRef(false);
  const showHiddenRef = useRef(showHidden);
  showHiddenRef.current = showHidden;
  const pathRef = useRef(currentPath);

  const visible = showHidden ? entries : entries.filter(e => !e.name.startsWith("."));
  const display: FsEntry[] = parent ? [parentEntry(parent), ...visible] : visible;

  const load = useCallback(async (p: string, idx = 0) => {
    setLoading(true); setError(null);
    try {
      const r = await apiList(p, showHiddenRef.current);
      setCurrentPath(r.path); pathRef.current = r.path;
      setPathInput(r.path); setParent(r.parent);
      setEntries(r.entries); setSelectedIdx(idx);
      onNavigate(r.path);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [onNavigate]);

  // Initial load
  useEffect(() => { load(pathRef.current); }, []); // eslint-disable-line
  // Refresh signal
  useEffect(() => { if (refreshSignal > 0) load(pathRef.current); }, [refreshSignal, load]); // eslint-disable-line
  // showHidden toggle → reload + reset selection
  useEffect(() => { load(pathRef.current); setSelectedIdx(0); }, [showHidden]); // eslint-disable-line

  // Notify selection
  useEffect(() => {
    const s = display[selectedIdx];
    onSelectionChange(!s || s.name === ".." ? null : s);
  }, [selectedIdx, display, onSelectionChange]); // eslint-disable-line

  // Focus panel div when it becomes active
  useEffect(() => {
    if (active && !isEditing.current) panelRef.current?.focus({ preventScroll: true });
  }, [active]);

  // Keyboard handler (attached to panel div — NOT window)
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (isEditing.current) return;
    const len = display.length;
    if (!len) return;
    if (e.key === "ArrowDown")  { e.preventDefault(); setSelectedIdx(i => Math.min(i+1, len-1)); }
    else if (e.key === "ArrowUp")    { e.preventDefault(); setSelectedIdx(i => Math.max(i-1, 0)); }
    else if (e.key === "Enter" || e.key === "ArrowRight") {
      e.preventDefault();
      const entry = display[selectedIdx];
      if (!entry) return;
      if (entry.type === "directory") load(entry.path); else onFileOpen(entry);
    }
    else if (e.key === "Backspace" || e.key === "ArrowLeft") { e.preventDefault(); if (parent) load(parent); }
    else if (e.key === "Home")     { e.preventDefault(); setSelectedIdx(0); }
    else if (e.key === "End")      { e.preventDefault(); setSelectedIdx(len-1); }
    else if (e.key === "PageDown") { e.preventDefault(); setSelectedIdx(i => Math.min(i+15, len-1)); }
    else if (e.key === "PageUp")   { e.preventDefault(); setSelectedIdx(i => Math.max(i-15, 0)); }
  }, [display, selectedIdx, parent, load, onFileOpen]);

  // Auto-scroll to selected row
  useEffect(() => {
    if (!listRef.current) return;
    (listRef.current.children[selectedIdx] as HTMLElement)?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  const segs   = currentPath.split("/").filter(Boolean);
  const selEntry = display[selectedIdx];
  const files  = visible.filter(e => e.type === "file");
  const dirs   = visible.filter(e => e.type === "directory");
  const total  = files.reduce((s, e) => s + e.size, 0);
  const hidden = entries.length - visible.length;

  return (
    <div
      ref={panelRef} tabIndex={0} onKeyDown={onKeyDown}
      style={{
        display:"flex", flexDirection:"column", flex:1,
        background: T.panelBg,
        border: `1px solid ${active ? T.panelBorderActive : T.panelBorder}`,
        borderRadius: 8, overflow:"hidden", outline:"none",
        transition:"border-color 0.15s, box-shadow 0.15s",
        boxShadow: active ? T.shadowActive : T.shadowPanel,
      }}
      onClick={() => { onActivate(); panelRef.current?.focus({ preventScroll: true }); }}
    >
      {/* ── Path bar ── */}
      <div style={{ display:"flex", alignItems:"center", background:T.headerBg, borderBottom:`1px solid ${T.panelBorder}`, padding:"5px 8px", gap:6, flexShrink:0 }}>
        <span style={{ fontSize:10, fontWeight:700, color: active ? T.accentBright : T.textDim, letterSpacing:"0.07em", textTransform:"uppercase", flexShrink:0, transition:"color 0.15s", minWidth:10 }}>
          {id === "left" ? "L" : "R"}
        </span>
        <form onSubmit={e => { e.preventDefault(); isEditing.current=false; pathInputRef.current?.blur(); load(pathInput); }} style={{ flex:1, display:"flex" }}>
          <input
            ref={pathInputRef}
            value={pathInput}
            onChange={e => setPathInput(e.target.value)}
            onFocus={() => { isEditing.current=true; onActivate(); }}
            onBlur={() => { isEditing.current=false; setPathInput(pathRef.current); }}
            onKeyDown={e => { if (e.key==="Escape") pathInputRef.current?.blur(); }}
            spellCheck={false}
            style={{
              flex:1, background:T.inputBg, border:`1px solid ${T.inputBorder}`,
              borderRadius:5, color:T.text,
              fontFamily:"'JetBrains Mono','Fira Code',monospace",
              fontSize:11, padding:"3px 8px", outline:"none",
            }}
          />
        </form>
        <button style={btn(T)} onClick={e => { e.stopPropagation(); parent && load(parent); }} title="Up (Backspace/←)" disabled={!parent}>↑</button>
        <button style={btn(T)} onClick={e => { e.stopPropagation(); load(pathRef.current); }} title="Refresh">↻</button>
      </div>

      {/* ── Breadcrumbs ── */}
      <div style={{ display:"flex", alignItems:"center", padding:"3px 10px", background:T.bg, borderBottom:`1px solid ${T.divider}`, gap:2, flexShrink:0, minHeight:22, overflowX:"hidden" }}>
        <span style={{ color:T.textDim, cursor:"pointer", fontSize:10 }} onClick={() => load("/")}>⌂</span>
        {segs.map((seg, i) => {
          const sp = "/"+segs.slice(0,i+1).join("/");
          const last = i===segs.length-1;
          return (
            <React.Fragment key={sp}>
              <span style={{ color:T.divider, fontSize:10, margin:"0 1px" }}>›</span>
              <span
                onClick={() => !last && load(sp)}
                title={sp}
                style={{ color:last?T.text:T.textDim, fontSize:10, cursor:last?"default":"pointer",
                  fontWeight:last?600:400, overflow:"hidden", textOverflow:"ellipsis",
                  whiteSpace:"nowrap", maxWidth:last?"none":70, flexShrink:last?1:0 }}
              >{seg}</span>
            </React.Fragment>
          );
        })}
      </div>

      {/* ── Column headers ── */}
      <div style={{ display:"grid", gridTemplateColumns:"20px 1fr 68px 128px", gap:4, padding:"3px 12px 3px 8px", background:T.colHeaderBg, borderBottom:`1px solid ${T.panelBorder}`, color:T.textDim, fontSize:9, textTransform:"uppercase", letterSpacing:"0.08em", flexShrink:0 }}>
        <span/><span>Name</span>
        <span style={{ textAlign:"right" }}>Size</span>
        <span style={{ textAlign:"right" }}>Modified</span>
      </div>

      {/* ── File list ── */}
      <div ref={listRef} style={{ flex:1, overflowY:"auto", overflowX:"hidden", scrollbarWidth:"thin", scrollbarColor:`${T.scrollbarThumb} ${T.scrollbar}` }}>
        {loading && <div style={{ padding:"20px 0", color:T.textDim, textAlign:"center", fontSize:11 }}>⟳ Loading…</div>}
        {error   && <div style={{ padding:"12px 16px", color:T.danger, fontSize:11, lineHeight:1.5 }}>⚠ {error}</div>}
        {!loading && !error && display.map((entry, i) => {
          const isSel = i===selectedIdx, isHov = i===hoveredIdx && !isSel;
          const isPar = entry.name==="..";
          const isDot = !isPar && entry.name.startsWith(".");
          const isAct = isSel && active;
          let bg = "transparent";
          if (isAct) bg = T.rowActiveSel;
          else if (isSel) bg = T.rowSelected;
          else if (isHov) bg = T.rowHover;

          let nc = isDot ? T.textDotfile : T.textFile;
          if (isAct) nc = "#ffffff";
          else if (isPar) nc = T.textDirParent;
          else if (entry.type==="directory") nc = isDot ? T.textDotfileDir : T.textDir;
          else if (entry.type==="symlink")   nc = T.textSymlink;

          const dim = isAct ? "rgba(255,255,255,0.65)" : T.textDim;

          return (
            <div
              key={isPar ? "__par__" : entry.path}
              onClick={() => { setSelectedIdx(i); onActivate(); panelRef.current?.focus({ preventScroll:true }); }}
              onDoubleClick={() => { entry.type==="directory" ? load(entry.path) : onFileOpen(entry); }}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              style={{
                display:"grid", gridTemplateColumns:"20px 1fr 68px 128px", gap:4,
                padding: isAct ? "4px 6px" : "4px 8px",
                margin: isAct ? "1px 4px" : "0",
                cursor:"default", background:bg,
                borderRadius: isAct ? 5 : 0,
                borderLeft: isAct ? `3px solid rgba(255,255,255,0.4)` : `3px solid transparent`,
                transition:"background 0.07s",
              }}
            >
              <span style={{ fontSize:12, lineHeight:"20px", opacity: isPar ? 0.55 : 1 }}>{isPar ? "⬆" : fileIcon(entry)}</span>
              <span style={{
                overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                color:nc, fontWeight:entry.type==="directory"?600:400,
                fontStyle: isPar?"italic":"normal",
                opacity: isPar ? 0.6 : 1,
                fontSize:12, lineHeight:"20px",
                fontFamily:"'JetBrains Mono','Fira Code',monospace",
                letterSpacing:"-0.01em",
              }} title={isPar ? `↑ ${entry.path}` : entry.name}>
                {isPar ? ".." : entry.name}
                {!isPar && entry.type==="directory" && <span style={{ color:dim, fontWeight:400 }}>/</span>}
                {isDot && <span style={{ marginLeft:4, fontSize:8, color:T.warning, opacity:0.65 }}>●</span>}
              </span>
              <span style={{ textAlign:"right", color:dim, fontSize:11, lineHeight:"20px" }}>
                {isPar ? "" : entry.type==="file" ? fmtSize(entry.size) : "—"}
              </span>
              <span style={{ textAlign:"right", color:dim, fontSize:10, lineHeight:"20px" }}>
                {isPar || !entry.mtime ? "" : fmtDate(entry.mtime)}
              </span>
            </div>
          );
        })}
        {!loading && !error && display.length===0 && (
          <div style={{ padding:"24px 0", color:T.textDim, textAlign:"center", fontSize:11 }}>(empty directory)</div>
        )}
      </div>

      {/* ── Status bar ── */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"3px 10px", background:T.statusBg, borderTop:`1px solid ${T.panelBorder}`, color:T.textDim, fontSize:10, flexShrink:0, gap:8 }}>
        <span>
          📁 {dirs.length} &nbsp;·&nbsp; 📄 {files.length}
          {hidden>0 && !showHidden && <span style={{ color:T.warning, marginLeft:6 }} title={`${hidden} hidden (Ctrl+H)`}> · 👁 {hidden}</span>}
        </span>
        {selEntry && selEntry.name!==".." && (
          <span style={{ color:T.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:"50%", fontFamily:"'JetBrains Mono',monospace", fontSize:10 }}>
            {selEntry.name}{selEntry.type==="file" && <span style={{ color:T.textDim }}> {fmtSize(selEntry.size)}</span>}
          </span>
        )}
        <span>{fmtSize(total)}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// File Viewer
// ─────────────────────────────────────────────────────────────────────────────

function FileViewer({ path, onClose }: { path: string; onClose: () => void }) {
  const T = useTheme();
  const [content, setContent] = useState<string|null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string|null>(null);

  useEffect(() => {
    apiRead(path).then((r: { content: string; truncated: boolean }) => { setContent(r.content); setTruncated(r.truncated); })
      .catch((e: Error) => setError(e.message));
  }, [path]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key==="Escape"||e.key==="F3") { e.preventDefault(); onClose(); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const filename = path.split("/").pop() ?? path;
  return (
    <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.55)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100, backdropFilter:"blur(3px)" }} onClick={onClose}>
      <div style={{ background:T.panelBg, border:`1px solid ${T.panelBorderActive}`, borderRadius:10, width:"82%", height:"82%", display:"flex", flexDirection:"column", overflow:"hidden", boxShadow:T.shadowModal }} onClick={e => e.stopPropagation()}>
        <div style={{ display:"flex", alignItems:"center", padding:"8px 14px", background:T.headerBg, borderBottom:`1px solid ${T.panelBorder}`, gap:10 }}>
          <span style={{ fontSize:14 }}>👁</span>
          <span style={{ flex:1, fontSize:12, fontWeight:600, color:T.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{filename}</span>
          <span style={{ fontSize:10, color:T.textDim, overflow:"hidden", textOverflow:"ellipsis", maxWidth:"40%" }}>{path}</span>
          {truncated && <span style={{ color:T.warning, fontSize:10, flexShrink:0 }}>⚠ Truncated 512 KB</span>}
          <button style={btn(T,"danger")} onClick={onClose}>✕ Close</button>
        </div>
        <pre style={{ flex:1, overflow:"auto", margin:0, padding:16, fontSize:12, lineHeight:1.7, color:T.text, fontFamily:"'JetBrains Mono','Fira Code',monospace", whiteSpace:"pre-wrap", wordBreak:"break-all", scrollbarWidth:"thin", scrollbarColor:`${T.scrollbarThumb} ${T.scrollbar}`, background: T.isDark ? "#0d1117" : "#fdfdff" }}>
          {error ? <span style={{ color:T.danger }}>{error}</span> : content ?? "Loading…"}
        </pre>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dialogs
// ─────────────────────────────────────────────────────────────────────────────

function InputDialog({ title, placeholder, defaultValue="", onConfirm, onCancel }: { title:string; placeholder?:string; defaultValue?:string; onConfirm:(v:string)=>void; onCancel:()=>void }) {
  const T = useTheme();
  const [val, setVal] = useState(defaultValue);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return (
    <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200, backdropFilter:"blur(3px)" }}>
      <div style={{ background:T.panelBg, border:`1px solid ${T.panelBorder}`, borderRadius:10, padding:24, minWidth:380, display:"flex", flexDirection:"column", gap:14, boxShadow:T.shadowModal }}>
        <p style={{ margin:0, fontWeight:600, fontSize:13, color:T.text }}>{title}</p>
        <input ref={ref} value={val} placeholder={placeholder} onChange={e=>setVal(e.target.value)}
          onKeyDown={e=>{ if(e.key==="Enter")onConfirm(val); if(e.key==="Escape")onCancel(); }}
          style={{ background:T.inputBg, border:`1.5px solid ${T.accentBright}`, borderRadius:6, color:T.text, fontFamily:"inherit", fontSize:13, padding:"8px 10px", outline:"none" }}
        />
        <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
          <button style={{ ...btn(T), padding:"6px 18px" }} onClick={onCancel}>Cancel</button>
          <button style={{ ...btn(T,"success"), padding:"6px 18px" }} onClick={()=>onConfirm(val)}>OK</button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDialog({ message, onConfirm, onCancel }: { message:string; onConfirm:()=>void; onCancel:()=>void }) {
  const T = useTheme();
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if(e.key==="Enter")onConfirm(); if(e.key==="Escape")onCancel(); };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [onConfirm, onCancel]);
  return (
    <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200, backdropFilter:"blur(3px)" }}>
      <div style={{ background:T.panelBg, border:`1px solid ${T.dangerBorder}`, borderRadius:10, padding:24, minWidth:360, display:"flex", flexDirection:"column", gap:16, boxShadow:T.shadowModal }}>
        <p style={{ margin:0, fontSize:13, color:T.text, lineHeight:1.5 }}>{message}</p>
        <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
          <button style={{ ...btn(T), padding:"6px 18px" }} onClick={onCancel}>Cancel</button>
          <button style={{ ...btn(T,"danger"), padding:"6px 18px" }} onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main App
// ─────────────────────────────────────────────────────────────────────────────

interface Toast { id:number; msg:string; type:"ok"|"err"; }

export function FileCommanderApp(): React.ReactElement {
  const [isDark,        setIsDark]        = useState(false);
  const [activePanel,   setActivePanel]   = useState<PanelId>("left");
  const [showHidden,    setShowHidden]    = useState(false);
  const [leftSel,       setLeftSel]       = useState<FsEntry|null>(null);
  const [rightSel,      setRightSel]      = useState<FsEntry|null>(null);
  const [leftPath,      setLeftPath]      = useState("/Users");
  const [rightPath,     setRightPath]     = useState("/tmp");
  const [viewerPath,    setViewerPath]    = useState<string|null>(null);
  const [dialog,        setDialog]        = useState<null|{kind:"mkdir"|"rename"}>(null);
  const [confirmDel,    setConfirmDel]    = useState<FsEntry|null>(null);
  const [refreshL,      setRefreshL]      = useState(0);
  const [refreshR,      setRefreshR]      = useState(0);
  const [toasts,        setToasts]        = useState<Toast[]>([]);
  const toastId = useRef(0);
  const appRef  = useRef<HTMLDivElement>(null);

  const T = isDark ? darkTheme : lightTheme;

  const toast = useCallback((msg: string, type: "ok"|"err" = "ok") => {
    const id = ++toastId.current;
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id!==id)), 3500);
  }, []);

  const refreshActive = useCallback(() => {
    if (activePanel==="left") setRefreshL(n=>n+1); else setRefreshR(n=>n+1);
  }, [activePanel]);
  const refreshBoth = useCallback(() => { setRefreshL(n=>n+1); setRefreshR(n=>n+1); }, []);

  const activeEntry   = activePanel==="left" ? leftSel  : rightSel;
  const counterPath   = activePanel==="left" ? rightPath : leftPath;

  // ── Actions ──────────────────────────────────────────────────────────────

  const doCopy = async () => {
    if (!activeEntry) return;
    const dest = `${counterPath}/${activeEntry.name}`;
    try { await apiCopy(activeEntry.path, dest); toast(`✓ Copied → ${dest}`); if(activePanel==="left")setRefreshR(n=>n+1); else setRefreshL(n=>n+1); }
    catch(e:unknown){ toast(`✗ ${e instanceof Error?e.message:String(e)}`, "err"); }
  };
  const doMove = async () => {
    if (!activeEntry) return;
    const dest = `${counterPath}/${activeEntry.name}`;
    try { await apiRename(activeEntry.path, dest); toast(`✓ Moved → ${dest}`); refreshBoth(); }
    catch(e:unknown){ toast(`✗ ${e instanceof Error?e.message:String(e)}`, "err"); }
  };
  const doMkdir = async (name: string) => {
    const base = activePanel==="left" ? leftPath : rightPath;
    try { await apiMkdir(`${base}/${name}`); toast(`✓ Created: ${name}`); refreshActive(); }
    catch(e:unknown){ toast(`✗ ${e instanceof Error?e.message:String(e)}`, "err"); }
    setDialog(null);
  };
  const doDelete = async () => {
    if (!confirmDel) return;
    try { await apiDelete(confirmDel.path); toast(`✓ Deleted: ${confirmDel.name}`); refreshActive(); }
    catch(e:unknown){ toast(`✗ ${e instanceof Error?e.message:String(e)}`, "err"); }
    setConfirmDel(null);
  };
  const doRename = async (name: string) => {
    if (!activeEntry) return;
    const dir = activeEntry.path.substring(0, activeEntry.path.lastIndexOf("/"));
    try { await apiRename(activeEntry.path, `${dir}/${name}`); toast(`✓ Renamed → ${name}`); refreshActive(); }
    catch(e:unknown){ toast(`✗ ${e instanceof Error?e.message:String(e)}`, "err"); }
    setDialog(null);
  };

  // ── Global keyboard shortcuts ─────────────────────────────────────────────

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (appRef.current && !appRef.current.contains(e.target as Node)) return;
      if      (e.key==="Tab")   { e.preventDefault(); setActivePanel(p=>p==="left"?"right":"left"); }
      else if ((e.ctrlKey||e.metaKey) && e.key==="h") { e.preventDefault(); setShowHidden(v=>!v); }
      else if ((e.ctrlKey||e.metaKey) && e.key==="d") { e.preventDefault(); setIsDark(v=>!v); }
      else if (e.key==="F3")    { if(activeEntry?.type==="file"){ e.preventDefault(); setViewerPath(activeEntry.path); } }
      else if (e.key==="F5")    { e.preventDefault(); doCopy(); }
      else if (e.key==="F6")    { e.preventDefault(); if(activeEntry) setDialog({kind:"rename"}); }
      else if (e.key==="F7")    { e.preventDefault(); doMove(); }
      else if (e.key==="F8")    { e.preventDefault(); setDialog({kind:"mkdir"}); }
      else if (e.key==="Delete"||e.key==="F9") { e.preventDefault(); if(activeEntry) setConfirmDel(activeEntry); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [activeEntry, activePanel]); // eslint-disable-line

  const hasModal = !!viewerPath || !!dialog || !!confirmDel;

  // ── Bottom bar buttons config ─────────────────────────────────────────────

  const actions = [
    { key:"F3",  label:"View",   act:()=>activeEntry?.type==="file"&&setViewerPath(activeEntry.path), off:!activeEntry||activeEntry.type!=="file" },
    { key:"F5",  label:"Copy →", act:doCopy,  off:!activeEntry, v:"primary" as const },
    { key:"F6",  label:"Rename", act:()=>activeEntry&&setDialog({kind:"rename"}), off:!activeEntry },
    { key:"F7",  label:"Move →", act:doMove,  off:!activeEntry, v:"primary" as const },
    { key:"F8",  label:"Mkdir",  act:()=>setDialog({kind:"mkdir"}), off:false },
    { key:"Del", label:"Delete", act:()=>activeEntry&&setConfirmDel(activeEntry), off:!activeEntry, v:"danger" as const },
  ];

  return (
    <ThemeCtx.Provider value={T}>
      <div ref={appRef} style={{ display:"flex", flexDirection:"column", height:"100%", background:T.bg, fontFamily:"-apple-system,'Inter','Segoe UI',system-ui,sans-serif", fontSize:12, color:T.text, overflow:"hidden", userSelect:"none", position:"relative" }}>

        {/* ── Toolbar ── */}
        <div style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 12px", background:T.panelBg, borderBottom:`1px solid ${T.panelBorder}`, flexShrink:0, boxShadow:`0 1px 0 ${T.divider}` }}>
          <span style={{ fontSize:16 }}>📂</span>
          <span style={{ fontWeight:700, fontSize:13, color:T.text, letterSpacing:"-0.01em" }}>File Commander</span>
          <span style={{ flex:1 }}/>
          {activeEntry && (
            <span style={{ display:"flex", alignItems:"center", gap:5, background:T.accentLight, border:`1px solid ${T.accentBright}30`, borderRadius:5, padding:"2px 9px" }}>
              <span style={{ color:T.accentText, fontSize:11, fontWeight:500, maxWidth:200, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{activeEntry.name}</span>
              {activeEntry.type==="file" && <span style={{ color:T.textDim, fontSize:10 }}>{fmtSize(activeEntry.size)}</span>}
            </span>
          )}

          {/* Hidden toggle */}
          <button
            onClick={() => setShowHidden(v=>!v)}
            title="Toggle hidden files (Ctrl+H)"
            style={{ ...btn(T, showHidden ? "primary" : undefined), padding:"3px 10px", fontWeight: showHidden ? 600 : 400 }}
          >
            {showHidden ? "👁 Hidden: ON" : "👁 Hidden: OFF"}
          </button>

          {/* Theme toggle */}
          <button
            onClick={() => setIsDark(v=>!v)}
            title={`Switch to ${isDark ? "light" : "dark"} theme (Ctrl+D)`}
            style={{ ...btn(T), padding:"3px 10px", display:"flex", alignItems:"center", gap:5 }}
          >
            <span style={{ fontSize:13 }}>{isDark ? "☀️" : "🌙"}</span>
            <span>{isDark ? "Light" : "Dark"}</span>
          </button>

          <button style={{ ...btn(T), padding:"3px 10px" }} onClick={refreshBoth} title="Refresh both panels">↻ Refresh</button>
        </div>

        {/* ── Panels ── */}
        <div style={{ display:"flex", flex:1, overflow:"hidden", gap:5, padding:"5px" }}>
          <Panel id="left"  active={activePanel==="left"  && !hasModal} onActivate={()=>setActivePanel("left")}  onNavigate={setLeftPath}  onFileOpen={e=>setViewerPath(e.path)} onSelectionChange={setLeftSel}  refreshSignal={refreshL} showHidden={showHidden}/>
          <Panel id="right" active={activePanel==="right" && !hasModal} onActivate={()=>setActivePanel("right")} onNavigate={setRightPath} onFileOpen={e=>setViewerPath(e.path)} onSelectionChange={setRightSel} refreshSignal={refreshR} showHidden={showHidden}/>
        </div>

        {/* ── Bottom bar ── */}
        <div style={{ display:"flex", gap:4, padding:"5px 8px", background:T.panelBg, borderTop:`1px solid ${T.panelBorder}`, flexShrink:0 }}>
          {actions.map(({ key, label, act, off, v }) => (
            <button key={key}
              style={{ ...btn(T, off ? undefined : v), flex:1, padding:"5px 0", opacity:off?0.38:1, cursor:off?"not-allowed":"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:1 }}
              onClick={off ? undefined : act} disabled={off} title={`${key} ${label}`}
            >
              <span style={{ fontSize:9, color:T.textDim, lineHeight:1 }}>{key}</span>
              <span style={{ fontSize:11, lineHeight:1 }}>{label}</span>
            </button>
          ))}
        </div>

        {/* ── File viewer ── */}
        {viewerPath && <FileViewer path={viewerPath} onClose={()=>setViewerPath(null)}/>}

        {/* ── Dialogs ── */}
        {dialog?.kind==="mkdir" && <InputDialog title="📁 Create new folder" placeholder="folder-name" onConfirm={doMkdir} onCancel={()=>setDialog(null)}/>}
        {dialog?.kind==="rename" && activeEntry && <InputDialog title={`✏️ Rename "${activeEntry.name}"`} defaultValue={activeEntry.name} onConfirm={doRename} onCancel={()=>setDialog(null)}/>}
        {confirmDel && <ConfirmDialog message={`🗑 Delete "${confirmDel.name}"?\n\nThis cannot be undone.`} onConfirm={doDelete} onCancel={()=>setConfirmDel(null)}/>}

        {/* ── Toasts ── */}
        <div style={{ position:"absolute", bottom:54, right:14, display:"flex", flexDirection:"column", gap:5, pointerEvents:"none", zIndex:300, maxWidth:320 }}>
          {toasts.map(t => (
            <div key={t.id} style={{ padding:"8px 14px", background:t.type==="ok"?T.successBg:T.dangerBg, border:`1px solid ${t.type==="ok"?T.successBorder:T.dangerBorder}`, borderRadius:8, fontSize:12, color:t.type==="ok"?T.success:T.danger, boxShadow:T.shadowPanel, fontWeight:500 }}>
              {t.msg}
            </div>
          ))}
        </div>

      </div>
    </ThemeCtx.Provider>
  );
}

export default FileCommanderApp;
