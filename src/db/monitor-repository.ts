import { type Kysely, type Selectable, sql } from "kysely";
import type {
  CheckResultsTable,
  Database,
  MonitorsTable,
  MonitorState,
} from "./schema.ts";
import type { IsDownResult } from "../types/monitor.ts";
import type { CheckResult } from "../monitors/registry.ts";

export type MonitorRow = Selectable<MonitorsTable>;
export type CheckResultRow = Selectable<CheckResultsTable>;

export interface MonitorAggregate {
  monitorId: string;
  avgDurationMs: number | null;
  minDurationMs: number | null;
  maxDurationMs: number | null;
  totalChecks: number;
  upChecks: number;
}

interface AggregateRow {
  avg_duration_ms: number | null;
  min_duration_ms: number | null;
  max_duration_ms: number | null;
  total_checks: number;
  up_checks: number | null;
}

function toAggregate(monitorId: string, row: AggregateRow): MonitorAggregate {
  return {
    monitorId,
    avgDurationMs: row.avg_duration_ms,
    minDurationMs: row.min_duration_ms,
    maxDurationMs: row.max_duration_ms,
    totalChecks: row.total_checks,
    upChecks: row.up_checks ?? 0,
  };
}

function serializeResult(result: CheckResult): unknown {
  if ("headers" in result) {
    return {
      status: result.status,
      ok: result.ok,
      headers: Object.fromEntries(result.headers.entries()),
      durationMs: result.durationMs,
      error: result.error?.message,
    };
  }
  return {
    records: result.records,
    durationMs: result.durationMs,
    error: result.error?.message,
  };
}

export class MonitorRepository {
  constructor(private db: Kysely<Database>) {}

  /** Reads the monitor's last-known state, lazily registering the monitor (state "unknown") on first sight. */
  async getState(
    monitorId: string,
    name: string,
    type: string,
  ): Promise<MonitorState> {
    const row = await this.db
      .selectFrom("monitors")
      .select("last_state")
      .where("id", "=", monitorId)
      .executeTakeFirst();

    if (row) return row.last_state;

    const now = new Date().toISOString();
    await this.db
      .insertInto("monitors")
      .values({
        id: monitorId,
        name,
        type,
        last_state: "unknown",
        last_checked_at: null,
        last_transition_at: null,
        updated_at: now,
      })
      .onConflict((oc) => oc.column("id").doNothing())
      .execute();

    return "unknown";
  }

  async updateState(monitorId: string, state: MonitorState): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .updateTable("monitors")
      .set({ last_state: state, last_transition_at: now, updated_at: now })
      .where("id", "=", monitorId)
      .execute();
  }

  async recordCheckResult(
    monitorId: string,
    isDownResult: IsDownResult,
    result: CheckResult,
  ): Promise<void> {
    const now = new Date().toISOString();

    await this.db
      .updateTable("monitors")
      .set({ last_checked_at: now, updated_at: now })
      .where("id", "=", monitorId)
      .execute();

    await this.db
      .insertInto("check_results")
      .values({
        monitor_id: monitorId,
        checked_at: now,
        down: isDownResult.down ? 1 : 0,
        message: isDownResult.message,
        duration_ms: Math.round(result.durationMs),
        raw_result: JSON.stringify(serializeResult(result)),
      })
      .execute();
  }

  /** All known monitors, alphabetical by name. */
  async listMonitors(): Promise<MonitorRow[]> {
    return await this.db
      .selectFrom("monitors")
      .selectAll()
      .orderBy("name")
      .execute();
  }

  async getMonitor(monitorId: string): Promise<MonitorRow | undefined> {
    return await this.db
      .selectFrom("monitors")
      .selectAll()
      .where("id", "=", monitorId)
      .executeTakeFirst();
  }

  /** The most recent `limit` check results for every monitor, newest first within each monitor. */
  async getLatestResults(limit: number): Promise<CheckResultRow[]> {
    const ranked = this.db
      .selectFrom("check_results")
      .select([
        "id",
        "monitor_id",
        "checked_at",
        "down",
        "message",
        "duration_ms",
        "raw_result",
        sql<number>`row_number() over (partition by monitor_id order by checked_at desc, id desc)`
          .as("rn"),
      ]);

    return await this.db
      .selectFrom(ranked.as("ranked"))
      .select([
        "id",
        "monitor_id",
        "checked_at",
        "down",
        "message",
        "duration_ms",
        "raw_result",
      ])
      .where("rn", "<=", limit)
      .orderBy("monitor_id")
      .orderBy("checked_at", "desc")
      .execute();
  }

  /** Most recent `limit` results for a single monitor, newest first. */
  async getRecentResults(
    monitorId: string,
    limit: number,
  ): Promise<CheckResultRow[]> {
    return await this.db
      .selectFrom("check_results")
      .selectAll()
      .where("monitor_id", "=", monitorId)
      .orderBy("checked_at", "desc")
      .orderBy("id", "desc")
      .limit(limit)
      .execute();
  }

  /** Response-time and uptime aggregates for a single monitor, across all recorded results. */
  async getAggregate(monitorId: string): Promise<MonitorAggregate> {
    const { rows } = await sql<AggregateRow>`
      SELECT
        AVG(duration_ms) AS avg_duration_ms,
        MIN(duration_ms) AS min_duration_ms,
        MAX(duration_ms) AS max_duration_ms,
        COUNT(*) AS total_checks,
        SUM(CASE WHEN down = 0 THEN 1 ELSE 0 END) AS up_checks
      FROM check_results
      WHERE monitor_id = ${monitorId}
    `.execute(this.db);
    return toAggregate(monitorId, rows[0]);
  }

  /** Same aggregates as {@link getAggregate}, for every monitor at once. */
  async getAllAggregates(): Promise<Map<string, MonitorAggregate>> {
    const { rows } = await sql<AggregateRow & { monitor_id: string }>`
      SELECT
        monitor_id,
        AVG(duration_ms) AS avg_duration_ms,
        MIN(duration_ms) AS min_duration_ms,
        MAX(duration_ms) AS max_duration_ms,
        COUNT(*) AS total_checks,
        SUM(CASE WHEN down = 0 THEN 1 ELSE 0 END) AS up_checks
      FROM check_results
      GROUP BY monitor_id
    `.execute(this.db);
    return new Map(rows.map((row) => [row.monitor_id, toAggregate(row.monitor_id, row)]));
  }
}
