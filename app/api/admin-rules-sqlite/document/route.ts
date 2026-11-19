import {
  crawlTargetToConfigSource,
  findCrawlTargetByParam,
  getAdminRulesCrawlTargets,
} from "@/app/lib/admin-rules-crawl-targets-server";
import { findAnnexSatelliteMatch } from "@/app/lib/admin-rules-annex-host-match";
import { openAdminRulesSqliteDb } from "@/app/lib/admin-rules-sqlite";
import {
  adminRulesHasRenderableContent,
  adminRulesUnifiedTableNames,
  buildAdminRulesDocument,
  buildAdminRulesSatelliteAnnexDocument,
  getSourceMetaFromDb,
  getSourceMetaFromDbByParam,
  isSafeRuleConfigParam,
  isSafeSqlIdentifier,
  resolveAdminRulesSourceFamily,
  tableExists,
} from "@/app/lib/admin-rules-server";
import type { AdminRulesConfigSource } from "@/app/lib/admin-rules-paths";
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

  const db = await openAdminRulesSqliteDb();
  try {
    let meta: AdminRulesConfigSource | undefined;
    if (paramQ) {
      if (!isSafeRuleConfigParam(paramQ)) {
        return NextResponse.json(
          { ok: false, error: "유효하지 않은 param 입니다." },
          { status: 400 },
        );
      }
      meta = await getSourceMetaFromDbByParam(db, paramQ);
      if (!meta) {
        const bundle = getAdminRulesCrawlTargets();
        const target = bundle
          ? findCrawlTargetByParam(bundle.targets, paramQ)
          : undefined;
        if (target) meta = crawlTargetToConfigSource(target);
      }
      if (!meta) {
        return NextResponse.json(
          { ok: false, error: "목록에 없는 param 입니다." },
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

    const imageBase = "/api/admin-rules-sqlite/article-image";

    if (!(await adminRulesHasRenderableContent(db, meta))) {
      const match = await findAnnexSatelliteMatch(db, meta.description ?? "");
      if (match) {
        const host = await getSourceMetaFromDbByParam(db, match.hostParam);
        if (host) {
          const document = await buildAdminRulesSatelliteAnnexDocument(
            db,
            meta,
            host,
            match.annexIds,
            { articleImageApiBase: imageBase },
          );
          return NextResponse.json({ ok: true, document });
        }
      }
      return NextResponse.json(
        {
          ok: false,
          error:
            "본문·부칙·별표에 해당 키의 행이 없고, 다른 규칙의 별표·서식과도 매칭되지 않았습니다.",
        },
        { status: 404 },
      );
    }

    const document = await buildAdminRulesDocument(db, meta, {
      articleImageApiBase: imageBase,
    });
    return NextResponse.json({ ok: true, document });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "문서 로드 실패";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  } finally {
    await db.close();
  }
}
