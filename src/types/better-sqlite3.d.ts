declare module "better-sqlite3" {
  interface Statement {
    run(...params: unknown[]): unknown;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  }

  interface Database {
    exec(sql: string): this;
    prepare(sql: string): Statement;
    transaction<T extends (...args: unknown[]) => unknown>(fn: T): T;
    close(): void;
  }

  interface DatabaseConstructor {
    new (filename: string): Database;
  }

  const Database: DatabaseConstructor;
  export default Database;
}
