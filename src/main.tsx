import React from "react";
import ReactDOM from "react-dom/client";
import { GammaOS } from "../components/GammaOS";
import { useOSStore } from "../store/useOSStore";

// Dev seed: open a couple of test windows on load
const store = useOSStore.getState();
store.openWindow("terminal", "Terminal");
store.openWindow("browser", "Browser");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <GammaOS />
  </React.StrictMode>
);
