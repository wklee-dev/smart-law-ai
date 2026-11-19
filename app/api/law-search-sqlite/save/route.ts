import { NextRequest, NextResponse } from "next/server";
import {
  saveLawSearchToSqlite,
  type LawSearchListItem,
  type LawSearchMeta,
} from "@/app/lib/smart-law-sqlite-save";

export const runtime = "nodejs";

type SaveRequestBody = {
  searchMeta: LawSearchMeta;
  items: LawSearchListItem[];
  rawXml: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SaveRequestBody;

    if (!body.searchMeta) {
      return NextResponse.json(
        { ok: false, error: "searchMeta가 필요합니다." },
        { status: 400 },
      );
    }

    if (!Array.isArray(body.items)) {
      return NextResponse.json(
        { ok: false, error: "items 배열이 필요합니다." },
        { status: 400 },
      );
    }

    const result = saveLawSearchToSqlite({
      searchMeta: body.searchMeta,
      items: body.items,
      rawXml: body.rawXml,
    });

    return NextResponse.json({
      ok: true,
      searchHistoryId: result.searchHistoryId,
      savedCount: result.savedCount,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "SQLite 검색 결과 저장 중 오류가 발생했습니다.";

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
