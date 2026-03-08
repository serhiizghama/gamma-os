import React from "react";
import { useOSStore } from "../store/useOSStore";

export function Desktop(): React.ReactElement {
  const launchpadOpen = useOSStore((s) => s.launchpadOpen);

  return (
    <div
      className={launchpadOpen ? "desktop--launchpad-open" : undefined}
      style={{ position: "absolute", inset: 0, zIndex: 0 }}
    >
      {/* Live animated background — blobs are GPU-composited via transform only */}
      <div className="live-bg">
        <div className="live-bg__blob live-bg__blob--1" />
        <div className="live-bg__blob live-bg__blob--2" />
        <div className="live-bg__blob live-bg__blob--3" />
        <div className="live-bg__blob live-bg__blob--4" />
      </div>
    </div>
  );
}
