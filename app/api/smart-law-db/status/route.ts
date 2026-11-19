import {
  getSmartLawAttachRoot,
  getSmartLawDbLabel,
  isSmartLawPostgres,
  withSmartLawDb,
} from "@/app/lib/smart-law-db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** 웹이 SQLite/Postgres 중 어디에 붙는지 확인 */
export async function GET() {
  try {
    const mode = isSmartLawPostgres() ? "postgres" : "sqlite";
    const label = getSmartLawDbLabel();
    const attachRoot = getSmartLawAttachRoot();
    const probe = await withSmartLawDb(async (db) => {
      const laws = await db.get(`SELECT COUNT(*) AS n FROM laws`);
      const tariff = await db.get(`SELECT COUNT(*) AS n FROM tariff_section`);
      return {
        dialect: db.dialect,
        laws: Number(laws?.n ?? 0),
        tariff_section: Number(tariff?.n ?? 0),
      };
    });
    return NextResponse.json({
      ok: true,
      mode,
      label,
      attachRoot,
      probe,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        ok: false,
        mode: isSmartLawPostgres() ? "postgres" : "sqlite",
        label: getSmartLawDbLabel(),
        error: msg,
      },
      { status: 500 },
    );
  }
}
