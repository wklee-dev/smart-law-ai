import {
  getCaseImageBlobForCase,
  openDomesticHsClassDb,
  parseDomesticHsSince2006,
} from "@/app/lib/domestic-hs-class-server";
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

/** `case_images` BLOB 제공 — `caseId` 로 소유 사건 검증 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const imageRowId = parseIntParam(url.searchParams, "imageId");
  const caseRowId = parseIntParam(url.searchParams, "caseId");
  if (imageRowId === undefined || caseRowId === undefined) {
    return NextResponse.json(
      { ok: false, error: "imageId·caseId 쿼리가 필요합니다." },
      { status: 400 },
    );
  }

  try {
    const since2006 = parseDomesticHsSince2006(
      url.searchParams.get("since2006"),
    );
    const db = openDomesticHsClassDb({ since2006 });
    try {
      const got = getCaseImageBlobForCase(db, imageRowId, caseRowId);
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
