import React from "react";
import { useOSStore } from "../store/useOSStore";

export function Desktop(): React.ReactElement {
  const launchpadOpen = useOSStore((s) => s.launchpadOpen);
  const { bgBlur, bgSpeed } = useOSStore((s) => s.uiSettings);

  return (
    <div
      className={launchpadOpen ? "desktop--launchpad-open" : undefined}
      style={{ position: "absolute", inset: 0, zIndex: 0 }}
    >
      <div
        className="live-bg"
        style={{
          // CSS vars override the static values in os-theme.css
          "--bg-speed": `${bgSpeed}s`,
          "--bg-blur":  `${bgBlur}px`,
          animationDuration: `${bgSpeed}s`,
        } as React.CSSProperties}
      >
        <div className="live-bg__blobs">
          <div className="live-bg__blob live-bg__blob--1" style={{ filter: `blur(${bgBlur}px)` }} />
          <div className="live-bg__blob live-bg__blob--2" style={{ filter: `blur(${bgBlur}px)` }} />
          <div className="live-bg__blob live-bg__blob--3" style={{ filter: `blur(${Math.round(bgBlur * 0.9)}px)` }} />
          <div className="live-bg__blob live-bg__blob--4" style={{ filter: `blur(${Math.round(bgBlur * 0.85)}px)` }} />
          <div className="live-bg__blob live-bg__blob--5" style={{ filter: `blur(${Math.round(bgBlur * 0.95)}px)` }} />
        </div>
      </div>
    </div>
  );
}
