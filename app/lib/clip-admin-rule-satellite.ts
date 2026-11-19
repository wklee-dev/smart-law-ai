import "server-only";

import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { ClipSatelliteUiRow } from "@/app/lib/clip-admin-rule-shared";
import { formatClipIssueDate } from "@/app/lib/clip-admin-rule-shared";
import { getClipAdminRuleAttachRoot } from "@/app/lib/clip-admin-rule-paths";

export type { ClipSatelliteUiRow } from "@/app/lib/clip-admin-rule-shared";

export type ClipSatelliteKind = "annex" | "attachment";

const ANNEX_TABLE = "clip_ar_annex";
const ATTACHMENT_TABLE = "clip_ar_attachment";

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function stmtAll(
  db: DatabaseSync,
  sql: string,
  params: unknown[] = [],
): Record<string, unknown>[] {
  const st = db.prepare(sql);
  return (st.all(...params) as Record<string, unknown>[]) ?? [];
}

function stmtGet(
  db: DatabaseSync,
  sql: string,
  params: unknown[] = [],
): Record<string, unknown> | undefined {
  const st = db.prepare(sql);
  return st.get(...params) as Record<string, unknown> | undefined;
}

export function clipTableExists(db: DatabaseSync, table: string): boolean {
  const st = db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1",
  );
  return st.get(table) !== undefined;
}

function annexTypeLabel(code: string): string {
  const c = code.trim();
  if (c === "01") return "별표";
  if (c === "02") return "서식";
  return c;
}

export function buildClipServeUrl(
  ruleId: string,
  kind: ClipSatelliteKind,
  recordId: string,
  variant: "pdf" | "hwp" | "file",
): string {
  const u = new URLSearchParams({
    ruleId,
    kind,
    id: recordId,
    variant,
  });
  return `/api/clip-admin-rule/serve?${u}`;
}

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".hwp": "application/x-hwp",
  ".hwpx": "application/hwpx+json",
};

function extOf(p: string): string {
  const m = /\.([^.\\/]+)$/i.exec(p.trim());
  return m ? `.${m[1]!.toLowerCase()}` : "";
}

/** attach 루트 아래 또는 절대 경로(+루트 내부)만 허용 */
export function clipResolveServePath(storedRaw: string): string | null {
  const attachRoot = path.resolve(getClipAdminRuleAttachRoot().trim());
  const raw = storedRaw.trim().replaceAll("\\", "/");
  if (!raw) return null;

  const candidatesAbs: string[] = [];
  if (path.isAbsolute(raw)) {
    candidatesAbs.push(path.resolve(raw.replaceAll("/", path.sep)));
  }
  candidatesAbs.push(
    path.resolve(attachRoot, raw.replace(/^[/\\]+/, "").replaceAll("/", path.sep)),
  );
  candidatesAbs.push(
    path.resolve(
      attachRoot,
      "ATTACH",
      raw.replace(/^[/\\]+/, "").replaceAll("/", path.sep),
    ),
  );

  const seen = new Set<string>();
  for (let abs of candidatesAbs) {
    abs = path.resolve(abs);
    if (seen.has(abs)) continue;
    seen.add(abs);
    try {
      if (!abs.toLowerCase().startsWith(attachRoot.toLowerCase())) continue;
    } catch {
      continue;
    }
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs;
  }
  return null;
}

export function mimeForPath(absPath: string): string {
  return MIME[extOf(absPath)] ?? "application/octet-stream";
}

export function dispositionFilename(absPath: string): string {
  return path.basename(absPath);
}

function annexRowsByRule(
  db: DatabaseSync,
  ruleId: string,
): Record<string, unknown>[] {
  if (!clipTableExists(db, ANNEX_TABLE)) return [];
  const id = ruleId.trim();
  if (!id) return [];
  return stmtAll(
    db,
    `SELECT annex_id, rule_id, rule_name, srno, title, annex_type, enfrDt,
            hwp_file_id, hwp_file_name, pdf_file_id, pdf_file_name,
            hwp_local_path, pdf_local_path, gubun
       FROM ${ANNEX_TABLE}
      WHERE rule_id = ?
      ORDER BY CAST(IFNULL(srno,'0') AS INTEGER), annex_id`,
    [id],
  );
}

function attachmentRowsByRule(
  db: DatabaseSync,
  ruleId: string,
): Record<string, unknown>[] {
  if (!clipTableExists(db, ATTACHMENT_TABLE)) return [];
  const id = ruleId.trim();
  if (!id) return [];
  return stmtAll(
    db,
    `SELECT attach_id, rule_id, rule_name, srno, file_name, lnk_url, local_path, gubun
       FROM ${ATTACHMENT_TABLE}
      WHERE rule_id = ?
      ORDER BY CAST(IFNULL(srno,'0') AS INTEGER), attach_id`,
    [id],
  );
}

