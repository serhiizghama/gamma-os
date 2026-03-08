import React from "react";
import { useOSStore } from "../store/useOSStore";

/**
 * Desktop — renders the live nebula background.
 *
 * Architecture:
 * - Base: deep dark gradient (midnight blue → charcoal → deep purple)
 * - 5 blurred blob layers with mix-blend-mode:screen create the nebula glow
 * - All motion via transform only (GPU-composited, no layout reflow)
 * - Noise texture via SVG filter overlay for film-grain depth
 */
export function Desktop(): React.ReactElement {
  const launchpadOpen = useOSStore((s) => s.launchpadOpen);

  return (
    <div
      className={launchpadOpen ? "desktop--launchpad-open" : undefined}
      style={{ position: "absolute", inset: 0, zIndex: 0 }}
    >
      <div className="live-bg">
        <div className="live-bg__blob live-bg__blob--1" />
        <div className="live-bg__blob live-bg__blob--2" />
        <div className="live-bg__blob live-bg__blob--3" />
        <div className="live-bg__blob live-bg__blob--4" />
        <div className="live-bg__blob live-bg__blob--5" />
      </div>
    </div>
  );
}
