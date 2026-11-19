import { resolveWorldHsCaseAttachmentPath } from "@/app/lib/clip-world-hs-classification-cases-attachment-path";
import {
  getClipWorldHsClassificationCaseAttachmentFile,
  openClipWorldHsClassificationCasesDb,
} from "@/app/lib/clip-world-hs-classification-cases-server";
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function guessContentType(fileName: string): string {
  const n = fileName.toLowerCase();
  if (n.endsWith(".xlsx"))
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (n.endsWith(".xls")) return "application/vnd.ms-excel";
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".zip")) return "application/zip";
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

  const db = openClipWorldHsClassificationCasesDb();
  try {
    const row = getClipWorldHsClassificationCaseAttachmentFile(db, attachmentId);
    if (!row) {
      return NextResponse.json(
        { ok: false, error: "첨부를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    const local = row.local_path.trim();
    if (!local) {
      return NextResponse.json(
        {
          ok: false,
          error: "로컬 파일 없음",
          downloadUrl: row.download_url || undefined,
        },
        { status: 404 },
      );
    }

    let abs: string;
    try {
      abs = resolveWorldHsCaseAttachmentPath(local);
    } catch {
      return NextResponse.json({ ok: false, error: "경로 거부" }, { status: 403 });
    }

    if (!fs.existsSync(abs)) {
      return NextResponse.json(
        {
          ok: false,
          error: "파일이 디스크에 없습니다.",
          downloadUrl: row.download_url || undefined,
        },
        { status: 404 },
      );
    }

    const buf = fs.readFileSync(abs);
    const fileName = row.original_file_name || path.basename(abs);
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
