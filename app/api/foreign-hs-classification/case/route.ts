import {
  getForeignCaseBySrno,
  listForeignCaseImagesBySrno,
  openForeignHsCaseDb,
  resolveForeignCaseImageLocalFile,
} from "@/app/lib/foreign-hs-case-server";
import { getForeignHsCaseAttachRoot } from "@/app/lib/foreign-hs-case-paths";
import { NextResponse } from "next/server";

type ImageOut = {
  id: number;
  case_srno: string;
  seq: number;
  image_url: string | null;
  /** 브라우저에서 바로 쓸 주소(로컬 우선, 없으면 원본 URL) */
  display_src: string | null;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const srno = url.searchParams.get("srno")?.trim() ?? "";
  if (!srno) {
    return NextResponse.json(
      { ok: false, error: "유효한 srno(일련번호)가 필요합니다." },
      { status: 400 },
    );
  }

  try {
    const db = openForeignHsCaseDb();
    try {
      const record = getForeignCaseBySrno(db, srno);
      if (!record) {
        return NextResponse.json(
          { ok: false, error: "해당 사례가 없습니다." },
          { status: 404 },
        );
      }

      const imageCount = Math.max(
        0,
        Math.floor(Number(record.image_count ?? 0)),
      );
      const attachRoot = getForeignHsCaseAttachRoot();
      const imgs =
        imageCount > 0 ? listForeignCaseImagesBySrno(db, srno) : [];
      const images: ImageOut[] = imgs.map((im) => {
        const localOk = resolveForeignCaseImageLocalFile(im.local_path, attachRoot);
        let displaySrc: string | null = null;
        if (localOk) {
          displaySrc =
            `/api/foreign-hs-classification/image?imageId=${encodeURIComponent(String(im.id))}&srno=${encodeURIComponent(srno)}`;
        } else if (im.image_url?.trim()) {
          displaySrc = im.image_url.trim();
        }
        return {
          id: im.id,
          case_srno: im.case_srno,
          seq: im.seq,
          image_url: im.image_url?.trim() ? im.image_url.trim() : null,
          display_src: displaySrc,
        };
      });

      return NextResponse.json({
        ok: true,
        srno,
        record,
        images,
      });
    } finally {
      db.close();
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
