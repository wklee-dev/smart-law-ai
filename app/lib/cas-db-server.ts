import sql from "mssql";
import { pickCasHost } from "@/hanjoo/lib/cas-db";

let poolPromise: Promise<sql.ConnectionPool> | null = null;

export function getCasDbConfig(): sql.config {
  const server = pickCasHost();
  const database = process.env.DB_NAME?.trim() ?? "";
  const user = process.env.DB_USER?.trim() ?? "";
  const password = process.env.DB_PASSWORD?.trim() ?? "";
  const port = Number(process.env.DB_PORT?.trim() || 1433);

  if (!server || !database || !user || !password) {
    throw new Error(
      "CAS DB 연결 정보(DB_HOST, DB_NAME, DB_USER, DB_PASSWORD)가 .env에 필요합니다.",
    );
  }

  const encrypt =
    process.env.DB_ENCRYPT?.trim().toLowerCase() === "true" ||
    process.env.DB_ENCRYPT?.trim() === "1";

  return {
    server,
    port,
    database,
    user,
    password,
    options: {
      encrypt,
      trustServerCertificate: true,
    },
    pool: {
      max: 5,
      min: 0,
      idleTimeoutMillis: 30000,
    },
    requestTimeout: 60000,
  };
}

export async function getCasDbPool(): Promise<sql.ConnectionPool> {
  if (!poolPromise) {
    const config = getCasDbConfig();
    poolPromise = new sql.ConnectionPool(config).connect().catch((err: unknown) => {
      poolPromise = null;
      throw err;
    });
  }
  return poolPromise;
}

export { sql };
