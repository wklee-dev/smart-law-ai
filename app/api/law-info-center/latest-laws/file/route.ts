import {
  getLawInfoCenterAttachmentRow,
  openLawInfoCenterDb,
} from "@/app/lib/law-info-center-latest-server";
import {
  guessYestradeContentType,
  resolveYestradeLocalFile,
} from "@/app/lib/yestrade-sqlite";
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const u = new URL(req.url);
  const key = u.searchParams.get("key")?.trim() ?? "";
  const partId = u.searchParams.get("partId")?.trim() ?? "";
  if (!key || !partId) {
    return NextResponse.json(
      { ok: false, error: "key, partId 필요" },
      { status: 400 },
    );
  }

  const db = openLawInfoCenterDb();
  try {
    const row = getLawInfoCenterAttachmentRow(db, key, partId);
    if (!row?.local_path) {
      return NextResponse.json(
        { ok: false, error: "파일을 찾을 수 없습니다." },
        { status: 404 },
      );
    }
    let abs: string;
    try {
      abs = resolveYestradeLocalFile(row.local_path);
    } catch {
      return NextResponse.json({ ok: false, error: "경로 거부" }, { status: 403 });
    }
    if (!fs.existsSync(abs)) {
      return NextResponse.json(
        { ok: false, error: "디스크에 파일이 없습니다." },
        { status: 404 },
      );
    }
    const buf = fs.readFileSync(abs);
    const fileName = row.file_name || path.basename(abs);
    const encoded = encodeURIComponent(fileName).replace(/['()]/g, escape);
    const mime = guessYestradeContentType(fileName);
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(buf.length),
        "Content-Disposition": `inline; filename*=UTF-8''${encoded}`,
      },
    });
  } finally {
    db.close();
  }
}
