import { render } from "preact";
import { App } from "./app";
import "./index.css";

render(<App />, document.getElementById("app")!);

// iOS Safari can restore from bfcache with stale viewport dimensions.
// Force a reflow on restore so the shell re-measures against the real viewport.
window.addEventListener("pageshow", (e) => {
  if (e.persisted) {
    document.body.style.display = "none";
    void document.body.offsetHeight;
    document.body.style.display = "";
  }
});

const idle = (cb: () => void) =>
  "requestIdleCallback" in window
    ? requestIdleCallback(cb)
    : setTimeout(cb, 1);

idle(() => {
  import("./db/seed").then(({ seedDatabase }) => seedDatabase().catch(console.error));
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(console.error);
  }
});
