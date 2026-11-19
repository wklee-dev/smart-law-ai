import {
  adminRulesAttachSlug,
  adminRulesUnifiedTableNames,
  fetchAdminRulesAttachmentRow,
  getSourceMetaFromDb,
  getSourceMetaFromDbByParam,
  isSafeRuleConfigParam,
  isSafeSqlIdentifier,
  openAdminRulesDb,
  resolveAdminRulesSourceFamily,
  tableExists,
} from "@/app/lib/admin-rules-server";
import { resolveAdminAttachmentPath } from "@/app/lib/admin-rules-paths";
import fs from "node:fs";
import { NextResponse } from "next/server";

function guessContentType(fileName: string, fileType: string): string {
  const n = fileName.toLowerCase();
  const t = fileType.toLowerCase();
  if (n.endsWith(".pdf") || t === "pdf") return "application/pdf";
  if (n.endsWith(".png") || t === "png") return "image/png";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg") || t === "jpg" || t === "jpeg")
    return "image/jpeg";
  if (n.endsWith(".gif")) return "image/gif";
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".hwpx")) {
    return "application/vnd.hancom.hwpx";
  }
  if (n.endsWith(".hwp")) {
    return "application/x-hwp";
  }
  return "application/octet-stream";
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const paramQ = url.searchParams.get("param")?.trim() ?? "";
  const tableName = url.searchParams.get("table")?.trim() ?? "";
  const flSeq = url.searchParams.get("flSeq")?.trim() ?? "";
  const dispositionParam = url.searchParams.get("disposition")?.trim();

  if (!paramQ && !tableName) {
    return NextResponse.json({ error: "param 또는 table 필요" }, { status: 400 });
  }
  if (paramQ && !isSafeRuleConfigParam(paramQ)) {
    return NextResponse.json({ error: "유효하지 않은 param" }, { status: 400 });
  }
  if (!paramQ && !isSafeSqlIdentifier(tableName)) {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  if (!/^\d+$/.test(flSeq)) {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const db = await openAdminRulesDb();
  try {
    const meta = paramQ
      ? await getSourceMetaFromDbByParam(db, paramQ)
      : await getSourceMetaFromDb(db, tableName);
    if (!meta) {
      return NextResponse.json({ error: "허용되지 않은 소스" }, { status: 403 });
    }
    const names = adminRulesUnifiedTableNames(
      await resolveAdminRulesSourceFamily(db, meta),
    );
    if (!(await tableExists(db, names.attachment))) {
      return NextResponse.json({ error: "첨부 테이블 없음" }, { status: 404 });
    }
    const row = await fetchAdminRulesAttachmentRow(db, meta, flSeq);
    if (!row?.local_path) {
      return NextResponse.json({ error: "파일 없음" }, { status: 404 });
    }

    const attachSlug = adminRulesAttachSlug(meta);
    if (!isSafeRuleConfigParam(attachSlug) && !isSafeSqlIdentifier(attachSlug)) {
      return NextResponse.json({ error: "경로 거부" }, { status: 403 });
    }

    let abs: string;
    try {
      abs = resolveAdminAttachmentPath(attachSlug, row.local_path);
    } catch {
      return NextResponse.json({ error: "경로 거부" }, { status: 403 });
    }

    if (!fs.existsSync(abs)) {
      return NextResponse.json(
        { error: "디스크에 파일이 없습니다.", path: abs },
        { status: 404 },
      );
    }

    const buf = fs.readFileSync(abs);
    const contentType = guessContentType(row.file_name, row.file_type);
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
