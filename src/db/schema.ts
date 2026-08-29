import type { ColumnType, Generated } from "kysely";

export type MonitorState = "up" | "down" | "unknown";

export interface MonitorsTable {
  id: string;
  name: string;
  type: string;
  last_state: ColumnType<MonitorState, MonitorState | undefined, MonitorState>;
  last_checked_at: string | null;
  last_transition_at: string | null;
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

export interface Database {
  monitors: MonitorsTable;
  check_results: CheckResultsTable;
}
