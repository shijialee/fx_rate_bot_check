import type { Env } from "./env.d.ts";
import { runCheck } from "./check.ts";
import { loadData, saveData, type FxConfig } from "./store.ts";
import { ADMIN_HTML } from "./adminPage.ts";
import { isLogLevel } from "./logger.ts";

function isOperator(v: unknown): v is FxConfig["operator"] {
  return v === "<=" || v === ">=";
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Everything under /admin is expected to sit behind a Cloudflare Access
    // policy applied at the edge — see README for setup. The worker itself
    // does not re-check auth.

    if (url.pathname === "/admin" && request.method === "GET") {
      return new Response(ADMIN_HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    if (url.pathname === "/admin/api/config" && request.method === "GET") {
      const data = await loadData(env.FX_KV);
      return Response.json(data);
    }

    if (url.pathname === "/admin/api/config" && request.method === "POST") {
      const body = await request.json<Partial<FxConfig>>();
      const data = await loadData(env.FX_KV);

      if (isOperator(body.operator)) data.config.operator = body.operator;
      if (typeof body.threshold === "number" && Number.isFinite(body.threshold)) {
        data.config.threshold = body.threshold;
      }
      if (typeof body.paused === "boolean") data.config.paused = body.paused;
      if (isLogLevel(body.logLevel)) data.config.logLevel = body.logLevel;

      await saveData(env.FX_KV, data);
      return Response.json(data);
    }

    // Manual trigger for testing, without waiting for the next cron tick.
    if (url.pathname === "/admin/api/run-now" && request.method === "POST") {
      await runCheck(env);
      const data = await loadData(env.FX_KV);
      return Response.json(data);
    }

    return new Response("Not found", { status: 404 });
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runCheck(env));
  },
} satisfies ExportedHandler<Env>;
