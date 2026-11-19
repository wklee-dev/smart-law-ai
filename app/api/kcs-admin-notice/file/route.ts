import {
  getKcsAdminNoticeFile,
  openKcsAdminNoticeDb,
} from "@/app/lib/kcs-admin-notice-server";
import fs from "node:fs";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const attachId = Number(
    new URL(req.url).searchParams.get("attachId")?.trim() ?? "",
  );
  if (!Number.isFinite(attachId) || attachId <= 0) {
    return NextResponse.json(
      { ok: false, error: "attachId 필요" },
      { status: 400 },
    );
  }

  const db = openKcsAdminNoticeDb();
  try {
    const file = getKcsAdminNoticeFile(db, attachId);
    if (!file) {
      return NextResponse.json(
        { ok: false, error: "파일을 찾을 수 없습니다." },
        { status: 404 },
      );
    }
    const buf = fs.readFileSync(file.absolutePath);
    const encoded = encodeURIComponent(file.fileName).replace(
      /['()]/g,
      escape,
    );
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": file.contentType,
        "Content-Length": String(buf.length),
        "Content-Disposition": `attachment; filename*=UTF-8''${encoded}`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } finally {
    db.close();
  }
}
