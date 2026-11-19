import fs from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { getNlcAttachmentForDownload } from "@/app/lib/nlc-notice-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function guessContentType(fileName: string): string {
  const n = fileName.toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".hwpx")) return "application/vnd.hancom.hwpx";
  if (n.endsWith(".hwp")) return "application/x-hwp";
  if (n.endsWith(".docx"))
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (n.endsWith(".zip")) return "application/zip";
  return "application/octet-stream";
}

export async function GET(request: NextRequest) {
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "id가 필요합니다." }, { status: 400 });
  }

  const row = getNlcAttachmentForDownload(id);
  if (!row) {
    return NextResponse.json({ error: "첨부 없음" }, { status: 404 });
  }
  if (!row.absPath) {
    return NextResponse.json(
      {
        error: "로컬 파일 없음",
        downloadUrl: row.downloadUrl || undefined,
      },
      { status: 404 },
    );
  }

  const buf = fs.readFileSync(row.absPath);
  const disposition = request.nextUrl.searchParams.get("disposition");
  const inline = disposition === "inline";
  const headers = new Headers();
  headers.set("Content-Type", guessContentType(row.fileName));
  headers.set(
    "Content-Disposition",
    `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(row.fileName)}`,
  );
  return new NextResponse(buf, { status: 200, headers });
}
