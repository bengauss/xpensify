import { Hono } from "hono";
import type { Hono as HonoType } from "hono";

/**
 * Wrap a sub-router under /api/<prefix>/ so request paths read naturally.
 * Returns a function that sends a Request through and returns the Response.
 */
export function mountRouter(prefix: string, router: HonoType<any, any, any>) {
  const app = new Hono().route(`/api/${prefix}`, router);
  return {
    request: (path: string, init?: RequestInit) => {
      const url = path.startsWith("http") ? path : `http://test${path}`;
      return app.request(url, init);
    },
  };
}

export interface JsonRequestOptions {
  cookie?: string;
  authorization?: string;
  origin?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export function jsonInit(method: string, opts: JsonRequestOptions = {}): RequestInit {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(opts.headers ?? {}),
  };
  if (opts.cookie) headers["cookie"] = opts.cookie;
  if (opts.authorization) headers["authorization"] = opts.authorization;
  if (opts.origin) headers["origin"] = opts.origin;
  const init: RequestInit = { method, headers };
  if (opts.body !== undefined) {
    init.body = typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
  }
  return init;
}
