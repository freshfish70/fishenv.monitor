import { type Kysely, sql } from "kysely";
import type { Database } from "./schema.ts";

/**
 * SQLite has no `ADD COLUMN IF NOT EXISTS`, so existing databases need the
 * column list checked before altering.
 */
async function addColumnIfMissing(
  db: Kysely<Database>,
  table: string,
  column: string,
  definition: string,
): Promise<void> {
  const { rows } = await sql<{ name: string }>`
    SELECT name FROM pragma_table_info(${table})
  `.execute(db);
  if (rows.some((row) => row.name === column)) return;
  await sql.raw(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
    .execute(db);
}

export async function migrate(db: Kysely<Database>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS monitors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      last_state TEXT NOT NULL DEFAULT 'unknown',
      last_checked_at TEXT,
      last_transition_at TEXT,
      consecutive INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    )
  `.execute(db);

  await addColumnIfMissing(
    db,
    "monitors",
    "consecutive",
    "INTEGER NOT NULL DEFAULT 0",
  );

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

  await sql`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      monitor_id TEXT NOT NULL REFERENCES monitors(id),
      endpoint TEXT NOT NULL,
      channel TEXT NOT NULL,
      kind TEXT NOT NULL,
      ok INTEGER NOT NULL,
      error TEXT,
      sent_at TEXT NOT NULL
    )
  `.execute(db);

  // Serves both the dashboard's per-monitor feed and the per-endpoint cooldown
  // lookup, which filters on (monitor_id, endpoint) and takes the newest row.
  await sql`
    CREATE INDEX IF NOT EXISTS idx_notifications_monitor_endpoint_sent
    ON notifications(monitor_id, endpoint, sent_at)
  `.execute(db);
}
