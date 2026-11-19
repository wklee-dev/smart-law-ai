import sql from "mssql";

let poolPromise: Promise<sql.ConnectionPool> | null = null;

const CAS_HOST_DEV = "203.242.224.16";
const CAS_HOST_LIVE = "203.242.224.24";

export function pickCasHost(): string {
  const target = (process.env.CAS_TARGET ?? "DEV").trim().toUpperCase();
  if (target === "LIVE") return process.env.DB_HOST_LIVE?.trim() || CAS_HOST_LIVE;
  return process.env.DB_HOST_DEV?.trim() || CAS_HOST_DEV;
}

const pickHost = pickCasHost;

export function getCasDbConfig(): sql.config {
  const server = pickHost();
  const database = process.env.DB_NAME?.trim() ?? "";
  const user = process.env.DB_USER?.trim() ?? "";
  const password = process.env.DB_PASSWORD?.trim() ?? "";
  const port = Number(process.env.DB_PORT?.trim() || 1433);

  if (!server || !database || !user || !password) {
    throw new Error(
      "CAS DB 연결 정보(CAS_TARGET/DB_HOST_*, DB_NAME, DB_USER, DB_PASSWORD)가 .env에 필요합니다.",
    );
  }

  const encrypt =
    process.env.DB_ENCRYPT?.trim().toLowerCase() === "true" ||
    process.env.DB_ENCRYPT?.trim() === "1";
  const trust =
    process.env.DB_TRUST_SERVER_CERTIFICATE?.trim().toLowerCase() !== "false";

  return {
    server,
    port,
    database,
    user,
    password,
    options: {
      encrypt,
      trustServerCertificate: trust,
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
