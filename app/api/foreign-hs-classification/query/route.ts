import {
  openForeignHsCaseDb,
  parseForeignGroupedBody,
  searchForeignCasesGrouped,
} from "@/app/lib/foreign-hs-case-server";
import { FOREIGN_HS_BUCKET_ORDER } from "@/app/lib/foreign-hs-case-buckets";
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

  const parsed = parseForeignGroupedBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, {
      status: 400,
    });
  }

  try {
    const db = openForeignHsCaseDb();
    try {
      const buckets =
        parsed.q.buckets.length > 0 ? parsed.q.buckets : [...FOREIGN_HS_BUCKET_ORDER];
      const ensured = { ...parsed.q, buckets };
      const partial = searchForeignCasesGrouped(db, ensured);
      return NextResponse.json({
        ok: true,
        grouped: true,
        buckets: partial,
        bucketOrder: FOREIGN_HS_BUCKET_ORDER,
      });
    } finally {
      db.close();
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
