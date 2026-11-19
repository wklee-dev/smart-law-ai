import fs from "node:fs";
import { NextResponse } from "next/server";
import { resolveClipAnnexFilePath } from "@/app/lib/clip-annex-server";

export const dynamic = "force-dynamic";

function contentTypeFor(name: string, fileType: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf") || fileType === "pdf") return "application/pdf";
  if (lower.endsWith(".hwp") || fileType === "hwp") return "application/x-hwp";
  if (lower.endsWith(".hwpx")) {
    return "application/vnd.hancom.hwpx";
  }
  return "application/octet-stream";
}

export function GET(req: Request) {
  const u = new URL(req.url);
  const attachmentId = u.searchParams.get("attachmentId")?.trim();
  const inline = u.searchParams.get("inline") === "1";
  if (!attachmentId) {
    return NextResponse.json({ error: "attachmentId가 필요합니다." }, { status: 400 });
  }

  try {
    const resolved = resolveClipAnnexFilePath(attachmentId);
    if (!resolved) {
      return NextResponse.json(
        { error: "다운로드 가능한 파일이 없습니다." },
        { status: 404 },
      );
    }
    const buf = fs.readFileSync(resolved.absolutePath);
    const encoded = encodeURIComponent(resolved.fileName).replace(/['()]/g, escape);
    const isPdf = contentTypeFor(resolved.fileName, resolved.fileType) === "application/pdf";
    const disposition =
      inline && isPdf ? "inline" : "attachment";

    return new NextResponse(buf, {
      headers: {
        "Content-Type": contentTypeFor(resolved.fileName, resolved.fileType),
        "Content-Disposition": `${disposition}; filename*=UTF-8''${encoded}`,
        "Content-Length": String(buf.byteLength),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
