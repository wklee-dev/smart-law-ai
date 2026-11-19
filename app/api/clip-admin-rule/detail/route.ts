import { NextResponse } from "next/server";
import {
  getClipAdminRuleDetail,
  openClipAdminRuleDb,
} from "@/app/lib/clip-admin-rule-server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const u = new URL(req.url);
  const ruleId = u.searchParams.get("ruleId")?.trim();
  if (!ruleId) {
    return NextResponse.json(
      { error: "ruleId가 필요합니다." },
      { status: 400 },
    );
  }
  try {
    const db = openClipAdminRuleDb();
    try {
      const detail = getClipAdminRuleDetail(db, ruleId);
      if (!detail) {
        return NextResponse.json({ error: "항목을 찾을 수 없습니다." }, {
          status: 404,
        });
      }
      return NextResponse.json(detail);
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
