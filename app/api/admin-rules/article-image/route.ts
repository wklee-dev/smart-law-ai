import {
  isSafeRuleConfigParam,
  openAdminRulesDb,
  readArticleImageBlobForParam,
} from "@/app/lib/admin-rules-server";
import { NextResponse } from "next/server";

/** `article_image.image_data` BYTEA 반환 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const param = url.searchParams.get("param")?.trim() ?? "";
  const flSeq = url.searchParams.get("flSeq")?.trim() ?? "";

  if (!param || !flSeq) {
    return NextResponse.json(
      { ok: false, error: "param·flSeq 쿼리가 필요합니다." },
      { status: 400 },
    );
  }
  if (!isSafeRuleConfigParam(param)) {
    return NextResponse.json(
      { ok: false, error: "유효하지 않은 param 입니다." },
      { status: 400 },
    );
  }
  if (!/^\d+$/.test(flSeq)) {
    return NextResponse.json(
      { ok: false, error: "유효하지 않은 flSeq 입니다." },
      { status: 400 },
    );
  }

  const db = await openAdminRulesDb();
  try {
    const got = await readArticleImageBlobForParam(db, param, flSeq);
    if (!got) {
      return NextResponse.json(
        { ok: false, error: "조문 이미지를 찾을 수 없습니다." },
        { status: 404 },
      );
    }
    return new NextResponse(new Uint8Array(got.buf), {
      status: 200,
      headers: {
        "Content-Type": got.mimeType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "이미지 로드 실패";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  } finally {
    await db.close();
  }
}
