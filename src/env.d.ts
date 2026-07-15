export interface Env {
  FX_KV: KVNamespace;
  /** ntfy.sh topic name, set via `wrangler secret put NTFY_TOPIC` */
  NTFY_TOPIC: string;
}
