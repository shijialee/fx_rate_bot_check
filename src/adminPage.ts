export const ADMIN_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>AUD Rate Alert — Admin</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 480px; margin: 2rem auto; padding: 0 1rem; }
  h1 { font-size: 1.25rem; }
  fieldset { border: 1px solid color-mix(in srgb, currentColor 20%, transparent); border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem; }
  label { display: block; margin: 0.75rem 0 0.25rem; font-weight: 600; }
  select, input[type=number] { font-size: 1rem; padding: 0.4rem; width: 100%; box-sizing: border-box; }
  .row { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.75rem; }
  .row label { margin: 0; }
  button { margin-top: 1rem; font-size: 1rem; padding: 0.5rem 1rem; cursor: pointer; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 0.25rem 1rem; font-size: 0.9rem; }
  dt { opacity: 0.7; }
  dd { margin: 0; }
  #msg { font-size: 0.9rem; margin-top: 0.5rem; }
  #error-banner { display: none; background: #fee; color: #900; border: 1px solid #c00; border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1rem; font-size: 0.9rem; white-space: pre-wrap; }
  @media (prefers-color-scheme: dark) { #error-banner { background: #3a1414; color: #f88; border-color: #a33; } }
</style>
</head>
<body>
<h1>AUD Rate Alert</h1>

<div id="error-banner"></div>

<fieldset>
  <legend>Condition</legend>
  <label for="operator">Alert when 现汇卖出价 is</label>
  <select id="operator">
    <option value="&lt;=">&lt;= (rate dropped to or below)</option>
    <option value="&gt;=">&gt;= (rate rose to or above)</option>
  </select>

  <label for="threshold">Threshold (RMB per 100 AUD)</label>
  <input id="threshold" type="number" step="0.01" />

  <div class="row">
    <input id="paused" type="checkbox" />
    <label for="paused">Paused (no checks/notifications)</label>
  </div>

  <label for="logLevel">Log level (for wrangler tail / Workers Logs)</label>
  <select id="logLevel">
    <option value="debug">debug — full step-by-step trace</option>
    <option value="info">info — outcomes only</option>
    <option value="warn">warn — only warnings/errors</option>
    <option value="error">error — only errors</option>
  </select>

  <button id="save">Save</button>
  <div id="msg"></div>
</fieldset>

<fieldset>
  <legend>Current status</legend>
  <dl id="status"></dl>
  <button id="refresh">Refresh</button>
</fieldset>

<script>
async function loadConfig() {
  const res = await fetch('/admin/api/config');
  const data = await res.json();
  document.getElementById('operator').value = data.config.operator;
  document.getElementById('threshold').value = data.config.threshold;
  document.getElementById('paused').checked = data.config.paused;
  document.getElementById('logLevel').value = data.config.logLevel;
  renderStatus(data.state);
}

function fmt(ts) {
  return ts ? new Date(ts).toLocaleString() : '—';
}

function renderStatus(state) {
  const banner = document.getElementById('error-banner');
  if (state.errorActive) {
    banner.style.display = 'block';
    banner.textContent = 'Monitor is failing (' + state.errorNotifyCount + ' alert(s) sent): ' + state.lastError;
  } else {
    banner.style.display = 'none';
  }

  const dl = document.getElementById('status');
  const rows = [
    ['Condition met', state.conditionMet ? 'yes' : 'no'],
    ['Notifications sent (this streak)', state.notifyCount],
    ['Last notified', fmt(state.lastNotifiedAt)],
    ['Last rate seen', state.lastRate ?? '—'],
    ['Last publish time (BOC)', state.lastPublishDateTime ?? '—'],
    ['Last checked', fmt(state.lastCheckedAt)],
    ['Last skip reason', state.lastSkippedReason ?? '—'],
    ['Monitor failing', state.errorActive ? 'yes' : 'no'],
    ['Error alerts sent (this streak)', state.errorNotifyCount],
    ['Last error notified', fmt(state.lastErrorNotifiedAt)],
  ];
  dl.innerHTML = rows.map(([k, v]) => \`<dt>\${k}</dt><dd>\${v}</dd>\`).join('');
}

document.getElementById('save').addEventListener('click', async () => {
  const body = {
    operator: document.getElementById('operator').value,
    threshold: parseFloat(document.getElementById('threshold').value),
    paused: document.getElementById('paused').checked,
    logLevel: document.getElementById('logLevel').value,
  };
  const res = await fetch('/admin/api/config', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  document.getElementById('msg').textContent = res.ok ? 'Saved.' : 'Error saving config.';
  renderStatus(data.state);
});

document.getElementById('refresh').addEventListener('click', loadConfig);

loadConfig();
</script>
</body>
</html>
`;
