import type { Env } from "./env.d.ts";
import { fetchBocHtml, parseAudRate, todayInShanghai } from "./boc.ts";
import { loadData, saveData, type FxData } from "./store.ts";
import { notify, notifyError } from "./notify.ts";
import { makeLogger, type Logger } from "./logger.ts";

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

async function reportError(env: Env, log: Logger, data: FxData, message: string): Promise<void> {
  log.error("check: fetch/parse failed", { message });
  data.state.lastCheckedAt = Date.now();
  data.state.lastError = message;

  if (dueToNotify(data.state.errorNotifyCount, data.state.lastErrorNotifiedAt)) {
    log.info("check: error backoff elapsed, sending error notification", {
      errorNotifyCount: data.state.errorNotifyCount,
    });
    const delivered = await notifyError(env, message);
    log.info("check: error notification result", { delivered });
    if (delivered) {
      data.state.errorNotifyCount += 1;
      data.state.lastErrorNotifiedAt = Date.now();
    }
  } else {
    log.debug("check: error backoff still active, not re-notifying", {
      errorNotifyCount: data.state.errorNotifyCount,
      lastErrorNotifiedAt: data.state.lastErrorNotifiedAt,
    });
  }
  data.state.errorActive = true;

  await saveData(env.FX_KV, data);
}

export async function runCheck(env: Env): Promise<void> {
  const data = await loadData(env.FX_KV);
  const log = makeLogger(data.config.logLevel);
  log.debug("check: start", { config: data.config });

  if (data.config.paused) {
    log.info("check: paused, skipping");
    data.state.lastCheckedAt = Date.now();
    data.state.lastSkippedReason = "paused";
    await saveData(env.FX_KV, data);
    return;
  }

  let html: string;
  try {
    html = await fetchBocHtml();
    log.debug("check: fetch ok", { bytes: html.length });
  } catch (err) {
    await reportError(env, log, data, `BOC fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  let rate;
  try {
    rate = parseAudRate(html);
    log.debug("check: parsed rate", { rate });
  } catch (err) {
    await reportError(env, log, data, `BOC parse failed: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  // Fetch + parse succeeded: clear any prior failure streak silently.
  if (data.state.errorActive) {
    log.info("check: recovered from prior fetch/parse failure");
    data.state.errorActive = false;
    data.state.errorNotifyCount = 0;
    data.state.lastErrorNotifiedAt = null;
    data.state.lastError = null;
  }

  data.state.lastCheckedAt = Date.now();

  const today = todayInShanghai();
  const isFresh = rate.publishDate === today;
  log.info("check: freshness", { publishDate: rate.publishDate, today, isFresh });

  if (!isFresh) {
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

  log.info("check: condition evaluated", {
    rate: rate.exchangeSell,
    operator: data.config.operator,
    threshold: data.config.threshold,
    conditionNowTrue,
  });

  if (!conditionNowTrue) {
    if (data.state.conditionMet) {
      log.info("check: condition cleared, resetting backoff");
      data.state.conditionMet = false;
      data.state.notifyCount = 0;
      data.state.lastNotifiedAt = null;
    }
    await saveData(env.FX_KV, data);
    return;
  }

  data.state.conditionMet = true;

  if (dueToNotify(data.state.notifyCount, data.state.lastNotifiedAt)) {
    log.info("check: backoff elapsed, sending notification", { notifyCount: data.state.notifyCount });
    const delivered = await notify(env, rate, data.config);
    log.info("check: notification result", { delivered });
    if (delivered) {
      data.state.notifyCount += 1;
      data.state.lastNotifiedAt = Date.now();
    }
  } else {
    log.debug("check: condition true but backoff still active", {
      notifyCount: data.state.notifyCount,
      lastNotifiedAt: data.state.lastNotifiedAt,
    });
  }

  await saveData(env.FX_KV, data);
}
