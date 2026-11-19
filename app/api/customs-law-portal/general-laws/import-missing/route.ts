import { NextResponse } from "next/server";
import { importMissingGeneralLawsFromAlternateDb } from "@/app/lib/clip-general-law-import-server";
import { parseGeneralLawPortalCategory } from "@/app/shared/general-law-portal-categories";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      category?: string;
      sourceDbPath?: string;
      lawIds?: string[];
    };
    const slug = parseGeneralLawPortalCategory(body.category ?? "all");
    const result = importMissingGeneralLawsFromAlternateDb({
      categorySlug: slug,
      sourceDbPath: body.sourceDbPath,
      lawIds: body.lawIds,
    });
    return NextResponse.json({
      ...result,
      ok: result.ok || result.imported > 0,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "법령 포함 처리 중 오류";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
