import React from "react";
import { useOSStore } from "../store/useOSStore";
import { AppIcon } from "./AppIcon";

// ── Dock ──────────────────────────────────────────────────────────────────

export function Dock(): React.ReactElement {
  const toggleLaunchpad = useOSStore((s) => s.toggleLaunchpad);
  const launchpadOpen   = useOSStore((s) => s.launchpadOpen);

  return (
    <div className="dock-trigger-area">
      <div className="dock-container">
        {/* Launchpad toggle */}
        <AppIcon
          icon={launchpadOpen ? "✦" : "⊞"}
          label="Apps"
          variant="dock"
          onClick={toggleLaunchpad}
          title="Launchpad"
        />
      </div>
    </div>
  );
}
