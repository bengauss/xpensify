#!/usr/bin/env node
// Preflight Node-version guard for `npm test` (wired as `pretest` in client + server).
//
// Why this exists: the test stack (jsdom, vitest 4) is ESM-only and needs Node
// >= 20.19. On an older Node, vitest dies deep inside jsdom with a cryptic
// `ERR_REQUIRE_ESM` and "no tests" — easy to mistake for a code bug. The repo
// already declares the floor via `engines` and pins `.nvmrc` to 22, but neither
// is enforced when the shell's default `node` is older (e.g. system /usr/bin/node).
// This converts that into one clear line telling you to switch Node.
//
// Reads the floor from the calling package's own `engines.node` so there's a
// single source of truth.
import { readFileSync } from "node:fs";
import { join } from "node:path";

function floorFromEngines() {
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    const m = String(pkg.engines?.node ?? "").match(/(\d+)\.(\d+)/);
    if (m) return [Number(m[1]), Number(m[2])];
  } catch {
    /* fall through to default */
  }
  return [20, 19];
}

const [floorMajor, floorMinor] = floorFromEngines();
const [major, minor] = process.versions.node.split(".").map(Number);

if (major < floorMajor || (major === floorMajor && minor < floorMinor)) {
  console.error(
    `\n  Node ${floorMajor}.${floorMinor}+ required, you have ${process.version}.\n` +
      `  This repo pins Node in .nvmrc — run \`nvm use\` (or upgrade your default Node), then retry.\n`,
  );
  process.exit(1);
}
