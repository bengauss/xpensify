import { render } from "preact";
import { App } from "./app";
import "./index.css";
import { seedDatabase } from "./db/seed";

seedDatabase().catch(console.error);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(console.error);
}

render(<App />, document.getElementById("app")!);
