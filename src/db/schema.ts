import type { ColumnType, Generated } from "kysely";
import type { MonitorState } from "../types/monitor.ts";
import type { NotificationEventKind } from "../types/notification.ts";

export type { MonitorState };

export interface MonitorsTable {
  id: string;
  name: string;
  type: string;
  last_state: ColumnType<MonitorState, MonitorState | undefined, MonitorState>;
  last_checked_at: string | null;
  last_transition_at: string | null;
  /** Checks in a row that produced `last_state`, including the latest. */
  consecutive: ColumnType<number, number | undefined, number>;
  updated_at: string;
}

export interface CheckResultsTable {
  id: Generated<number>;
  monitor_id: string;
  checked_at: string;
  /** SQLite has no boolean type — always stored/bound as 0 or 1. */
  down: 0 | 1;
  message: string | null;
  duration_ms: number | null;
  raw_result: string | null;
}

/** One delivery attempt. Rows are written whether or not the send succeeded. */
export interface NotificationsTable {
  id: Generated<number>;
  monitor_id: string;
  /** The endpoint's `name`. */
  endpoint: string;
  /** The endpoint's channel `type`, e.g. "discord". */
  channel: string;
  kind: NotificationEventKind;
  ok: 0 | 1;
  error: string | null;
  sent_at: string;
}

export interface Database {
  monitors: MonitorsTable;
  check_results: CheckResultsTable;
  notifications: NotificationsTable;
}
