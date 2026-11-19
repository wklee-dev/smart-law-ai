import {
  adminRulesAttachSlug,
  fetchAdminRulesAttachmentById,
  getSourceMetaFromDbByParam,
  isSafeRuleConfigParam,
} from "@/app/lib/admin-rules-server";
import { openAdminRulesSqliteDb } from "@/app/lib/admin-rules-sqlite";
import { resolveAdminAttachmentPath } from "@/app/lib/admin-rules-paths";
import fs from "node:fs";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function guessContentType(
  fileName: string,
  fileType: string,
  mimeType: string,
): string {
  if (mimeType.trim()) return mimeType.trim();
  const n = fileName.toLowerCase();
  const t = fileType.toLowerCase();
  if (n.endsWith(".pdf") || t === "pdf") return "application/pdf";
  if (n.endsWith(".png") || t === "png") return "image/png";
  if (n.endsWith(".gif") || t === "gif") return "image/gif";
  if (n.endsWith(".webp") || t === "webp") return "image/webp";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg") || t === "jpg" || t === "jpeg")
    return "image/jpeg";
  if (n.endsWith(".hwpx")) return "application/vnd.hancom.hwpx";
  if (n.endsWith(".hwp") || t === "hwp") return "application/x-hwp";
  if (t === "image") return "image/png";
  return "application/octet-stream";
}

/**
 * attachment ID 기반 안전 파일 제공.
 * - local_path를 클라이언트에 노출하지 않음
 * - ADMIN_RULES_ATTACH_ROOT(attach_dir) 하위 파일만 허용
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const idRaw = url.searchParams.get("id")?.trim() ?? "";
  const id = Number(idRaw);
  const dispositionParam = url.searchParams.get("disposition")?.trim();

  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "유효한 id가 필요합니다." }, { status: 400 });
  }

  const db = await openAdminRulesSqliteDb();
  try {
    const row = await fetchAdminRulesAttachmentById(db, id);
    if (!row) {
      return NextResponse.json({ error: "첨부 없음" }, { status: 404 });
    }

    if (!isSafeRuleConfigParam(row.param)) {
      return NextResponse.json({ error: "경로 거부" }, { status: 403 });
    }

    const meta = await getSourceMetaFromDbByParam(db, row.param);
    if (!meta) {
      return NextResponse.json({ error: "허용되지 않은 소스" }, { status: 403 });
    }

    if (!row.downloaded || !row.local_path.trim()) {
      return NextResponse.json(
        {
          error: "로컬 파일 없음",
          downloadUrl: row.download_url || undefined,
        },
        { status: 404 },
      );
    }

    const attachSlug = adminRulesAttachSlug(meta);
    let abs: string;
    try {
      abs = resolveAdminAttachmentPath(attachSlug, row.local_path);
    } catch {
      return NextResponse.json({ error: "경로 거부" }, { status: 403 });
    }

    if (!fs.existsSync(abs)) {
      return NextResponse.json(
        {
          error: "디스크에 파일이 없습니다.",
          downloadUrl: row.download_url || undefined,
        },
        { status: 404 },
      );
    }

    const buf = fs.readFileSync(abs);
    const contentType = guessContentType(
      row.file_name,
      row.file_type,
      row.mime_type,
    );
    const inlineDefault =
      contentType === "application/pdf" || contentType.startsWith("image/");
    const disposition =
      dispositionParam === "attachment"
        ? "attachment"
        : dispositionParam === "inline"
          ? "inline"
          : inlineDefault
            ? "inline"
            : "attachment";

    const asciiName = row.file_name.replace(/[^\x20-\x7E]/g, "_");
    const hdr = `${disposition}; filename*=UTF-8''${encodeURIComponent(row.file_name)}; filename="${asciiName}"`;

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": hdr,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } finally {
    await db.close();
  }
}
