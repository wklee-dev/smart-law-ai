import {
  countDomesticCasesByHs,
  countDomesticImagesByHs,
  listDomesticCasesByHs,
  listDomesticImagesByHs,
  openSmartLawDb,
} from "@/hanjoo/lib/domestic-cases";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function take(raw: string | null, fallback: number, max: number) {
  const n = Number(raw ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.floor(n), 1), max);
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const hs = url.searchParams.get("hs")?.replace(/\D/g, "") ?? "";
    if (hs.length < 8) {
      return NextResponse.json({ ok: false, error: "HSK가 필요합니다." }, { status: 400 });
    }
    const part = url.searchParams.get("part") === "images" ? "images" : "cases";
    const caseLimit = take(url.searchParams.get("caseLimit"), 15, 1000);
    const imageLimit = take(url.searchParams.get("imageLimit"), 12, 80);
    const db = await openSmartLawDb();
    try {
      if (part === "images") {
        return NextResponse.json({
          ok: true,
          hs,
          images: await listDomesticImagesByHs(db, hs, imageLimit),
          imageTotal: await countDomesticImagesByHs(db, hs),
        });
      }
      return NextResponse.json({
        ok: true,
        hs,
        cases: await listDomesticCasesByHs(db, hs, caseLimit),
        caseTotal: await countDomesticCasesByHs(db, hs),
      });
    } finally {
      await db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
