import { type Kysely, sql } from "kysely";
import type { Database } from "./schema.ts";

export async function migrate(db: Kysely<Database>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS monitors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      last_state TEXT NOT NULL DEFAULT 'unknown',
      last_checked_at TEXT,
      last_transition_at TEXT,
      updated_at TEXT NOT NULL
    )
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS check_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      monitor_id TEXT NOT NULL REFERENCES monitors(id),
      checked_at TEXT NOT NULL,
      down INTEGER NOT NULL,
      message TEXT,
      duration_ms INTEGER,
      raw_result TEXT
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS idx_check_results_monitor_checked
    ON check_results(monitor_id, checked_at)
  `.execute(db);
}
