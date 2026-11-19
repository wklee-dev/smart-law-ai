declare module "node:sqlite" {
  export class DatabaseSync {
    constructor(
      path: string,
      options?: { readOnly?: boolean; timeout?: number },
    );
    prepare(sql: string): {
      all(...params: unknown[]): unknown[];
      get(...params: unknown[]): unknown;
      run(...params: unknown[]): unknown;
    };
    close(): void;
    exec(sql: string): void;
  }
}
