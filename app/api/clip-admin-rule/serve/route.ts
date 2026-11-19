import fs from "node:fs";
import { NextResponse } from "next/server";
import { openClipAdminRuleDb } from "@/app/lib/clip-admin-rule-server";
import {
  clipAnnexRowById,
  clipAttachmentRowById,
  clipPickPathFromAnnexRow,
  clipPickPathFromAttachmentRow,
  clipResolveServePath,
  dispositionFilename,
  mimeForPath,
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
  const recordId =
    u.searchParams.get("id")?.trim() ?? u.searchParams.get("rowid")?.trim();
  const variant = (u.searchParams.get("variant") ?? "pdf").trim().toLowerCase();

  if (!ruleId || !kind) {
    return NextResponse.json(
      { error: "ruleId와 kind(annex|attachment)가 필요합니다." },
      { status: 400 },
    );
  }
  if (!recordId) {
    return NextResponse.json(
      { error: "id(annex_id 또는 attach_id)가 필요합니다." },
      { status: 400 },
    );
  }

  const allowedVariants = ["pdf", "hwp", "file", "first"];
  if (!allowedVariants.includes(variant)) {
    return NextResponse.json(
      { error: "variant는 pdf | hwp | file 입니다." },
      { status: 400 },
    );
  }

  try {
    const db = openClipAdminRuleDb();
    try {
      let stored: string | null = null;

      if (kind === "annex") {
        const row = clipAnnexRowById(db, ruleId, recordId);
        if (!row) {
          return NextResponse.json(
            { error: "별표·서식 레코드를 찾을 수 없습니다." },
            { status: 404 },
          );
        }
        const v = variant === "first" ? "pdf" : variant;
        stored = clipPickPathFromAnnexRow(row, v);
      } else {
        const row = clipAttachmentRowById(db, ruleId, recordId);
        if (!row) {
          return NextResponse.json(
            { error: "첨부파일 레코드를 찾을 수 없습니다." },
            { status: 404 },
          );
        }
        stored = clipPickPathFromAttachmentRow(row);
      }

      if (!stored) {
        return NextResponse.json(
          { error: "로컬 파일 경로가 비어 있습니다." },
          { status: 404 },
        );
      }

      const abs = clipResolveServePath(stored);
      if (!abs) {
        return NextResponse.json(
          { error: "파일이 없거나 접근할 수 없는 경로입니다." },
          { status: 404 },
        );
      }

      const buf = fs.readFileSync(abs);
      const mime = mimeForPath(abs);
      const name = dispositionFilename(abs);
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": mime,
          "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
        },
      });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
