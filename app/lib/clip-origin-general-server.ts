import "server-only";

import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { rewriteClipPortalHtml } from "@/app/lib/clip-imex-notice-server";
import type {
  ClipOriginGeneralSectionDetail,
  ClipOriginGeneralSectionRow,
} from "@/app/lib/clip-origin-general-shared";
import { getSmartLawSqliteDbPath } from "@/app/lib/smart-law-sqlite-paths";

export {
  type ClipOriginGeneralSectionDetail,
  type ClipOriginGeneralSectionRow,
} from "@/app/lib/clip-origin-general-shared";

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : 0;
}

function hasTable(db: DatabaseSync, name: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(name) as { name: string } | undefined;
  return Boolean(row?.name);
}

export function openClipOriginGeneralDb(): DatabaseSync {
  const p = getSmartLawSqliteDbPath();
  if (!fs.existsSync(p)) {
    throw new Error(`DB 파일이 없습니다: ${p}`);
  }
  const db = new DatabaseSync(p, { readOnly: true });
  if (!hasTable(db, "origin_general_sections")) {
    db.close();
    throw new Error(
      "origin_general_sections 테이블이 없습니다. origin_crawler.py --mode general 로 수집하세요.",
    );
  }
  return db;
}

export function listClipOriginGeneralSections(
  db: DatabaseSync,
): ClipOriginGeneralSectionRow[] {
  return db
    .prepare(
      `SELECT section_key, section_name, display_order
       FROM origin_general_sections
       ORDER BY display_order ASC, section_key ASC`,
    )
    .all()
    .map((row) => {
      const r = row as Record<string, unknown>;
      return {
        section_key: str(r.section_key),
        section_name: str(r.section_name),
        display_order: num(r.display_order),
      };
    });
}

export function getClipOriginGeneralSection(
  db: DatabaseSync,
  sectionKey: string,
): ClipOriginGeneralSectionDetail | null {
  const key = str(sectionKey);
  if (!key) return null;
  const row = db
    .prepare(
      `SELECT section_key, section_name, display_order, body_text, body_html, source_url
       FROM origin_general_sections
       WHERE section_key = ?`,
    )
    .get(key) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    section_key: str(row.section_key),
    section_name: str(row.section_name),
    display_order: num(row.display_order),
    body_text: str(row.body_text),
    body_html: rewriteClipPortalHtml(str(row.body_html)),
    source_url: str(row.source_url),
  };
}
