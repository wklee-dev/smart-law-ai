import "server-only";

import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  CLIP_WORLD_HS_REVISION_VERSION_PAIRS,
  type ClipWorldHsRevisionListRow,
  type ClipWorldHsRevisionQueryParams,
  type ClipWorldHsRevisionVersionOption,
} from "@/app/lib/clip-world-hs-revision-shared";
import { getSmartLawSqliteDbPath } from "@/app/lib/smart-law-sqlite-paths";

export {
  CLIP_WORLD_HS_REVISION_VERSION_PAIRS,
  type ClipWorldHsRevisionListRow,
  type ClipWorldHsRevisionQueryParams,
  type ClipWorldHsRevisionVersionOption,
} from "@/app/lib/clip-world-hs-revision-shared";

const TABLE = "world_hs_revision";

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function hasTable(db: DatabaseSync, name: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(name) as { name: string } | undefined;
  return Boolean(row?.name);
}

export function openClipWorldHsRevisionDb(): DatabaseSync {
  const p = getSmartLawSqliteDbPath();
  if (!fs.existsSync(p)) {
    throw new Error(`DB 파일이 없습니다: ${p}`);
  }
  return new DatabaseSync(p, { readOnly: true });
}

export function worldHsRevisionTableReady(db: DatabaseSync): boolean {
  return hasTable(db, TABLE);
}

function normalizeHsFilter(raw: string | null | undefined): string {
  return str(raw).replace(/[.\s]/g, "");
}

function mapListRow(row: Record<string, unknown>): ClipWorldHsRevisionListRow {
  return {
    id: num(row.revision_id),
    before_hs_code: str(row.before_hs_code),
    after_hs_code: str(row.after_hs_code),
    description_en: str(row.description_en),
    description_ko: str(row.description_ko),
    base_version_year: num(row.base_version_year),
    revised_version_year: num(row.revised_version_year),
    version_pair: str(row.version_pair),
  };
}

export function listClipWorldHsRevisionVersions(
  db: DatabaseSync,
): ClipWorldHsRevisionVersionOption[] {
  if (!worldHsRevisionTableReady(db)) {
    return CLIP_WORLD_HS_REVISION_VERSION_PAIRS.map((pair) => ({
      value: pair.value,
      label: pair.value,
      baseYear: pair.baseYear,
      revisedYear: pair.revisedYear,
    }));
  }

  const counts = new Map<string, number>();
  const rows = db
    .prepare(
      `SELECT version_pair, base_version_year, revised_version_year, COUNT(*) AS n
       FROM ${TABLE}
       GROUP BY version_pair, base_version_year, revised_version_year
       ORDER BY base_version_year DESC`,
    )
    .all() as Record<string, unknown>[];

  for (const row of rows) {
    counts.set(str(row.version_pair), num(row.n));
  }

  if (rows.length === 0) {
    return CLIP_WORLD_HS_REVISION_VERSION_PAIRS.map((pair) => ({
      value: pair.value,
      label: pair.value,
      baseYear: pair.baseYear,
      revisedYear: pair.revisedYear,
      count: 0,
    }));
  }

  return rows.map((row) => ({
    value: str(row.version_pair),
    label: str(row.version_pair),
    baseYear: num(row.base_version_year),
    revisedYear: num(row.revised_version_year),
    count: num(row.n),
  }));
}

export function resolveDefaultClipWorldHsRevisionVersionPair(
  versions: ClipWorldHsRevisionVersionOption[],
): string {
  return (
    versions.find((v) => (v.count ?? 0) > 0)?.value ??
    versions[0]?.value ??
    CLIP_WORLD_HS_REVISION_VERSION_PAIRS[0].value
  );
}

export function queryClipWorldHsRevisions(
  db: DatabaseSync,
  params: ClipWorldHsRevisionQueryParams,
): { rows: ClipWorldHsRevisionListRow[]; total: number } {
  if (!worldHsRevisionTableReady(db)) {
    return { rows: [], total: 0 };
  }

  const page = Math.max(1, Math.floor(params.page) || 1);
  const pageSize = Math.min(100, Math.max(5, Math.floor(params.pageSize) || 10));
  const versionPair = str(params.versionPair);
  if (!versionPair) {
    return { rows: [], total: 0 };
  }

  const hs = normalizeHsFilter(params.hsCode);
  const desc = str(params.description);

  const where: string[] = ["version_pair = ?"];
  const bind: unknown[] = [versionPair];

  if (hs) {
    where.push(
      "(REPLACE(REPLACE(IFNULL(before_hs_code,''), '.', ''), ' ', '') LIKE ? OR REPLACE(REPLACE(IFNULL(after_hs_code,''), '.', ''), ' ', '') LIKE ?)",
    );
    const like = `%${hs}%`;
    bind.push(like, like);
  }
  if (desc) {
    where.push("(description_ko LIKE ? OR description_en LIKE ?)");
    const like = `%${desc}%`;
    bind.push(like, like);
  }

  const whereSql = `WHERE ${where.join(" AND ")}`;
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS n FROM ${TABLE} ${whereSql}`)
    .get(...bind) as { n: number };
  const total = num(totalRow?.n);

  const rows = db
    .prepare(
      `SELECT revision_id, before_hs_code, after_hs_code, description_en, description_ko,
              base_version_year, revised_version_year, version_pair
       FROM ${TABLE}
       ${whereSql}
       ORDER BY revision_id ASC
       LIMIT ? OFFSET ?`,
    )
    .all(...bind, pageSize, (page - 1) * pageSize)
    .map((row) => mapListRow(row as Record<string, unknown>));

  return { rows, total };
}
