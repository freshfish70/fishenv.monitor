import { DatabaseSync } from "node:sqlite";

import {
  type DatabaseIntrospector,
  type Dialect,
  type Driver,
  Kysely,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from "kysely";

import NodeNativeSqliteDriver from "./NodeNativeSqliteDriver.ts";

class NodeNativeSqliteDialect implements Dialect {
  readonly #args: ConstructorParameters<typeof DatabaseSync>;

  constructor(...args: ConstructorParameters<typeof DatabaseSync>) {
    this.#args = args;
  }

  createAdapter(): SqliteAdapter {
    return new SqliteAdapter();
  }
  createDriver(): Driver {
    return new NodeNativeSqliteDriver(...this.#args);
  }
  createIntrospector(db: Kysely<unknown>): DatabaseIntrospector {
    return new SqliteIntrospector(db);
  }
  createQueryCompiler(): SqliteQueryCompiler {
    return new SqliteQueryCompiler();
  }
}

export default NodeNativeSqliteDialect;
