import db from "./connection.js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const schema = readFileSync(resolve(__dirname, "schema.sql"), "utf-8");
db.exec(schema);

console.log("Migration complete.");
