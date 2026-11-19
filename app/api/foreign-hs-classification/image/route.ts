import {
  openForeignHsCaseDb,
  readForeignCaseImageFileForSrno,
} from "@/app/lib/foreign-hs-case-server";
import { NextResponse } from "next/server";

function parseIntParam(
  searchParams: URLSearchParams,
  key: string,
): number | undefined {
  const raw = searchParams.get(key)?.trim() ?? "";
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) return undefined;
  return n;
}

/** `case_images` 로컬 파일(`local_path`)만 반환 — 원격 URL은 case API의 `display_src` 사용 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const imageId = parseIntParam(url.searchParams, "imageId");
  const srno = url.searchParams.get("srno")?.trim() ?? "";
  if (imageId === undefined || !srno) {
    return NextResponse.json(
      { ok: false, error: "imageId·srno 쿼리가 필요합니다." },
      { status: 400 },
    );
  }

  try {
    const db = openForeignHsCaseDb();
    try {
      const got = readForeignCaseImageFileForSrno(db, imageId, srno);
      if (!got) {
        return NextResponse.json(
          { ok: false, error: "이미지를 찾을 수 없습니다." },
          { status: 404 },
        );
      }
      return new NextResponse(new Uint8Array(got.buf), {
        status: 200,
        headers: {
          "Content-Type": got.contentType,
          "Cache-Control": "private, max-age=3600",
        },
      });
    } finally {
      db.close();
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
