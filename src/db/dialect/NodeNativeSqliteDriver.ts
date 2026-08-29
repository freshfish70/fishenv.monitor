import { DatabaseSync } from "node:sqlite";

import type {
  DatabaseConnection,
  Driver,
  QueryCompiler,
  TransactionSettings,
} from "kysely";
import { CompiledQuery, IdentifierNode, RawNode } from "kysely";

import Mutex from "./Mutex.ts";
import NodeNativeSqliteConnection from "./NodeNativeSqliteConnection.ts";

class NodeNativeSqliteDriver implements Driver, AsyncDisposable {
  #args: ConstructorParameters<typeof DatabaseSync>;
  #connection: NodeNativeSqliteConnection | undefined;
  #mutex = new Mutex();

  constructor(...args: ConstructorParameters<typeof DatabaseSync>) {
    this.#args = args;
  }

  get connection() {
    if (typeof this.#connection === "undefined") {
      throw new Error("Database was not initialized. Run `init` first");
    }
    return this.#connection;
  }

  async acquireConnection() {
    await this.#mutex.lock();
    return this.connection;
  }

  async beginTransaction(
    connection: NodeNativeSqliteConnection,
    _settings: TransactionSettings,
  ) {
    await connection.executeQuery(CompiledQuery.raw("BEGIN"));
  }
  async commitTransaction(connection: DatabaseConnection) {
    await connection.executeQuery(CompiledQuery.raw("COMMIT"));
  }

  destroy(): Promise<void> {
    this.#connection?.[Symbol.dispose]();
    return Promise.resolve();
  }

  async [Symbol.asyncDispose]() {
    await this.destroy();
  }

  init(): Promise<void> {
    this.#connection = new NodeNativeSqliteConnection(...this.#args);
    return Promise.resolve();
  }

  releaseConnection(_connection: DatabaseConnection): Promise<void> {
    this.#mutex.unlock();
    return Promise.resolve();
  }

  async releaseSavepoint(
    connection: DatabaseConnection,
    savepointName: string,
    compileQuery: QueryCompiler["compileQuery"],
  ) {
    await connection.executeQuery(
      compileQuery(savepointCommand("RELEASE SAVEPOINT", savepointName)),
    );
  }

  async rollbackToSavepoint(
    connection: DatabaseConnection,
    savepointName: string,
    compileQuery: QueryCompiler["compileQuery"],
  ) {
    await connection.executeQuery(
      compileQuery(savepointCommand("ROLLBACK TO SAVEPOINT", savepointName)),
    );
  }

  async rollbackTransaction(connection: DatabaseConnection) {
    await connection.executeQuery(CompiledQuery.raw("ROLLBACK"));
  }

  async savepoint(
    connection: DatabaseConnection,
    savepointName: string,
    compileQuery: QueryCompiler["compileQuery"],
  ) {
    await connection.executeQuery(
      compileQuery(savepointCommand("SAVEPOINT", savepointName)),
    );
  }
}

const savepointCommand = (
  command: "SAVEPOINT" | "RELEASE SAVEPOINT" | "ROLLBACK TO SAVEPOINT",
  savepointName: string,
): RawNode =>
  RawNode.createWithChildren([
    RawNode.createWithSql(command),
    IdentifierNode.create(savepointName),
  ]);

export default NodeNativeSqliteDriver;
