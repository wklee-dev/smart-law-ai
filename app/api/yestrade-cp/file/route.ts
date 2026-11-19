import { getYcpFileRow, openYcpDb } from "@/app/lib/yestrade-cp-server";
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
  const kind = u.searchParams.get("kind")?.trim() as
    | "attachment"
    | "image"
    | "postFile"
    | null;
  const id = Number(u.searchParams.get("id") ?? "0");
  if (kind !== "attachment" && kind !== "image" && kind !== "postFile") {
    return NextResponse.json(
      { ok: false, error: "kind=attachment|image|postFile" },
      { status: 400 },
    );
  }
  if (!id) {
    return NextResponse.json({ ok: false, error: "id 필요" }, { status: 400 });
  }

  const db = openYcpDb();
  try {
    const row = getYcpFileRow(db, kind, id);
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
    const ctype =
      row.content_type.trim() || guessYestradeContentType(fileName);
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": ctype,
        "Content-Length": String(buf.length),
        "Content-Disposition": `inline; filename*=UTF-8''${encoded}`,
      },
    });
  } finally {
    db.close();
  }
}
