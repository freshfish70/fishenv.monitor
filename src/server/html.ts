import type {
  CheckResultRow,
  MonitorAggregate,
  MonitorRow,
} from "../db/monitor-repository.ts";

export function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const STYLES = `
  :root {
    color-scheme: light dark;
    --bg: #f6f7f9;
    --surface: #ffffff;
    --border: #e2e5ea;
    --text: #1a1d23;
    --muted: #666d78;
    --up: #1a9b5c;
    --up-bg: #e4f7ee;
    --down: #d13c3c;
    --down-bg: #fbe7e7;
    --unknown: #8a8f98;
    --unknown-bg: #eceef1;
    --link: #2563eb;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #14161a;
      --surface: #1c1f25;
      --border: #2b2f37;
      --text: #e7e9ec;
      --muted: #9aa0ab;
      --up-bg: #113322;
      --down-bg: #3a1717;
      --unknown-bg: #2a2d33;
      --link: #6d9bff;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
  }
  .wrap { max-width: 1000px; margin: 0 auto; padding: 32px 20px 64px; }
  .page-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 20px; }
  .page-header h1 { margin: 0; }
  h1 { font-size: 1.5rem; margin: 0 0 20px; }
  h2 { font-size: 1.1rem; margin: 32px 0 12px; }
  .autorefresh { display: flex; align-items: center; gap: 8px; font-size: 0.85rem; color: var(--muted); }
  .autorefresh select {
    font: inherit;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 5px 8px;
  }
  .muted { color: var(--muted); font-weight: 400; }
  a { color: var(--link); text-decoration: none; }
  a:hover { text-decoration: underline; }
  .back { display: inline-block; margin-bottom: 16px; font-size: 0.9rem; }
  table { width: 100%; border-collapse: collapse; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  th, td { text-align: left; padding: 10px 14px; border-bottom: 1px solid var(--border); font-size: 0.9rem; vertical-align: middle; }
  th { color: var(--muted); font-weight: 600; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.03em; }
  tbody tr:last-child td { border-bottom: none; }
  tr[data-href] { cursor: pointer; }
  tr[data-href]:hover { background: var(--bg); }
  .empty { color: var(--muted); text-align: center; padding: 24px; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 0.78rem; font-weight: 600; text-transform: capitalize; }
  .badge-up { color: var(--up); background: var(--up-bg); }
  .badge-down { color: var(--down); background: var(--down-bg); }
  .badge-unknown { color: var(--unknown); background: var(--unknown-bg); }
  .pulse { display: flex; gap: 3px; }
  .dot { width: 9px; height: 16px; border-radius: 2px; display: inline-block; }
  .dot-up { background: var(--up); }
  .dot-down { background: var(--down); }
  .dot-unknown { background: var(--unknown); }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; }
  .stat { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; }
  .stat-label { display: block; color: var(--muted); font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 6px; }
  .stat-value { font-size: 1.15rem; font-weight: 600; }
`;

function pageShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${STYLES}</style>
</head>
<body>
${body}
<script>
  document.querySelectorAll('[data-ts]').forEach((el) => {
    const raw = el.getAttribute('data-ts');
    if (!raw) return;
    const d = new Date(raw);
    if (!isNaN(d.getTime())) el.textContent = d.toLocaleString();
  });
  document.querySelectorAll('tr[data-href]').forEach((tr) => {
    tr.addEventListener('click', () => { location.href = tr.getAttribute('data-href'); });
  });
  (function () {
    const select = document.getElementById('autorefresh-select');
    if (!select) return;
    const STORAGE_KEY = 'fishenv-monitor-autorefresh';
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null && [...select.options].some((o) => o.value === saved)) {
      select.value = saved;
    }
    let timer = null;
    function schedule() {
      if (timer) clearInterval(timer);
      const seconds = Number(select.value);
      if (seconds > 0) timer = setInterval(() => location.reload(), seconds * 1000);
    }
    select.addEventListener('change', () => {
      localStorage.setItem(STORAGE_KEY, select.value);
      schedule();
    });
    schedule();
  })();