function annexUiRow(ruleId: string, row: Record<string, unknown>): ClipSatelliteUiRow {
  const recordId = str(row.annex_id);
  const title = str(row.title) || str(row.rule_name) || "(이름 없음)";
  const srno = str(row.srno);
  const typeLabel = annexTypeLabel(str(row.annex_type));
  const enfr = formatClipIssueDate(str(row.enfrDt));
  const subParts: string[] = [];
  if (srno) subParts.push(`일련 ${srno}`);
  if (typeLabel) subParts.push(typeLabel);
  if (enfr && enfr !== "—") subParts.push(`시행 ${enfr}`);

  const pdfPath = str(row.pdf_local_path);
  const hwpPath = str(row.hwp_local_path);

  const pdfHref =
    recordId && pdfPath
      ? buildClipServeUrl(ruleId, "annex", recordId, "pdf")
      : null;
  const hwpHref =
    recordId && hwpPath
      ? buildClipServeUrl(ruleId, "annex", recordId, "hwp")
      : null;

  return {
    recordId,
    label: title,
    subLabel: subParts.length ? subParts.join(" · ") : null,
    pdfHref,
    hwpHref,
    fileHref: null,
    externalHref: null,
  };
}

function attachmentUiRow(
  ruleId: string,
  row: Record<string, unknown>,
): ClipSatelliteUiRow {
  const recordId = str(row.attach_id);
  const label = str(row.file_name) || str(row.rule_name) || "(이름 없음)";
  const srno = str(row.srno);
  const localPath = str(row.local_path);
  const lnk = str(row.lnk_url);

  const fileHref =
    recordId && localPath
      ? buildClipServeUrl(ruleId, "attachment", recordId, "file")
      : null;

  let externalHref: string | null = null;
  if (lnk && /^https?:\/\//i.test(lnk)) {
    externalHref = lnk;
  }

  return {
    recordId,
    label,
    subLabel: srno ? `일련 ${srno}` : null,
    pdfHref: null,
    hwpHref: null,
    fileHref,
    externalHref,
  };
}

export function clipSatelliteUiRowsForApi(
  db: DatabaseSync,
  ruleId: string,
  kind: ClipSatelliteKind,
): ClipSatelliteUiRow[] {
  if (kind === "annex") {
    return annexRowsByRule(db, ruleId)
      .map((row) => annexUiRow(ruleId, row))
      .filter((r) => r.recordId !== "");
  }
  return attachmentRowsByRule(db, ruleId)
    .map((row) => attachmentUiRow(ruleId, row))
    .filter((r) => r.recordId !== "");
}

export function clipAnnexRowById(
  db: DatabaseSync,
  ruleId: string,
  annexId: string,
): Record<string, unknown> | undefined {
  if (!clipTableExists(db, ANNEX_TABLE)) return undefined;
  const rid = ruleId.trim();
  const aid = annexId.trim();
  if (!rid || !aid) return undefined;
  return stmtGet(
    db,
    `SELECT annex_id, rule_id, pdf_local_path, hwp_local_path
       FROM ${ANNEX_TABLE}
      WHERE rule_id = ? AND annex_id = ?
      LIMIT 1`,
    [rid, aid],
  );
}

export function clipAttachmentRowById(
  db: DatabaseSync,
  ruleId: string,
  attachId: string,
): Record<string, unknown> | undefined {
  if (!clipTableExists(db, ATTACHMENT_TABLE)) return undefined;
  const rid = ruleId.trim();
  const aid = attachId.trim();
  if (!rid || !aid) return undefined;
  return stmtGet(
    db,
    `SELECT attach_id, rule_id, local_path, file_name
       FROM ${ATTACHMENT_TABLE}
      WHERE rule_id = ? AND attach_id = ?
      LIMIT 1`,
    [rid, aid],
  );
}

export function clipPickPathFromAnnexRow(
  row: Record<string, unknown>,
  variant: string,
): string | null {
  const pdf = str(row.pdf_local_path);
  const hwp = str(row.hwp_local_path);
  if (variant === "pdf") return pdf || null;
  if (variant === "hwp") return hwp || null;
  return pdf || hwp || null;
}

export function clipPickPathFromAttachmentRow(
  row: Record<string, unknown>,
): string | null {
  const local = str(row.local_path);
  return local || null;
}

export function clipResolveSatelliteTable(kind: ClipSatelliteKind): string | null {
  return kind === "annex" ? ANNEX_TABLE : ATTACHMENT_TABLE;
}
