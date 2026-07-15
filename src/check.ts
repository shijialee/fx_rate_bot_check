import type { Env } from "./env.d.ts";
import { fetchBocHtml, parseAudRate, todayInShanghai } from "./boc.ts";
import { loadData, saveData, type FxData } from "./store.ts";
import { notify, notifyError } from "./notify.ts";

const BACKOFF_BASE_MIN = 20;
const BACKOFF_CAP_MIN = 24 * 60;

/** Minutes to wait after the Nth notification before the (N+1)th is allowed. */
function requiredWaitMinutes(notifyCount: number): number {
  if (notifyCount <= 0) return 0;
  return Math.min(BACKOFF_BASE_MIN * 2 ** (notifyCount - 1), BACKOFF_CAP_MIN);
}

function dueToNotify(notifyCount: number, lastNotifiedAt: number | null): boolean {
  const waitMin = requiredWaitMinutes(notifyCount);
  const elapsedMin = lastNotifiedAt ? (Date.now() - lastNotifiedAt) / 60_000 : Infinity;
  return elapsedMin >= waitMin;
}

async function reportError(env: Env, data: FxData, message: string): Promise<void> {
  console.error(message);
  data.state.lastCheckedAt = Date.now();
  data.state.lastError = message;

  if (dueToNotify(data.state.errorNotifyCount, data.state.lastErrorNotifiedAt)) {
    await notifyError(env, message);
    data.state.errorNotifyCount += 1;
    data.state.lastErrorNotifiedAt = Date.now();
  }
  data.state.errorActive = true;

  await saveData(env.FX_KV, data);
}

export async function runCheck(env: Env): Promise<void> {
  const data = await loadData(env.FX_KV);

  if (data.config.paused) {
    data.state.lastCheckedAt = Date.now();
    data.state.lastSkippedReason = "paused";
    await saveData(env.FX_KV, data);
    return;
  }

  let html: string;
  try {
    html = await fetchBocHtml();
  } catch (err) {
    await reportError(env, data, `BOC fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  let rate;
  try {
    rate = parseAudRate(html);
  } catch (err) {
    await reportError(env, data, `BOC parse failed: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  // Fetch + parse succeeded: clear any prior failure streak silently.
  if (data.state.errorActive) {
    data.state.errorActive = false;
    data.state.errorNotifyCount = 0;
    data.state.lastErrorNotifiedAt = null;
    data.state.lastError = null;
  }

  data.state.lastCheckedAt = Date.now();

  if (rate.publishDate !== todayInShanghai()) {
    data.state.lastSkippedReason = "stale";
    await saveData(env.FX_KV, data);
    return;
  }

  data.state.lastSkippedReason = null;
  data.state.lastRate = rate.exchangeSell;
  data.state.lastPublishDateTime = rate.publishDateTime;

  const conditionNowTrue =
    data.config.operator === "<="
      ? rate.exchangeSell <= data.config.threshold
      : rate.exchangeSell >= data.config.threshold;

  if (!conditionNowTrue) {
    if (data.state.conditionMet) {
      data.state.conditionMet = false;
      data.state.notifyCount = 0;
      data.state.lastNotifiedAt = null;
    }
    await saveData(env.FX_KV, data);
    return;
  }

  data.state.conditionMet = true;

  if (dueToNotify(data.state.notifyCount, data.state.lastNotifiedAt)) {
    await notify(env, rate, data.config);
    data.state.notifyCount += 1;
    data.state.lastNotifiedAt = Date.now();
  }

  await saveData(env.FX_KV, data);
}
