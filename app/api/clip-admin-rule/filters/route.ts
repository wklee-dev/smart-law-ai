import { NextResponse } from "next/server";
import {
  clipAdminRuleDistinctFilters,
  openClipAdminRuleDb,
} from "@/app/lib/clip-admin-rule-server";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    const db = openClipAdminRuleDb();
    const data = clipAdminRuleDistinctFilters(db);
    db.close();
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
