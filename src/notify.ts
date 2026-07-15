import type { Env } from "./env.d.ts";
import type { BocAudRate } from "./boc.ts";
import type { FxConfig } from "./store.ts";

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [300, 900];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface TelegramResponse {
  ok: boolean;
  description?: string;
  error_code?: number;
}

async function sendOnce(env: Env, text: string, attempt: number): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "fx-rate-bot/1.0 (+cloudflare-worker; telegram publisher)",
      },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text,
        disable_web_page_preview: true,
      }),
    });

    const payload = (await res.json().catch(() => null)) as TelegramResponse | null;

    if (!res.ok || !payload?.ok) {
      console.error("telegram sendMessage failed", {
        attempt,
        status: res.status,
        statusText: res.statusText,
        cfRay: res.headers.get("cf-ray"),
        server: res.headers.get("server"),
        date: res.headers.get("date"),
        errorCode: payload?.error_code,
        description: payload?.description,
      });
      return false;
    }
    return true;
  } catch (err) {
    console.error("telegram sendMessage threw", { attempt, err: err instanceof Error ? err.message : String(err) });
    return false;
  }
}

/**
 * Returns true if Telegram accepted the message. Caller must not advance backoff state on false.
 * Retries a few times with fresh connections to smooth over transient network blips.
 */
async function send(env: Env, text: string): Promise<boolean> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1] ?? 900);
    if (await sendOnce(env, text, attempt + 1)) return true;
  }
  return false;
}

export async function notify(env: Env, rate: BocAudRate, config: FxConfig): Promise<boolean> {
  const text =
    `🔔 AUD rate alert\n` +
    `现汇卖出价 ${rate.exchangeSell} (target ${config.operator} ${config.threshold})\n` +
    `发布时间: ${rate.publishDateTime}\n` +
    `https://www.boc.cn/sourcedb/whpj/`;

  return send(env, text);
}

export async function notifyError(env: Env, message: string): Promise<boolean> {
  const text =
    `⚠️ AUD rate monitor is broken\n` +
    `Rate checks are failing, so you won't get alerts until this is fixed.\n\n${message}`;

  return send(env, text);
}
