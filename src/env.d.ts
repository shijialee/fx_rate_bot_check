export interface Env {
  FX_KV: KVNamespace;
  /** Bot token from @BotFather, set via `wrangler secret put TELEGRAM_BOT_TOKEN` */
  TELEGRAM_BOT_TOKEN: string;
  /** Your chat id with the bot, set via `wrangler secret put TELEGRAM_CHAT_ID` */
  TELEGRAM_CHAT_ID: string;
}
