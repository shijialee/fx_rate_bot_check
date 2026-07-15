import type { Env } from "./env.d.ts";
import type { BocAudRate } from "./boc.ts";
import type { FxConfig } from "./store.ts";

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [300, 900];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function publishOnce(
  env: Env,
  headers: Record<string, string>,
  body: string,
  attempt: number,
): Promise<boolean> {
  try {
    const res = await fetch(`https://ntfy.sh/${env.NTFY_TOPIC}`, {
      method: "POST",
      headers: {
        "User-Agent": "fx-rate-bot/1.0 (+cloudflare-worker; ntfy publisher)",
        Accept: "*/*",
        ...headers,
      },
      body,
    });
    if (!res.ok) {
      console.error("ntfy publish failed", {
        attempt,
        status: res.status,
        statusText: res.statusText,
        cfRay: res.headers.get("cf-ray"),
        server: res.headers.get("server"),
        date: res.headers.get("date"),
        body: await res.text(),
      });
      return false;
    }
    return true;
  } catch (err) {
    console.error("ntfy publish threw", { attempt, err: err instanceof Error ? err.message : String(err) });
    return false;
  }
}

/**
 * Returns true if ntfy accepted the message. Caller must not advance backoff state on false.
 * Retries a few times with fresh connections — the ntfy.sh origin occasionally returns
 * transient 5xx (522/502) to specific Cloudflare colos, and a new attempt often succeeds.
 * On every failure we log status + cf-ray so a persistent problem can be reported to
 * ntfy.sh/Cloudflare with a concrete ray ID to look up.
 */
async function publish(env: Env, headers: Record<string, string>, body: string): Promise<boolean> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1] ?? 900);
    if (await publishOnce(env, headers, body, attempt + 1)) return true;
  }
  return false;
}

export async function notify(env: Env, rate: BocAudRate, config: FxConfig): Promise<boolean> {
  const message =
    `AUD 现汇卖出价 ${rate.exchangeSell} (target ${config.operator} ${config.threshold})\n` +
    `发布时间: ${rate.publishDateTime}`;

  return publish(
    env,
    {
      Title: "AUD rate alert",
      Priority: "high",
      Tags: "money_with_wings",
      Click: "https://www.boc.cn/sourcedb/whpj/",
    },
    message,
  );
}

export async function notifyError(env: Env, message: string): Promise<boolean> {
  return publish(
    env,
    {
      Title: "AUD rate monitor is broken",
      Priority: "high",
      Tags: "warning",
      Click: "https://www.boc.cn/sourcedb/whpj/",
    },
    `Rate checks are failing, so you won't get alerts until this is fixed.\n\n${message}`,
  );
}
