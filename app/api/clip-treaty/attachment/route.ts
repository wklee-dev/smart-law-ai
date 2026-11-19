import fs from "node:fs";
import { NextResponse } from "next/server";
import { resolveClipTreatyAttachmentPath } from "@/app/lib/clip-treaty-server";

export const dynamic = "force-dynamic";

function contentTypeFor(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".hwp")) return "application/x-hwp";
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return "application/octet-stream";
}

export function GET(req: Request) {
  const u = new URL(req.url);
  const attachmentId = u.searchParams.get("attachmentId")?.trim();
  if (!attachmentId) {
    return NextResponse.json({ error: "attachmentId가 필요합니다." }, { status: 400 });
  }
  try {
    const resolved = resolveClipTreatyAttachmentPath(attachmentId);
    if (!resolved) {
      return NextResponse.json(
        { error: "다운로드 가능한 첨부파일이 없습니다." },
        { status: 404 },
      );
    }
    const buf = fs.readFileSync(resolved.absolutePath);
    const encoded = encodeURIComponent(resolved.fileName).replace(/['()]/g, escape);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": contentTypeFor(resolved.fileName),
        "Content-Disposition": `attachment; filename*=UTF-8''${encoded}`,
        "Content-Length": String(buf.byteLength),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
