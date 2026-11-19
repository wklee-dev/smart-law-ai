import { NextRequest, NextResponse } from "next/server";
import {
  listAdmrulAnnexesFromSqlite,
  listAdmrulArticlesFromSqlite,
  listLawAnnexesFromSqlite,
  listRelatedAdmrulLinksFromSqlite,
} from "@/app/lib/smart-law-sqlite-server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const lawVersionId = Number(searchParams.get("lawVersionId") || "");
    const lawId = (searchParams.get("lawId") || "").trim();
    const snapshotId = Number(searchParams.get("admrulSnapshotId") || "");
    const admSerialId = (searchParams.get("admSerialId") || "").trim();

    if (Number.isFinite(snapshotId) && snapshotId > 0) {
      const articles = await listAdmrulArticlesFromSqlite(snapshotId);
      const annexes = admSerialId
        ? await listAdmrulAnnexesFromSqlite(admSerialId)
        : [];
      return NextResponse.json({ ok: true, articles, annexes, related: [] });
    }

    if (!Number.isFinite(lawVersionId) || lawVersionId <= 0) {
      return NextResponse.json(
        { ok: false, error: "lawVersionId 또는 admrulSnapshotId가 필요합니다." },
        { status: 400 },
      );
    }

    const annexes = await listLawAnnexesFromSqlite(lawVersionId);
    const related = lawId ? await listRelatedAdmrulLinksFromSqlite(lawId) : [];
    return NextResponse.json({ ok: true, annexes, related, articles: [] });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "별표·관련 행정규칙 조회 중 오류가 발생했습니다.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
