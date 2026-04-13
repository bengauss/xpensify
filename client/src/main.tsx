import { render } from "preact";
import { App } from "./app";
import "./index.css";
import { seedDatabase } from "./db/seed";

seedDatabase().catch(console.error);

render(<App />, document.getElementById("app")!);
