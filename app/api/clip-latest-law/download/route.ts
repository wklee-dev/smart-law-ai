import { resolveClipLatestLawAttachmentPath } from "@/app/lib/clip-latest-law-attach-path";
import {
  getClipLatestLawAttachmentForDownload,
  openClipLatestLawDb,
} from "@/app/lib/clip-latest-law-server";
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function guessContentType(fileName: string): string {
  const n = fileName.toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".hwp")) return "application/x-hwp";
  if (n.endsWith(".hwpx")) return "application/vnd.hancom.hwpx";
  return "application/octet-stream";
}

export async function GET(req: Request) {
  const attachmentId =
    new URL(req.url).searchParams.get("attachmentId")?.trim() ?? "";
  if (!attachmentId) {
    return NextResponse.json(
      { ok: false, error: "attachmentId가 필요합니다." },
      { status: 400 },
    );
  }

  const db = openClipLatestLawDb();
  try {
    const row = getClipLatestLawAttachmentForDownload(db, attachmentId);
    if (!row) {
      return NextResponse.json(
        { ok: false, error: "첨부를 찾을 수 없습니다." },
        { status: 404 },
      );
    }
    const rel = row.saved_relative_path.trim();
    if (!rel) {
      return NextResponse.json(
        { ok: false, error: "로컬 경로 없음", downloadUrl: row.source_url },
        { status: 404 },
      );
    }
    let abs: string;
    try {
      abs = resolveClipLatestLawAttachmentPath(rel);
    } catch {
      return NextResponse.json({ ok: false, error: "경로 거부" }, { status: 403 });
    }
    if (!fs.existsSync(abs)) {
      return NextResponse.json(
        { ok: false, error: "파일 없음", downloadUrl: row.source_url },
        { status: 404 },
      );
    }
    const buf = fs.readFileSync(abs);
    const fileName = row.original_filename || path.basename(abs);
    const encoded = encodeURIComponent(fileName).replace(/['()]/g, escape);
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": guessContentType(fileName),
        "Content-Length": String(buf.length),
        "Content-Disposition": `attachment; filename*=UTF-8''${encoded}`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  } finally {
    db.close();
  }
}
