import "server-only";

import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  formatClipCustomsChiefHsSgn,
  normalizeClipCustomsChiefHsQuery,
} from "@/app/lib/clip-customs-chief-shared";
import {
  CLIP_PRIOR_TAX_TARGET_GOODS_GROUP_DEFS,
  type ClipPriorTaxTargetGoodsGroup,
  type ClipPriorTaxTargetGoodsQueryResult,
  type ClipPriorTaxTargetGoodsRow,
} from "@/app/lib/clip-prior-tax-target-goods-shared";
import { getSmartLawSqliteDbPath } from "@/app/lib/smart-law-sqlite-paths";

export {
  type ClipPriorTaxTargetGoodsGroup,
  type ClipPriorTaxTargetGoodsQueryResult,
  type ClipPriorTaxTargetGoodsRow,
} from "@/app/lib/clip-prior-tax-target-goods-shared";

const TABLE = "customs_preassess_target_goods";

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function hasTable(db: DatabaseSync, name: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(name) as { name: string } | undefined;
  return Boolean(row?.name);
}

export function openClipPriorTaxTargetGoodsDb(): DatabaseSync {
  const p = getSmartLawSqliteDbPath();
  if (!fs.existsSync(p)) {
    throw new Error(`DB 파일이 없습니다: ${p}`);
  }
  const db = new DatabaseSync(p, { readOnly: true });
  if (!hasTable(db, TABLE)) {
    db.close();
    throw new Error(
      `${TABLE} 테이블이 없습니다. crawl_target_goods.py 로 수집하세요.`,
    );
  }
  return db;
}

export function listClipPriorTaxTargetGoodsBaseDates(
  db: DatabaseSync,
): string[] {
  return db
    .prepare(
      `SELECT DISTINCT base_date FROM ${TABLE} ORDER BY base_date DESC`,
    )
    .all()
    .map((row) => str((row as Record<string, unknown>).base_date))
    .filter(Boolean);
}

function mapRow(row: Record<string, unknown>): ClipPriorTaxTargetGoodsRow {
  const hsCode = str(row.hs_code);
  return {
    hs_code: hsCode,
    hs_code_display: formatClipCustomsChiefHsSgn(hsCode, ""),
    item_name: str(row.item_name),
    applicable_start_date: str(row.applicable_start_date),
  };
}

export function queryClipPriorTaxTargetGoods(
  db: DatabaseSync,
  baseDate: string,
): ClipPriorTaxTargetGoodsQueryResult {
  const date = str(baseDate);
  if (!date) {
    return { base_date: "", groups: [], total: 0 };
  }

  const rows = db
    .prepare(
      `SELECT target_group_code, target_group_name, hs_code, item_name, applicable_start_date
       FROM ${TABLE}
       WHERE base_date = ?
       ORDER BY target_group_code ASC, hs_code ASC, item_name ASC`,
    )
    .all(date) as Record<string, unknown>[];

  const groupMap = new Map<string, ClipPriorTaxTargetGoodsGroup>();
  for (const row of rows) {
    const code = str(row.target_group_code);
    const name = str(row.target_group_name) || code;
    if (!groupMap.has(code)) {
      groupMap.set(code, {
        target_group_code: code,
        target_group_name: name,
        items: [],
      });
    }
    groupMap.get(code)!.items.push(mapRow(row));
  }

  const groups = CLIP_PRIOR_TAX_TARGET_GOODS_GROUP_DEFS.map((def) => {
    const existing = groupMap.get(def.target_group_code);
    return (
      existing ?? {
        target_group_code: def.target_group_code,
        target_group_name: def.target_group_name,
        items: [],
      }
    );
  });
  const total = rows.length;
  return { base_date: date, groups, total };
}

export function resolveDefaultClipPriorTaxTargetGoodsBaseDate(
  db: DatabaseSync,
): string {
  return listClipPriorTaxTargetGoodsBaseDates(db)[0] ?? "";
}

export function normalizeClipPriorTaxTargetGoodsHsFilter(
  raw: string | null | undefined,
): string {
  return normalizeClipCustomsChiefHsQuery(raw);
}
