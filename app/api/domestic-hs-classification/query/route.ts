import {
  parseClassificationQuery,
  openDomesticHsClassDb,
  parseDomesticHsSince2006,
  searchClassificationCases,
  searchClassificationCasesGrouped,
} from "@/app/lib/domestic-hs-class-server";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON 본문이 필요합니다." }, {
      status: 400,
    });
  }

  const pq = parseClassificationQuery(body);
  if (!pq.ok) {
    return NextResponse.json({ ok: false, error: pq.error }, { status: 400 });
  }

  try {
    const since2006 = parseDomesticHsSince2006(body.since2006);
    const db = openDomesticHsClassDb({ since2006 });
    try {
      if (pq.parsed.mode === "grouped") {
        const buckets = searchClassificationCasesGrouped(db, pq.parsed.grouped);
        return NextResponse.json({
          ok: true,
          grouped: true,
          buckets,
        });
      }

      const { rows, total, page, pageSize } = searchClassificationCases(
        db,
        pq.parsed.body,
      );

      return NextResponse.json({
        ok: true,
        grouped: false,
        rows,
        total,
        page,
        pageSize,
      });
    } finally {
      db.close();
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 500 },
    );
  }
}
