import {
  openLawInfoCenterDb,
  queryLawInfoCenterLatest,
} from "@/app/lib/law-info-center-latest-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const db = openLawInfoCenterDb();
    try {
      const result = queryLawInfoCenterLatest(db, {
        category: u.searchParams.get("category") ?? "",
        ministry: u.searchParams.get("ministry") ?? "",
        lawType: u.searchParams.get("lawType") ?? "",
        keyword: u.searchParams.get("keyword") ?? "",
        page: Number(u.searchParams.get("page") ?? "1"),
        pageSize: Number(u.searchParams.get("pageSize") ?? "10"),
      });
      return NextResponse.json({ ...result, ok: true });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
