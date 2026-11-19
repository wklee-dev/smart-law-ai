import { NextResponse } from "next/server";
import { openClipAdminRuleDb } from "@/app/lib/clip-admin-rule-server";
import {
  clipResolveSatelliteTable,
  clipSatelliteUiRowsForApi,
  clipTableExists,
  type ClipSatelliteKind,
} from "@/app/lib/clip-admin-rule-satellite";
export const dynamic = "force-dynamic";

function parseKind(raw: string | null): ClipSatelliteKind | null {
  const t = (raw ?? "").trim().toLowerCase();
  if (t === "annex" || t === "별표") return "annex";
  if (t === "attachment" || t === "attach" || t === "첨부") return "attachment";
  return null;
}

export function GET(req: Request) {
  const u = new URL(req.url);
  const ruleId = u.searchParams.get("ruleId")?.trim();
  const kind = parseKind(u.searchParams.get("kind") ?? u.searchParams.get("type"));
  if (!ruleId || !kind) {
    return NextResponse.json(
      { error: "ruleId와 kind(annex|attachment)가 필요합니다." },
      { status: 400 },
    );
  }
  try {
    const db = openClipAdminRuleDb();
    try {
      const table = clipResolveSatelliteTable(kind);
      const rows = clipSatelliteUiRowsForApi(db, ruleId, kind);
      return NextResponse.json({
        kind,
        tableResolved: table && clipTableExists(db, table) ? table : null,
        rows,
        total: rows.length,
      });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
