const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
export type LogLevel = keyof typeof LEVELS;

export interface Logger {
  debug: (msg: string, data?: Record<string, unknown>) => void;
  info: (msg: string, data?: Record<string, unknown>) => void;
  warn: (msg: string, data?: Record<string, unknown>) => void;
  error: (msg: string, data?: Record<string, unknown>) => void;
}

export function isLogLevel(v: unknown): v is LogLevel {
  return typeof v === "string" && v in LEVELS;
}

/** `level` is the KV-configured floor (edit via /admin, takes effect on the next check — no redeploy). */
export function makeLogger(level: LogLevel): Logger {
  const threshold = LEVELS[level];

  const log = (msgLevel: LogLevel, msg: string, data?: Record<string, unknown>) => {
    if (LEVELS[msgLevel] < threshold) return;
    const line = `[${msgLevel}] ${msg}`;
    const fn = msgLevel === "error" ? console.error : msgLevel === "warn" ? console.warn : console.log;
    if (data) fn(line, data);
    else fn(line);
  };

  return {
    debug: (msg, data) => log("debug", msg, data),
    info: (msg, data) => log("info", msg, data),
    warn: (msg, data) => log("warn", msg, data),
    error: (msg, data) => log("error", msg, data),
  };
}
