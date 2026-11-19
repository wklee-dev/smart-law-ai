import { readAdminNoticeFile } from "@/hanjoo/lib/admin-notices";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function contentType(name: string): string {
  const n = name.toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".hwp")) return "application/x-hwp";
  if (n.endsWith(".hwpx")) return "application/hwpx";
  if (n.endsWith(".zip")) return "application/zip";
  return "application/octet-stream";
}

export async function GET(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("id") ?? "0");
  const file = await readAdminNoticeFile(id);
  if (!file) {
    return NextResponse.json({ ok: false, error: "파일을 찾을 수 없습니다." }, { status: 404 });
  }
  const encoded = encodeURIComponent(file.name);
  return new NextResponse(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": contentType(file.name),
      "Content-Length": String(file.bytes.length),
      "Content-Disposition": `attachment; filename*=UTF-8''${encoded}`,
    },
  });
}
