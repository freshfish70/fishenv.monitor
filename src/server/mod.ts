import { NotFoundError, r } from "@fishenv/http";
import * as v from "valibot";
import type {
  CheckResultRow,
  MonitorAggregate,
  MonitorRepository,
  MonitorRow,
  NotificationRow,
} from "../db/monitor-repository.ts";
import { renderMonitorDetailPage, renderOverviewPage } from "./html.ts";

const LatestResultsQuerySchema = v.object({
  limit: v.optional(
    v.pipe(
      v.string(),
      v.transform(Number),
      v.integer(),
      v.minValue(1),
      v.maxValue(100),
    ),
    "20",
  ),
});

function toMonitorJson(monitor: MonitorRow) {
  return {
    id: monitor.id,
    name: monitor.name,
    type: monitor.type,
    state: monitor.last_state,
    lastCheckedAt: monitor.last_checked_at,
    lastTransitionAt: monitor.last_transition_at,
    updatedAt: monitor.updated_at,
  };
}

function toResultJson(result: CheckResultRow) {
  return {
    monitorId: result.monitor_id,
    checkedAt: result.checked_at,
    down: result.down === 1,
    message: result.message,
    durationMs: result.duration_ms,
    result: result.raw_result ? JSON.parse(result.raw_result) : null,
  };
}

function toNotificationJson(notification: NotificationRow) {
  return {
    monitorId: notification.monitor_id,
    endpoint: notification.endpoint,
    channel: notification.channel,
    kind: notification.kind,
    ok: notification.ok === 1,
    error: notification.error,
    sentAt: notification.sent_at,
  };
}

const OVERVIEW_PULSE_SIZE = 10;
const DETAIL_RESULT_LIMIT = 100;
const DETAIL_NOTIFICATION_LIMIT = 50;

function html(body: string): Response {
  return new Response(body, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function emptyAggregate(monitorId: string): MonitorAggregate {
  return {
    monitorId,
    avgDurationMs: null,
    minDurationMs: null,
    maxDurationMs: null,
    totalChecks: 0,
    upChecks: 0,
  };
}

function groupByMonitor(
  results: CheckResultRow[],
): Map<string, CheckResultRow[]> {
  const grouped = new Map<string, CheckResultRow[]>();
  for (const result of results) {
    const list = grouped.get(result.monitor_id);
    if (list) list.push(result);
    else grouped.set(result.monitor_id, [result]);
  }
  return grouped;
}

/** Builds the monitor app's HTTP surface: a JSON API under `/api` plus a browsable HTML dashboard. */
export function createServer(repo: MonitorRepository) {
  const app = r();
  const api = app.extend({ prefix: "/api" });

  api.get("/health").handle(() =>
    Response.json({ status: "ok", uptime: performance.now() })
  );

  api.get("/monitors").handle(async () => {
    const monitors = await repo.listMonitors();
    return Response.json({ monitors: monitors.map(toMonitorJson) });
  });

  api.get("/monitors/:id").handle(async ({ path }) => {
    const monitor = await repo.getMonitor(path.id);
    if (!monitor) throw new NotFoundError(`Monitor "${path.id}" not found`);
    return Response.json({ monitor: toMonitorJson(monitor) });
  });

  // Flat, monitor-agnostic feed of recent results, meant for other services to poll.
  api
    .get("/results")
    .input("none", { query: LatestResultsQuerySchema })
    .handle(async ({ query }) => {
      const results = await repo.getLatestResults(query.limit);
      return Response.json({ results: results.map(toResultJson) });
    });

  // Delivery log, so a silent alert can be told apart from one that was
  // never attempted.
  api
    .get("/notifications")
    .input("none", { query: LatestResultsQuerySchema })
    .handle(async ({ query }) => {
      const notifications = await repo.getLatestNotifications(query.limit);
      return Response.json({
        notifications: notifications.map(toNotificationJson),
      });
    });

  app.get("/").handle(async () => {
    const [monitors, recentResults, aggregates] = await Promise.all([
      repo.listMonitors(),
      repo.getLatestResults(OVERVIEW_PULSE_SIZE),
      repo.getAllAggregates(),
    ]);
    const recentByMonitor = groupByMonitor(recentResults);

    const rows = monitors.map((monitor) => ({
      monitor,
      aggregate: aggregates.get(monitor.id) ?? emptyAggregate(monitor.id),
      recent: recentByMonitor.get(monitor.id) ?? [],
    }));

    return html(renderOverviewPage(rows));
  });

  app.get("/monitors/:id").handle(async ({ path }) => {
    const monitor = await repo.getMonitor(path.id);
    if (!monitor) throw new NotFoundError(`Monitor "${path.id}" not found`);

    const [aggregate, results, notifications] = await Promise.all([
      repo.getAggregate(path.id),
      repo.getRecentResults(path.id, DETAIL_RESULT_LIMIT),
      repo.getRecentNotifications(path.id, DETAIL_NOTIFICATION_LIMIT),
    ]);

    return html(
      renderMonitorDetailPage(monitor, aggregate, results, notifications),
    );
  });

  return app;
}
