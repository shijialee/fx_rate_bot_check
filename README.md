# fx-rate-bot

Watches BOC's published AUD→RMB rate (现汇卖出价) and pushes a notification via
[ntfy.sh](https://ntfy.sh) when it crosses your threshold. Runs entirely on a
Cloudflare Worker: a Cron Trigger checks every 10 minutes; an `/admin` page
(protected by Cloudflare Access) lets you edit the condition, pause, and see
current status.

## How it works

- **Check** (`src/check.ts`, run by the cron trigger every 10 min):
  1. Skip entirely if paused.
  2. Fetch https://www.boc.cn/sourcedb/whpj/ and parse the 澳大利亚元 row
     (`src/boc.ts`).
  3. **Freshness gate**: if the row's 发布日期 isn't today (Asia/Shanghai),
     skip evaluation — BOC hasn't published a new rate yet (weekends,
     holidays, off-hours).
  4. Evaluate `现汇卖出价 <op> threshold`.
     - Condition **false → true**: notify immediately, backoff resets to 0.
     - Condition stays **true**: notify again only once the backoff wait has
       elapsed (20 → 40 → 80 → 160 → 320 min, capped at 24h).
     - Condition **true → false**: silent reset, no notification.
  5. State + config persist in a single KV key so they survive across
     invocations.

- **Failures fail loudly**: if the fetch or the parse throws (BOC redesigns
  the page, geo-blocks the request, network error, etc.), that's reported
  too — same ntfy topic, "AUD rate monitor is broken" title, with the error
  message. It uses the same backoff schedule as rate alerts, so a
  persistently broken page notifies you once immediately and then backs off
  (20 → 40 → ... → 24h) instead of paging you every 10 minutes. Once a check
  succeeds again, the failure streak resets silently (no "recovered"
  message) and normal rate-condition evaluation resumes.

- **Admin** (`src/index.ts` + `src/adminPage.ts`): `GET/POST /admin` and
  `/admin/api/config`. Cloudflare Access sits in front of `/admin*` — the
  Worker itself does not re-check auth, so the Access policy is the only
  thing standing between the internet and your config. Don't skip that step.

## One-time setup

### 1. Install deps and log in

```sh
npm install
npx wrangler login
```

### 2. Create the KV namespace

```sh
npx wrangler kv namespace create FX_KV
```

Copy the returned `id` into `wrangler.jsonc` → `kv_namespaces[0].id`
(currently `REPLACE_WITH_KV_NAMESPACE_ID`).

### 3. Pick an ntfy topic and set it as a secret

Topic name is your shared secret for the public ntfy.sh broker — anyone who
knows it can read your alerts, so make it unguessable:

```sh
openssl rand -hex 8   # e.g. 3f9a1c2e7b4d6081 -> topic "fx-aud-3f9a1c2e7b4d6081"
npx wrangler secret put NTFY_TOPIC
# paste: fx-aud-3f9a1c2e7b4d6081
```

Install the [ntfy app](https://ntfy.sh/#subscribe) on your phone and
subscribe to that exact topic name.

### 4. Deploy

```sh
npx wrangler deploy
```

Note the URL it prints, `https://fx-rate-bot.<your-subdomain>.workers.dev`.

### 5. Protect `/admin` with Cloudflare Access

In the Cloudflare dashboard:

1. **Zero Trust → Settings → Authentication → Login methods**: confirm
   **One-time PIN** is enabled (it is by default — no IdP setup needed).
2. **Zero Trust → Access → Applications → Add an application → Self-hosted**.
3. **Application domain**: `fx-rate-bot.<your-subdomain>.workers.dev`,
   path `/admin*`.
4. **Policy**: Action `Allow`, Include → Emails → your email address.
5. Save.

Now `https://fx-rate-bot.<your-subdomain>.workers.dev/admin` prompts for an
email OTP before it ever reaches the Worker.

### 6. Configure and unpause

Open `/admin`, set your operator/threshold, uncheck "Paused", Save. The
Worker ships **paused with threshold 0** by default so nothing fires before
you've configured it.

## Operating it

- **Edit condition / pause / check status**: `/admin` page.
- **Force a check without waiting for cron**: `POST /admin/api/run-now`
  (also behind Access) — returns the resulting config+state JSON.
- **Logs**: `npx wrangler tail` while a cron tick or manual check runs. Verbosity
  is the "Log level" field on `/admin` (stored in KV alongside the rest of the
  config — takes effect on the very next check, no redeploy): `"debug"` traces
  every step (fetch, parse, freshness, condition, backoff decision, notify
  result); `"info"` only logs outcomes — freshness, condition result, and any
  notify attempt/result — skipping the fine-grained trace; `"warn"`/`"error"`
  are quieter still.
- **Cron schedule**: fixed at `*/10 * * * *` in `wrangler.jsonc`; change and
  redeploy if you want a different interval — backoff timing is independent
  of this.

## Local development

```sh
cp .dev.vars.example .dev.vars   # set a throwaway NTFY_TOPIC for testing
npx wrangler dev
# in another shell:
curl -X POST localhost:8787/admin/api/config -H 'content-type: application/json' \
  -d '{"operator":"<=","threshold":480,"paused":false}'
curl -X POST localhost:8787/admin/api/run-now
# simulate the actual cron trigger:
curl "http://localhost:8787/cdn-cgi/handler/scheduled"
```

`/admin` is **not** Access-protected in local dev (Access only applies to
the deployed hostname) — fine for testing, just don't expose `wrangler dev`
publicly.
