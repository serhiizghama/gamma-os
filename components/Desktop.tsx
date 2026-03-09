import React from "react";
import { useOSStore } from "../store/useOSStore";

/**
 * Desktop — Live Nebula background.
 */
export function Desktop(): React.ReactElement {
  const launchpadOpen       = useOSStore((s) => s.launchpadOpen);
  const { bgBlur, bgSpeed } = useOSStore((s) => s.uiSettings);

  return (
    <div
      className={launchpadOpen ? "desktop--launchpad-open" : undefined}
      style={{ position: "absolute", inset: 0, zIndex: 0 }}
    >
      <div
        className="live-bg"
        style={{ animationDuration: `${bgSpeed}s` } as React.CSSProperties}
      >
        <div className="live-bg__blobs">
          {[1, 2, 3, 4, 5].map((n) => (
            <div
              key={n}
              className={`live-bg__blob live-bg__blob--${n}`}
              style={{ filter: `blur(${Math.round(bgBlur * (n < 4 ? 1 : 0.9))}px)` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
