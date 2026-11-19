import {
  getFtaOriginCertificateFormFile,
  openFtaOriginCertificateFormDb,
} from "@/app/lib/fta-origin-certificate-form-server";
import fs from "node:fs";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const u = new URL(req.url);
  const id = Number(u.searchParams.get("id") ?? "0");
  const disposition =
    u.searchParams.get("disposition") === "attachment"
      ? "attachment"
      : "inline";

  if (!id) {
    return NextResponse.json({ ok: false, error: "id 필요" }, { status: 400 });
  }

  const db = openFtaOriginCertificateFormDb();
  try {
    const file = getFtaOriginCertificateFormFile(db, id);
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
        "Content-Disposition": `${disposition}; filename*=UTF-8''${encoded}`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } finally {
    db.close();
  }
}
