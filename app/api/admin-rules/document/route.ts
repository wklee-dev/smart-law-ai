import {
  adminRulesHasRenderableContent,
  adminRulesUnifiedTableNames,
  buildAdminRulesDocument,
  getSourceMetaFromDb,
  getSourceMetaFromDbByParam,
  isSafeRuleConfigParam,
  isSafeSqlIdentifier,
  openAdminRulesDb,
  resolveAdminRulesSourceFamily,
  tableExists,
} from "@/app/lib/admin-rules-server";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const paramQ = url.searchParams.get("param")?.trim() ?? "";
  const tableName = url.searchParams.get("table")?.trim() ?? "";

  if (!paramQ && !tableName) {
    return NextResponse.json(
      { ok: false, error: "param 또는 table 쿼리가 필요합니다." },
      { status: 400 },
    );
  }

  const db = await openAdminRulesDb();
  try {
    let meta;
    if (paramQ) {
      if (!isSafeRuleConfigParam(paramQ)) {
        return NextResponse.json(
          { ok: false, error: "유효하지 않은 param 입니다." },
          { status: 400 },
        );
      }
      meta = await getSourceMetaFromDbByParam(db, paramQ);
      if (!meta) {
        return NextResponse.json(
          { ok: false, error: "rule_master에 없는 param 입니다." },
          { status: 404 },
        );
      }
    } else {
      if (
        !isSafeSqlIdentifier(tableName) &&
        !isSafeRuleConfigParam(tableName)
      ) {
        return NextResponse.json(
          { ok: false, error: "유효하지 않은 table 파라미터입니다." },
          { status: 400 },
        );
      }
      meta = await getSourceMetaFromDb(db, tableName);
      if (!meta) {
        return NextResponse.json(
          { ok: false, error: "rule_master에 없는 table 입니다." },
          { status: 404 },
        );
      }
    }

    const names = adminRulesUnifiedTableNames(
      await resolveAdminRulesSourceFamily(db, meta),
    );
    if (!(await tableExists(db, names.main))) {
      return NextResponse.json(
        {
          ok: false,
          error: `통합 본문 테이블 "${names.main}" 이(가) DB에 없습니다.`,
        },
        { status: 404 },
      );
    }
    if (!(await adminRulesHasRenderableContent(db, meta))) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "rule_master에는 있으나 본문·부칙·별표 중 표시할 행이 없습니다. 크롤링을 실행하세요.",
        },
        { status: 404 },
      );
    }
    const document = await buildAdminRulesDocument(db, meta);
    return NextResponse.json({ ok: true, document });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "문서 로드 실패";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  } finally {
    await db.close();
  }
}
