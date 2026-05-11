import { render } from "preact";
import { App } from "./app";
import "./index.css";

render(<App />, document.getElementById("app")!);

const idle = (cb: () => void) =>
  "requestIdleCallback" in window
    ? requestIdleCallback(cb)
    : setTimeout(cb, 1);

idle(() => {
  import("./db/seed").then(({ seedDatabase }) => seedDatabase().catch(console.error));
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => import("./sync/swUpdater").then((m) => m.startSwUpdater()))
      .catch(console.error);
  }
});
