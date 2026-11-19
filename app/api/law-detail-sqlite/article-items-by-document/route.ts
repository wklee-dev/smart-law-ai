import { NextRequest, NextResponse } from "next/server";
import { listLawArticleItemsByVersionFromSqlite } from "@/app/lib/smart-law-sqlite-server";

export const runtime = "nodejs";

function parseLawVersionId(request: NextRequest): number | null {
  const u = request.nextUrl;
  const v =
    u.searchParams.get("lawVersionId") ?? u.searchParams.get("lawDocumentId");
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(request: NextRequest) {
  try {
    const lawVersionId = parseLawVersionId(request);
    if (!lawVersionId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "lawVersionId(또는 하위 호환 lawDocumentId) 쿼리 파라미터가 필요합니다.",
        },
        { status: 400 },
      );
    }

    const items = await listLawArticleItemsByVersionFromSqlite(lawVersionId);
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "항/호/목 조회 중 오류가 발생했습니다.";

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
