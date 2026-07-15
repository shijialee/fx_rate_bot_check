import type { Env } from "./env.d.ts";
import type { LogLevel } from "./logger.ts";

export type Operator = "<=" | ">=";

export interface FxConfig {
  operator: Operator;
  threshold: number;
  paused: boolean;
  /** editable from /admin, takes effect on the next check — no redeploy needed */
  logLevel: LogLevel;
}

export interface FxState {
  conditionMet: boolean;
  /** notifications sent since the condition last became true */
  notifyCount: number;
  lastNotifiedAt: number | null;
  lastRate: number | null;
  lastPublishDateTime: string | null;
  lastCheckedAt: number | null;
  lastSkippedReason: "paused" | "stale" | null;
  /** true while fetch/parse of the BOC page is currently failing */
  errorActive: boolean;
  /** error notifications sent since the failure streak started */
  errorNotifyCount: number;
  lastErrorNotifiedAt: number | null;
  lastError: string | null;
}

export interface FxData {
  config: FxConfig;
  state: FxState;
}

const KEY = "fx:aud";

// Starts paused with a placeholder threshold so nothing fires until
// you've set a real value from /admin.
function defaultData(): FxData {
  return {
    config: { operator: "<=", threshold: 0, paused: true, logLevel: "debug" },
    state: {
      conditionMet: false,
      notifyCount: 0,
      lastNotifiedAt: null,
      lastRate: null,
      lastPublishDateTime: null,
      lastCheckedAt: null,
      lastSkippedReason: null,
      errorActive: false,
      errorNotifyCount: 0,
      lastErrorNotifiedAt: null,
      lastError: null,
    },
  };
}

export async function loadData(kv: Env["FX_KV"]): Promise<FxData> {
  const raw = await kv.get<Partial<FxData>>(KEY, "json");
  const fallback = defaultData();
  if (!raw) return fallback;
  return {
    config: { ...fallback.config, ...raw.config },
    state: { ...fallback.state, ...raw.state },
  };
}

export async function saveData(kv: Env["FX_KV"], data: FxData): Promise<void> {
  await kv.put(KEY, JSON.stringify(data));
}
