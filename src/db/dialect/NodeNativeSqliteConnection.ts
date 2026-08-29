import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import type { DatabaseConnection, QueryResult } from "kysely";
import { CompiledQuery } from "kysely";

class NodeNativeSqliteConnection implements DatabaseConnection, Disposable {
  #db: DatabaseSync;

  constructor(...args: ConstructorParameters<typeof DatabaseSync>) {
    this.#db = new DatabaseSync(...args);
  }

  [Symbol.dispose]() {
    this.#db.close();
  }

  executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
    const { sql, parameters, query } = compiledQuery;
    const stmt = this.#db.prepare(sql);

    // Determine if we should use .all() (for SELECT/RETURNING) or .run() (for others)
    // We use a heuristic based on the query kind and content.
    let useAll = false;

    if (query.kind === "SelectQueryNode") {
      useAll = true;
    } else if (
      query.kind === "InsertQueryNode" ||
      query.kind === "UpdateQueryNode" ||
      query.kind === "DeleteQueryNode"
    ) {
      // Check if there is a returning clause.
      // Kysely's QueryNode structure for these usually has a 'returning' property if it exists.
      // However, accessing it might require type guards.
      // A simpler robust check for 'RETURNING' in the SQL string is often sufficient and faster
      // than traversing the node tree if types are tricky, but let's try to use the node if possible.
      // For now, let's rely on the SQL string for the RETURNING clause as a fallback or primary check
      // because the node structure might vary.
      if (sql.toLowerCase().includes("returning")) {
        useAll = true;
      }
    } else if (query.kind === "RawNode") {
      const lowerSql = sql.toLowerCase().trim();
      if (
        lowerSql.startsWith("select") ||
        lowerSql.startsWith("pragma") ||
        lowerSql.startsWith("with") ||
        lowerSql.includes("returning")
      ) {
        useAll = true;
      }
    }

    if (useAll) {
      const rows = stmt.all(...(parameters as SQLInputValue[])) as R[];
      return Promise.resolve({
        rows,
      });
    } else {
      const result = stmt.run(...(parameters as SQLInputValue[]));
      return Promise.resolve({
        rows: [],
        insertId: BigInt(result.lastInsertRowid),
        numAffectedRows: BigInt(result.changes),
      });
    }
  }

  async *streamQuery<R>(
    compiledQuery: CompiledQuery,
    _chunkSize?: number,
  ): AsyncIterableIterator<QueryResult<R>> {
    // node:sqlite is synchronous and doesn't support streaming yet.
    // We simulate streaming by executing the query and yielding results.
    const result = await this.executeQuery<R>(compiledQuery);
    if (result.rows) {
      yield { rows: result.rows };
    }
  }
}

export default NodeNativeSqliteConnection;
