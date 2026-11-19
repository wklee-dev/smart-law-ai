import {
  getClipLatestLawDetail,
  openClipLatestLawDb,
  parseClipLatestLawRowKey,
} from "@/app/lib/clip-latest-law-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const u = new URL(req.url);
  const key = u.searchParams.get("key")?.trim() ?? "";
  let lawId = u.searchParams.get("lawId")?.trim() ?? "";
  let pmgt = u.searchParams.get("pmgtDtTpNo")?.trim() ?? "";
  if (key) {
    const parsed = parseClipLatestLawRowKey(key);
    if (!parsed) {
      return NextResponse.json(
        { ok: false, error: "key 형식이 올바르지 않습니다." },
        { status: 400 },
      );
    }
    lawId = parsed.law_id;
    pmgt = parsed.pmgt_dt_tp_no;
  }
  if (!lawId || !pmgt) {
    return NextResponse.json(
      { ok: false, error: "lawId·pmgtDtTpNo(또는 key)가 필요합니다." },
      { status: 400 },
    );
  }
  try {
    const db = openClipLatestLawDb();
    try {
      const detail = getClipLatestLawDetail(db, lawId, pmgt);
      if (!detail) {
        return NextResponse.json(
          { ok: false, error: "법령을 찾을 수 없습니다." },
          { status: 404 },
        );
      }
      return NextResponse.json({ ok: true, detail });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