</script>
</body>
</html>`;
}

const AUTOREFRESH_OPTIONS: [seconds: string, label: string][] = [
  ["0", "Off"],
  ["10", "10s"],
  ["30", "30s"],
  ["60", "1m"],
  ["300", "5m"],
  ["900", "15m"],
];
const AUTOREFRESH_DEFAULT_SECONDS = "60";

function autoRefreshControl(): string {
  const options = AUTOREFRESH_OPTIONS
    .map(([seconds, label]) =>
      `<option value="${seconds}"${seconds === AUTOREFRESH_DEFAULT_SECONDS ? " selected" : ""}>${label}</option>`
    )
    .join("");
  return `
    <div class="autorefresh">
      <label for="autorefresh-select">Auto-refresh</label>
      <select id="autorefresh-select">${options}</select>
    </div>`;
}

function stateBadge(state: string): string {
  const cls = state === "up" ? "badge-up" : state === "down" ? "badge-down" : "badge-unknown";
  return `<span class="badge ${cls}">${escapeHtml(state)}</span>`;
}

function formatMs(ms: number | null): string {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return "—";
  return `${Math.round(ms)} ms`;
}

function resultTitle(result: CheckResultRow): string {
  const status = result.down === 1 ? "down" : "up";
  const suffix = result.message ? `: ${result.message}` : "";
  return `${result.checked_at} — ${status}${suffix} (${formatMs(result.duration_ms)})`;
}

/** Oldest-to-newest strip of dots, one per result, most recent on the right. */
function pulseDots(results: CheckResultRow[]): string {
  const ordered = [...results].reverse();
  const dots = ordered
    .map((result) => {
      const cls = result.down === 1 ? "dot-down" : "dot-up";
      return `<span class="dot ${cls}" title="${escapeHtml(resultTitle(result))}"></span>`;
    })
    .join("");
  return `<div class="pulse">${dots}</div>`;
}

export interface OverviewRow {
  monitor: MonitorRow;
  aggregate: MonitorAggregate;
  recent: CheckResultRow[];
}

export function renderOverviewPage(rows: OverviewRow[]): string {
  const body = rows
    .map(({ monitor, aggregate, recent }) => {
      const href = `/monitors/${encodeURIComponent(monitor.id)}`;
      return `
        <tr data-href="${href}">
          <td><a href="${href}">${escapeHtml(monitor.name)}</a></td>
          <td class="muted">${escapeHtml(monitor.type)}</td>
          <td>${stateBadge(monitor.last_state)}</td>
          <td>${formatMs(aggregate.avgDurationMs)}</td>
          <td>${recent.length ? pulseDots(recent) : '<span class="muted">—</span>'}</td>
          <td>${
        monitor.last_checked_at
          ? `<time data-ts="${monitor.last_checked_at}">${monitor.last_checked_at}</time>`
          : '<span class="muted">never</span>'
      }</td>
        </tr>`;
    })
    .join("");

  const table = `
    <table>
      <thead>
        <tr><th>Service</th><th>Type</th><th>Status</th><th>Avg response</th><th>Last 10</th><th>Last checked</th></tr>
      </thead>
      <tbody>${body || '<tr><td colspan="6" class="empty">No monitors configured.</td></tr>'}</tbody>
    </table>`;

  const header = `<div class="page-header"><h1>Monitors</h1>${autoRefreshControl()}</div>`;

  return pageShell("Monitors", `<main class="wrap">${header}${table}</main>`);
}

export function renderMonitorDetailPage(
  monitor: MonitorRow,
  aggregate: MonitorAggregate,
  results: CheckResultRow[],
): string {
  const uptime = aggregate.totalChecks > 0
    ? `${((aggregate.upChecks / aggregate.totalChecks) * 100).toFixed(2)}%`
    : "—";

  const stats = `
    <div class="stats">
      <div class="stat"><span class="stat-label">Status</span><span class="stat-value">${
    stateBadge(monitor.last_state)
  }</span></div>
      <div class="stat"><span class="stat-label">Uptime</span><span class="stat-value">${uptime}</span></div>
      <div class="stat"><span class="stat-label">Avg response</span><span class="stat-value">${
    formatMs(aggregate.avgDurationMs)
  }</span></div>
      <div class="stat"><span class="stat-label">Min response</span><span class="stat-value">${
    formatMs(aggregate.minDurationMs)
  }</span></div>
      <div class="stat"><span class="stat-label">Max response</span><span class="stat-value">${
    formatMs(aggregate.maxDurationMs)
  }</span></div>
      <div class="stat"><span class="stat-label">Total checks</span><span class="stat-value">${aggregate.totalChecks}</span></div>
    </div>`;

  const rows = results
    .map((result) => `
      <tr>
        <td><time data-ts="${result.checked_at}">${result.checked_at}</time></td>
        <td>${result.down === 1 ? '<span class="badge badge-down">down</span>' : '<span class="badge badge-up">up</span>'}</td>
        <td>${formatMs(result.duration_ms)}</td>
        <td class="muted">${result.message ? escapeHtml(result.message) : "—"}</td>
      </tr>`)
    .join("");

  const table = `
    <table>
      <thead><tr><th>Checked at</th><th>Status</th><th>Duration</th><th>Message</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4" class="empty">No results recorded yet.</td></tr>'}</tbody>
    </table>`;

  const header = `
    <div class="page-header">
      <h1>${escapeHtml(monitor.name)} <span class="muted">(${escapeHtml(monitor.type)})</span></h1>
      ${autoRefreshControl()}
    </div>`;

  const body = `
    <main class="wrap">
      <a class="back" href="/">&larr; All monitors</a>
      ${header}
      ${stats}
      <h2>Last ${results.length} result${results.length === 1 ? "" : "s"}</h2>
      ${table}
    </main>`;

  return pageShell(`${monitor.name} — Monitor`, body);
}
