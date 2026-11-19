/**
 * law_source_catalog — Open API(lawSearch)로 법령ID/행정규칙일련번호 조회 후 DB 반영
 */
import "server-only";

import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { getLawSourceCatalogDbPath } from "@/app/lib/law-source-catalog-server";
import { normalizeLawIdForStorage } from "@/app/shared/law-id";

const TABLE = "law_source_catalog";

export type CatalogFetchIdItemResult = {
  gubun: number;
  lawName: string;
  urlType: string;
  ok: boolean;
  lawId?: string;
  error?: string;
  requestedUrl?: string;
};

export type CatalogFetchIdsResult = {
  ok: boolean;
  processed: number;
  updated: number;
  skipped: number;
  failed: number;
  items: CatalogFetchIdItemResult[];
};

function stripAbbr(name: string): string {
  return name.replace(/\([^)]*\)\s*$/u, "").trim();
}

function normName(s: string): string {
  return String(s || "")
    .replace(/[ㆍ·]/g, "·")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function openWritable(): DatabaseSync {
  const p = getLawSourceCatalogDbPath();
  if (!fs.existsSync(p)) {
    throw new Error(`DB 파일이 없습니다: ${p}`);
  }
  return new DatabaseSync(p);
}

function lawSearchBaseUrl(): string {
  const raw =
    process.env.LAW_JSONSERVICE_URL?.trim() ||
    process.env.LAW_XMLSERVICE_URL?.trim() ||
    "http://www.law.go.kr/DRF/lawSearch.do";
  try {
    const u = new URL(raw.replace(/lawService\.do$/i, "lawSearch.do"));
    if (u.hostname === "www.law.go.kr") u.hostname = "law.go.kr";
    return u.toString();
  } catch {
    return "http://www.law.go.kr/DRF/lawSearch.do";
  }
}

function lawApiOc(): string {
  const oc =
    process.env.LAW_API_OC?.trim() || process.env.LAW_OC?.trim() || "";
  if (!oc) throw new Error(".env 에 LAW_API_OC 가 없습니다.");
  return oc;
}

type SearchHit = { id: string; name: string; status: string };

function pickRows(parsed: Record<string, unknown>, urlType: string): SearchHit[] {
  if (urlType === "adm_rule") {
    const root = (parsed.AdmRulSearch ||
      parsed.AdmrulSearch ||
      parsed) as Record<string, unknown>;
    let rows = root.admrul ?? root.admRul ?? root.AdmRul ?? [];
    if (!Array.isArray(rows)) rows = rows ? [rows] : [];
    return (rows as Record<string, unknown>[]).map((r) => ({
      id: String(
        r.행정규칙일련번호 ?? r.admRulSeq ?? r.admrulId ?? r.법령일련번호 ?? "",
      ).trim(),
      name: String(
        r.행정규칙명 ?? r.admRulNm ?? r.법령명한글 ?? r.법령명 ?? "",
      ).trim(),
      status: String(r.현행연혁구분 ?? r.현행연혁코드 ?? "").trim(),
    }));
  }

  const root = (parsed.LawSearch || parsed) as Record<string, unknown>;
  let rows = root.law ?? root.Law ?? [];
  if (!Array.isArray(rows)) rows = rows ? [rows] : [];
  return (rows as Record<string, unknown>[]).map((r) => ({
    id: normalizeLawIdForStorage(
      String(r.법령ID ?? r.lawId ?? r.법령일련번호 ?? ""),
    ),
    name: String(r.법령명한글 ?? r.법령명 ?? r.lawName ?? "").trim(),
    status: String(r.현행연혁코드 ?? r.현행연혁구분 ?? "").trim(),
  }));
}

function pickBestHit(hits: SearchHit[], queryName: string): SearchHit | null {
  if (hits.length === 0) return null;
  const q = normName(stripAbbr(queryName));
  const exact = hits.find((h) => normName(stripAbbr(h.name)) === q);
  if (exact?.id) return exact;
  const current = hits.find(
    (h) => h.status === "현행" && h.id && normName(stripAbbr(h.name)).includes(q),
  );
  if (current) return current;
  const partial = hits.find(
    (h) =>
      h.id &&
      (normName(stripAbbr(h.name)).includes(q) ||
        q.includes(normName(stripAbbr(h.name)))),
  );
  if (partial) return partial;
  return hits.find((h) => h.id) ?? null;
}

async function searchOpenApi(
  urlType: string,
  lawName: string,
): Promise<{ hit: SearchHit | null; requestedUrl: string; error?: string }> {
  const oc = lawApiOc();
  const target = urlType === "adm_rule" ? "admrul" : "law";
  const query = stripAbbr(lawName) || lawName.trim();
  const url = new URL(lawSearchBaseUrl());
  url.searchParams.set("OC", oc);
  url.searchParams.set("target", target);
  url.searchParams.set("type", "JSON");
  url.searchParams.set("query", query);
  url.searchParams.set("display", "20");
  if (urlType === "adm_rule") url.searchParams.set("search", "1");

  const requestedUrl = url.toString();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(requestedUrl, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return {
        hit: null,
        requestedUrl,
        error: `API 응답이 JSON이 아닙니다 (${res.status})`,
      };
    }
    const hits = pickRows(parsed, urlType);
    const hit = pickBestHit(hits, lawName);
    if (!hit) {
      return { hit: null, requestedUrl, error: "검색 결과 없음" };
    }
    return { hit, requestedUrl };
  } catch (e) {
    return {
      hit: null,
      requestedUrl,
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchAndSaveLawSourceCatalogIds(opts: {
  gubuns?: number[];
  onlyMissing?: boolean;
  urlType?: string;
  limit?: number;
  delayMs?: number;
}): Promise<CatalogFetchIdsResult> {
  const onlyMissing = opts.onlyMissing !== false;
  const delayMs = opts.delayMs ?? 300;
  const limit = Math.min(500, Math.max(1, opts.limit ?? 200));
  const gubuns = opts.gubuns?.filter((n) => Number.isFinite(n)) ?? [];

  const db = openWritable();
  try {
    const where: string[] = [];
    const params: unknown[] = [];

    if (gubuns.length > 0) {
      where.push(`gubun IN (${gubuns.map(() => "?").join(",")})`);
      params.push(...gubuns);
    }
    if (opts.urlType?.trim()) {
      where.push("url_type = ?");
      params.push(opts.urlType.trim());
    }
    if (onlyMissing && gubuns.length === 0) {
      where.push("(law_id IS NULL OR TRIM(CAST(law_id AS TEXT)) = '')");
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const rows = db
      .prepare(
        `SELECT gubun, law_name, law_id, url_type
         FROM ${TABLE}
         ${whereSql}
         ORDER BY gubun ASC
         LIMIT ?`,
      )
      .all(...params, limit) as {
      gubun: number;
      law_name: string;
      law_id: string | null;
      url_type: string;
    }[];

    const items: CatalogFetchIdItemResult[] = [];
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    const now = new Date().toISOString().replace("T", " ").slice(0, 19);

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i]!;
      const existing = String(row.law_id ?? "").trim();
      if (onlyMissing && existing && gubuns.length === 0) {
        skipped += 1;
        items.push({
          gubun: row.gubun,
          lawName: row.law_name,
          urlType: row.url_type,
          ok: true,
          lawId: existing,
          error: "이미 법령ID 있음(스킵)",
        });
        continue;
      }

      const { hit, requestedUrl, error } = await searchOpenApi(
        row.url_type,
        row.law_name,
      );
      if (!hit?.id) {
        failed += 1;
        items.push({
          gubun: row.gubun,
          lawName: row.law_name,
          urlType: row.url_type,
          ok: false,
          error: error || "ID 없음",
          requestedUrl,
        });
      } else {
        db.prepare(
          `UPDATE ${TABLE}
           SET law_id = ?, updated_at = ?
           WHERE gubun = ?`,
        ).run(hit.id, now, row.gubun);
        updated += 1;
        items.push({
          gubun: row.gubun,
          lawName: row.law_name,
          urlType: row.url_type,
          ok: true,
          lawId: hit.id,
          requestedUrl,
        });
      }

      if (i < rows.length - 1) await sleep(delayMs);
    }

    return {
      ok: failed === 0,
      processed: rows.length,
      updated,
      skipped,
      failed,
      items,
    };
  } finally {
    db.close();
  }
}

export function countMissingLawSourceCatalogIds(urlType?: string): number {
  const db = openWritable();
  try {
    if (urlType?.trim()) {
      const row = db
        .prepare(
          `SELECT COUNT(*) AS n FROM ${TABLE}
           WHERE url_type = ?
             AND (law_id IS NULL OR TRIM(CAST(law_id AS TEXT)) = '')`,
        )
        .get(urlType.trim()) as { n: number };
      return Number(row?.n) || 0;
    }
    const row = db
      .prepare(
        `SELECT COUNT(*) AS n FROM ${TABLE}
         WHERE law_id IS NULL OR TRIM(CAST(law_id AS TEXT)) = ''`,
      )
      .get() as { n: number };
    return Number(row?.n) || 0;
  } finally {
    db.close();
  }
}
