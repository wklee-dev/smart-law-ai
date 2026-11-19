/** Node.js `node:sqlite` (stable as of Node 22.5+); `@types/node` may lag. */
declare module "node:sqlite" {
  export interface StatementSync {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): unknown;
  }

  export class DatabaseSync {
    constructor(
      path: string,
      options?: { readOnly?: boolean; timeout?: number },
    );
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
