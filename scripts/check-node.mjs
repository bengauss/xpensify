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
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

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

// Native-addon ABI guard. better-sqlite3 is compiled against one Node ABI
// (process.versions.modules); a binary left over from a different Node — a
// stale checkout, a Docker-copied node_modules, or a shell that switched Node
// majors between install and test — makes vitest die with a cryptic
// NODE_MODULE_VERSION mismatch. Detect that here and rebuild in place so the
// test run that follows just works. Only the server package depends on
// better-sqlite3; in the client it won't resolve and we skip silently.
//
// We probe with process.dlopen on the exact compiled binary rather than
// require("better-sqlite3"): the `bindings` loader searches several candidate
// paths relative to its caller and will happily load a stray good copy,
// masking the broken primary that vitest (loading via a different base) then
// trips over. dlopen of the canonical path reproduces the real failure with no
// fallback and no module-loader interference.
const require = createRequire(join(process.cwd(), "package.json"));
let pkgDir;
try {
  pkgDir = dirname(require.resolve("better-sqlite3/package.json"));
} catch {
  process.exit(0); // not a dependency here (client) — nothing to check
}
const binary = join(pkgDir, "build", "Release", "better_sqlite3.node");
if (existsSync(binary)) {
  try {
    process.dlopen({ exports: {} }, binary); // throws on ABI mismatch / bad load
  } catch (err) {
    const signal = `${err?.code ?? ""} ${err?.message ?? err}`;
    if (!/NODE_MODULE_VERSION|ERR_DLOPEN_FAILED|was compiled against/.test(signal)) {
      throw err; // a real failure, not the ABI/load mismatch we heal
    }
    console.error(
      `\n  better-sqlite3 was built for a different Node ABI than ${process.version}.\n` +
        `  Rebuilding it for the active Node…\n`,
    );
    try {
      execSync("npm rebuild better-sqlite3", { stdio: "inherit", cwd: process.cwd() });
    } catch {
      console.error(
        `\n  Automatic rebuild failed. Run \`npm rebuild better-sqlite3\` manually under your active Node.\n`,
      );
      process.exit(1);
    }
  }
}
