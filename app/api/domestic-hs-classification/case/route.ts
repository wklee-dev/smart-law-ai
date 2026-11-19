import {
  getClassificationCaseById,
  listCaseImagesMeta,
  openDomesticHsClassDb,
  parseDomesticHsSince2006,
} from "@/app/lib/domestic-hs-class-server";
import { NextResponse } from "next/server";

function parseCaseId(searchParams: URLSearchParams): number | undefined {
  const raw = searchParams.get("caseId")?.trim() ?? "";
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) return undefined;
  return n;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const caseId = parseCaseId(url.searchParams);
  if (caseId === undefined) {
    return NextResponse.json(
      { ok: false, error: "유효한 caseId 쿼리가 필요합니다." },
      { status: 400 },
    );
  }

  try {
    const since2006 = parseDomesticHsSince2006(
      url.searchParams.get("since2006"),
    );
    const db = openDomesticHsClassDb({ since2006 });
    try {
      const record = getClassificationCaseById(db, caseId);
      if (!record) {
        return NextResponse.json(
          { ok: false, error: "해당 사례가 없습니다." },
          { status: 404 },
        );
      }
      const images = listCaseImagesMeta(db, caseId);

      /** 상세 패널·이미지 URL 구성용 (바이너리는 이미지 API로) */
      const imagesLite = images.map((im) => ({
        id: im.id,
        image_seq: im.image_seq,
        attch_file_id: im.attch_file_id,
        content_type: im.content_type,
        image_size: im.image_size,
        download_status: im.download_status,
        error_msg: im.error_msg,
        has_blob:
          im.download_status === "success",
      }));

      return NextResponse.json({
        ok: true,
        caseId,
        record,
        images: imagesLite,
      });
    } finally {
      db.close();
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
