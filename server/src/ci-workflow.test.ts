import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import yaml from "js-yaml";

// F5 (#43): there is no CI, so the local suite is the only merge gate. This
// test pins the CI workflow's shape so a future edit can't silently drop a job,
// a build/test step, or the client-job-installs-server-deps caveat (client tsc
// resolves @server/* type imports — mirrors the Dockerfile).

const WORKFLOW_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../.github/workflows/ci.yml",
);

type Step = {
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
  "working-directory"?: string;
};
type Job = { steps?: Step[] };
type Workflow = { on?: Record<string, unknown>; jobs?: Record<string, Job> };

function loadWorkflow(): Workflow {
  return yaml.load(readFileSync(WORKFLOW_PATH, "utf8")) as Workflow;
}

// `npm ...` commands a job runs in a given working directory.
function runsIn(job: Job, dir: string): string[] {
  return (job.steps ?? [])
    .filter((s) => s.run && (s["working-directory"] ?? ".") === dir)
    .map((s) => s.run as string);
}

function usesNvmrc(job: Job): boolean {
  return (job.steps ?? []).some(
    (s) =>
      typeof s.uses === "string" &&
      s.uses.startsWith("actions/setup-node") &&
      s.with?.["node-version-file"] === ".nvmrc",
  );
}

describe("CI workflow (F5 / #43)", () => {
  it("exists and parses as a YAML object", () => {
    expect(() => loadWorkflow()).not.toThrow();
    expect(loadWorkflow()).toBeTypeOf("object");
  });

  it("triggers on push and pull_request", () => {
    const wf = loadWorkflow();
    expect(wf.on).toBeDefined();
    expect(Object.keys(wf.on!)).toEqual(
      expect.arrayContaining(["push", "pull_request"]),
    );
  });

  it("has both a server and a client job", () => {
    const wf = loadWorkflow();
    expect(wf.jobs?.server).toBeDefined();
    expect(wf.jobs?.client).toBeDefined();
  });

  it("server job installs, builds, and tests under .nvmrc Node", () => {
    const job = loadWorkflow().jobs!.server;
    expect(usesNvmrc(job)).toBe(true);
    const runs = runsIn(job, "server");
    expect(runs).toContain("npm ci");
    expect(runs).toContain("npm run build");
    expect(runs).toContain("npm test");
  });

  it("client job installs server deps first, then builds and tests the client", () => {
    const job = loadWorkflow().jobs!.client;
    expect(usesNvmrc(job)).toBe(true);
    // The caveat: client tsc resolves @server/* type imports, so server deps
    // must be installed in the client job too (mirrors the Dockerfile).
    expect(runsIn(job, "server")).toContain("npm ci");
    const clientRuns = runsIn(job, "client");
    expect(clientRuns).toContain("npm ci");
    expect(clientRuns).toContain("npm run build");
    expect(clientRuns).toContain("npm test");
  });
});
