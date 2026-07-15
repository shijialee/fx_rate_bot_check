import type { Env } from "./env.d.ts";
import type { BocAudRate } from "./boc.ts";
import type { FxConfig } from "./store.ts";

async function publish(env: Env, headers: Record<string, string>, body: string): Promise<void> {
  const res = await fetch(`https://ntfy.sh/${env.NTFY_TOPIC}`, {
    method: "POST",
    headers,
    body,
  });

  if (!res.ok) {
    console.error("ntfy publish failed", res.status, await res.text());
  }
}

export async function notify(env: Env, rate: BocAudRate, config: FxConfig): Promise<void> {
  const message =
    `AUD 现汇卖出价 ${rate.exchangeSell} (target ${config.operator} ${config.threshold})\n` +
    `发布时间: ${rate.publishDateTime}`;

  await publish(
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

export async function notifyError(env: Env, message: string): Promise<void> {
  await publish(
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
