import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  type NlcListResponse,
  type NlcMinistryAdministrativeListItem,
  type NlcMinistryLegislationListItem,
  type NlcNoticeAttachmentRow,
  type NlcNoticeDetail,
  type NlcNoticeKind,
  type NlcNoticeSort,
  type NlcNoticeStatusFilter,
} from "@/app/shared/nlc-notice-types";
import { getSmartLawSqliteDbPath } from "@/app/lib/smart-law-sqlite-paths";

const LOCAL_TABLE = "nlc_local_legislation_notice";
const DEFAULT_DOWNLOADS_ROOT = "C:/SQLiteDB/downloads";

export type { NlcNoticeSort, NlcNoticeStatusFilter };

export type NlcListFilters = {
  page?: number;
  pageSize?: number;
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  includeFinished?: boolean;
  organizationOnly?: boolean;
  sort?: NlcNoticeSort;
  noticeStatus?: NlcNoticeStatusFilter;
  department?: string;
  lawType?: string;
  lawField?: string;
  /** 기관명 (부분 일치) */
  institution?: string;
  ruleType?: string;
  noticeNumber?: string;
  localGovernment?: string;
  localRegion?: string;
};

function resolveOrderBy(sort: NlcNoticeSort | undefined, dateCol: string): string {
  switch (sort) {
    case "date_asc":
      return `${dateCol} ASC, notice_sequence ASC`;
    case "title_asc":
      return `title ASC, ${dateCol} DESC`;
    case "views_desc":
      return `view_count DESC, ${dateCol} DESC`;
    case "date_desc":
    default:
      return `${dateCol} DESC, notice_sequence DESC`;
  }
}

function applyNoticeStatusFilter(
  where: string[],
  params: unknown[],
  status: NlcNoticeStatusFilter | undefined,
  includeFinished?: boolean,
): void {
  const today = todayIsoDate();
  if (status === "open") {
    where.push("(end_date IS NULL OR end_date = '' OR end_date >= ?)");
    params.push(today);
    return;
  }
  if (status === "closed") {
    where.push("(end_date IS NOT NULL AND end_date != '' AND end_date < ?)");
    params.push(today);
    return;
  }
  if (!includeFinished) {
    where.push("(end_date IS NULL OR end_date = '' OR end_date >= ?)");
    params.push(today);
  }
}

function openDb(readOnly: boolean): DatabaseSync {
  const p = path.resolve(getSmartLawSqliteDbPath().trim());
  if (!fs.existsSync(p)) {
    throw new Error(`SQLite DB 파일이 없습니다: ${p}`);
  }
  return new DatabaseSync(p, { readOnly });
}

function stmtAll<T>(
  db: DatabaseSync,
  sql: string,
  params: unknown[] = [],
): T[] {
  return (db.prepare(sql).all(...params) as T[]) ?? [];
}

function stmtGet<T>(
  db: DatabaseSync,
  sql: string,
  params: unknown[] = [],
): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

function tableExists(db: DatabaseSync, name: string): boolean {
  const row = stmtGet<{ ok?: number }>(
    db,
    `SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`,
    [name],
  );
  return Boolean(row?.ok);
}

function columnExists(db: DatabaseSync, table: string, column: string): boolean {
  const cols = stmtAll<{ name: string }>(db, `PRAGMA table_info(${table})`);
  return cols.some((c) => c.name === column);
}

function parseDetailInfo(json: string | null | undefined): Record<string, string> {
  if (!json?.trim()) return {};
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v === null || v === undefined) continue;
      out[k] = String(v);
    }
    return out;
  } catch {
    return {};
  }
}

function clampPage(page: number): number {
  return Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
}

function clampPageSize(size: number): number {
  if (!Number.isFinite(size)) return 20;
  return Math.min(100, Math.max(10, Math.floor(size)));
}

function likeParam(text: string | undefined): string | null {
  const t = text?.trim();
  if (!t) return null;
  return `%${t.replace(/[%_\\]/g, "")}%`;
}

function buildDateFilter(
  column: string,
  dateFrom?: string,
  dateTo?: string,
): { sql: string; params: string[] } {
  const params: string[] = [];
  const parts: string[] = [];
  const from = dateFrom?.trim();
  const to = dateTo?.trim();
  if (from) {
    parts.push(`(${column} IS NOT NULL AND ${column} != '' AND ${column} >= ?)`);
    params.push(from);
  }
  if (to) {
    parts.push(`(${column} IS NOT NULL AND ${column} != '' AND ${column} <= ?)`);
    params.push(to);
  }
  return { sql: parts.length ? parts.join(" AND ") : "", params };
}

function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function distinctNonEmpty(db: DatabaseSync, sql: string): string[] {
  const rows = stmtAll<{ v: string }>(db, sql);
  return rows.map((r) => r.v.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b, "ko"));
}

function listAttachments(
  db: DatabaseSync,
  noticeType: "legislation" | "administrative",
  noticeSequence: string,
): NlcNoticeAttachmentRow[] {
  type Row = {
    attachment_id: number;
    file_name: string;
    download_url: string;
    local_path: string | null;
    file_size: number | null;
    download_status: string;
  };
  const rows = stmtAll<Row>(
    db,
    `
    SELECT attachment_id, file_name, download_url, local_path, file_size, download_status
    FROM nlc_notice_attachment
    WHERE notice_type = ? AND notice_sequence = ?
    ORDER BY file_sequence ASC, attachment_id ASC
    `,
    [noticeType, noticeSequence],
  );
  return rows.map((r) => ({
    attachmentId: r.attachment_id,
    fileName: r.file_name,
    downloadUrl: r.download_url,
    hasLocalFile: Boolean(
      r.local_path?.trim() &&
        r.download_status !== "FAILED" &&
        fs.existsSync(r.local_path.trim()),
    ),
    fileSize: r.file_size,
  }));
}

export function listNlcMinistryLegislationNotices(
  filters: NlcListFilters,
): Extract<NlcListResponse, { kind: "ministry-legislation" }> {
  const page = clampPage(filters.page ?? 1);
  const pageSize = clampPageSize(filters.pageSize ?? 20);
  const offset = (page - 1) * pageSize;

  const db = openDb(true);
  try {
    if (!tableExists(db, "nlc_ministry_legislation_notice")) {
      return {
        ok: true,
        kind: "ministry-legislation",
        dataAvailable: true,
        total: 0,
        page,
        pageSize,
        items: [],
        facets: { departments: [], lawTypes: [], lawFields: [] },
      };
    }

    const where: string[] = ["1=1"];
    const params: unknown[] = [];

    const qLike = likeParam(filters.q);
    if (qLike) {
      where.push("(title LIKE ?)");
      params.push(qLike);
    }
    if (filters.department?.trim()) {
      where.push("department = ?");
      params.push(filters.department.trim());
    }
    if (filters.lawType?.trim()) {
      where.push("law_type = ?");
      params.push(filters.lawType.trim());
    }
    if (filters.lawField?.trim()) {
      where.push("law_field = ?");
      params.push(filters.lawField.trim());
    }
    const dateFilter = buildDateFilter("start_date", filters.dateFrom, filters.dateTo);
    if (dateFilter.sql) {
      where.push(dateFilter.sql);
      params.push(...dateFilter.params);
    }
    if (filters.organizationOnly) {
      where.push("title LIKE '%직제%'");
    }
    applyNoticeStatusFilter(
      where,
      params,
      filters.noticeStatus,
      filters.includeFinished,
    );

    const whereSql = where.join(" AND ");
    const orderBy = resolveOrderBy(filters.sort, "start_date");
    const total =
      stmtGet<{ c: number }>(
        db,
        `SELECT COUNT(*) AS c FROM nlc_ministry_legislation_notice WHERE ${whereSql}`,
        params,
      )?.c ?? 0;

    type Row = {
      notice_sequence: string;
      title: string;
      department: string;
      law_type: string;
      law_field: string;
      target_audience: string;
      start_date: string;
      end_date: string;
      view_count: number | null;
      source_url: string;
    };

    const rows = stmtAll<Row>(
      db,
      `
      SELECT notice_sequence, title, department, law_type, law_field, target_audience,
             start_date, end_date, view_count, source_url
      FROM nlc_ministry_legislation_notice
      WHERE ${whereSql}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
      `,
      [...params, pageSize, offset],
    );

    const items: NlcMinistryLegislationListItem[] = rows.map((r) => ({
      noticeSequence: r.notice_sequence,
      title: r.title ?? "",
      department: r.department ?? "",
      lawType: r.law_type ?? "",
      lawField: r.law_field ?? "",
      targetAudience: r.target_audience ?? "",
      startDate: r.start_date ?? "",
      endDate: r.end_date ?? "",
      viewCount: r.view_count,
      sourceUrl: r.source_url ?? "",
    }));

    const facets = {
      departments: distinctNonEmpty(
        db,
        `SELECT DISTINCT department AS v FROM nlc_ministry_legislation_notice WHERE department IS NOT NULL AND department != '' ORDER BY department`,
      ),
      lawTypes: distinctNonEmpty(
        db,
        `SELECT DISTINCT law_type AS v FROM nlc_ministry_legislation_notice WHERE law_type IS NOT NULL AND law_type != '' ORDER BY law_type`,
      ),
      lawFields: distinctNonEmpty(
        db,
        `SELECT DISTINCT law_field AS v FROM nlc_ministry_legislation_notice WHERE law_field IS NOT NULL AND law_field != '' ORDER BY law_field`,
      ),
    };

    return {
      ok: true,
      kind: "ministry-legislation",
      dataAvailable: true,
      total,
      page,
      pageSize,
      items,
      facets,
    };
  } finally {
    db.close();
  }
}

export function listNlcMinistryAdministrativeNotices(
  filters: NlcListFilters,
): Extract<NlcListResponse, { kind: "ministry-administrative" }> {
  const page = clampPage(filters.page ?? 1);
  const pageSize = clampPageSize(filters.pageSize ?? 20);
  const offset = (page - 1) * pageSize;

  const db = openDb(true);
  try {
    if (!tableExists(db, "nlc_ministry_administrative_notice")) {
      return {
        ok: true,
        kind: "ministry-administrative",
        dataAvailable: true,
        total: 0,
        page,
        pageSize,
        items: [],
        facets: { institutions: [], ruleTypes: [] },
      };
    }

    const where: string[] = ["1=1"];
    const params: unknown[] = [];

    const qLike = likeParam(filters.q);
    if (qLike) {
      where.push("(title LIKE ?)");
      params.push(qLike);
    }
    const institutionLike = likeParam(filters.institution);
    if (institutionLike) {
      where.push("institution LIKE ?");
      params.push(institutionLike);
    }
    if (filters.ruleType?.trim()) {
      where.push("rule_type = ?");
      params.push(filters.ruleType.trim());
    }
    if (filters.noticeNumber?.trim()) {
      where.push("notice_number LIKE ?");
      params.push(`%${filters.noticeNumber.trim()}%`);
    }
    const dateFilter = buildDateFilter("start_date", filters.dateFrom, filters.dateTo);
    if (dateFilter.sql) {
      where.push(dateFilter.sql);
      params.push(...dateFilter.params);
    }
    applyNoticeStatusFilter(
      where,
      params,
      filters.noticeStatus,
      filters.includeFinished,
    );

    const whereSql = where.join(" AND ");
    const orderBy = resolveOrderBy(filters.sort, "start_date");
    const total =
      stmtGet<{ c: number }>(
        db,
        `SELECT COUNT(*) AS c FROM nlc_ministry_administrative_notice WHERE ${whereSql}`,
        params,
      )?.c ?? 0;

    type Row = {
      notice_sequence: string;
      title: string;
      rule_type: string;
      institution: string;
      notice_number: string;
      start_date: string;
      end_date: string;
      view_count: number | null;
      source_url: string;
    };

    const rows = stmtAll<Row>(
      db,
      `
      SELECT notice_sequence, title, rule_type, institution, notice_number,
             start_date, end_date, view_count, source_url
      FROM nlc_ministry_administrative_notice
      WHERE ${whereSql}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
      `,
      [...params, pageSize, offset],
    );

    const items: NlcMinistryAdministrativeListItem[] = rows.map((r) => ({
      noticeSequence: r.notice_sequence,
      title: r.title ?? "",
      ruleType: r.rule_type ?? "",
      institution: r.institution ?? "",
      noticeNumber: r.notice_number ?? "",
      startDate: r.start_date ?? "",
      endDate: r.end_date ?? "",
      viewCount: r.view_count,
      sourceUrl: r.source_url ?? "",
    }));

    const facets = {
      institutions: distinctNonEmpty(
        db,
        `SELECT DISTINCT institution AS v FROM nlc_ministry_administrative_notice WHERE institution IS NOT NULL AND institution != '' ORDER BY institution`,
      ),
      ruleTypes: distinctNonEmpty(
        db,
        `SELECT DISTINCT rule_type AS v FROM nlc_ministry_administrative_notice WHERE rule_type IS NOT NULL AND rule_type != '' ORDER BY rule_type`,
      ),
    };

    return {
      ok: true,
      kind: "ministry-administrative",
      dataAvailable: true,
      total,
      page,
      pageSize,
      items,
      facets,
    };
  } finally {
    db.close();
  }
}

export function listNlcLocalLegislationNotices(
  filters: NlcListFilters,
): Extract<NlcListResponse, { kind: "local-legislation" }> {
  const page = clampPage(filters.page ?? 1);
  const pageSize = clampPageSize(filters.pageSize ?? 20);

  const db = openDb(true);
  try {
    if (!tableExists(db, LOCAL_TABLE)) {
      return {
        ok: true,
        kind: "local-legislation",
        dataAvailable: false,
        message:
          "지방 입법예고 수집 테이블(nlc_local_legislation_notice)이 없습니다. 크롤러 실행 후 조회할 수 있습니다.",
        total: 0,
        page,
        pageSize,
        items: [],
      };
    }

    const offset = (page - 1) * pageSize;
    const where: string[] = ["1=1"];
    const params: unknown[] = [];

    const qLike = likeParam(filters.q);
    if (qLike) {
      where.push("(title LIKE ?)");
      params.push(qLike);
    }
    if (filters.noticeNumber?.trim()) {
      where.push("notice_number LIKE ?");
      params.push(`%${filters.noticeNumber.trim()}%`);
    }
    const dateFilter = buildDateFilter(
      "announcement_date",
      filters.dateFrom,
      filters.dateTo,
    );
    if (dateFilter.sql) {
      where.push(dateFilter.sql);
      params.push(...dateFilter.params);
    }
    if (filters.localGovernment?.trim() && columnExists(db, LOCAL_TABLE, "local_government")) {
      where.push("local_government = ?");
      params.push(filters.localGovernment.trim());
    }
    if (filters.localRegion?.trim() && columnExists(db, LOCAL_TABLE, "local_region")) {
      where.push("local_region = ?");
      params.push(filters.localRegion.trim());
    }

    const whereSql = where.join(" AND ");
    const orderBy = resolveOrderBy(filters.sort, "announcement_date");
    const total =
      stmtGet<{ c: number }>(
        db,
        `SELECT COUNT(*) AS c FROM ${LOCAL_TABLE} WHERE ${whereSql}`,
        params,
      )?.c ?? 0;

    type Row = {
      notice_sequence: string;
      title: string;
      local_government: string;
      notice_number: string;
      announcement_date: string;
      view_count: number | null;
      source_url: string;
    };

    const rows = stmtAll<Row>(
      db,
      `
      SELECT notice_sequence, title, local_government, notice_number,
             announcement_date, view_count, source_url
      FROM ${LOCAL_TABLE}
      WHERE ${whereSql}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
      `,
      [...params, pageSize, offset],
    );

    const facets = {
      localGovernments: columnExists(db, LOCAL_TABLE, "local_government")
        ? distinctNonEmpty(
            db,
            `SELECT DISTINCT local_government AS v FROM ${LOCAL_TABLE} WHERE local_government IS NOT NULL AND local_government != '' ORDER BY local_government`,
          )
        : [],
      localRegions: columnExists(db, LOCAL_TABLE, "local_region")
        ? distinctNonEmpty(
            db,
            `SELECT DISTINCT local_region AS v FROM ${LOCAL_TABLE} WHERE local_region IS NOT NULL AND local_region != '' ORDER BY local_region`,
          )
        : [],
    };

    return {
      ok: true,
      kind: "local-legislation",
      dataAvailable: true,
      total,
      page,
      pageSize,
      items: rows.map((r) => ({
        noticeSequence: r.notice_sequence,
        title: r.title ?? "",
        localGovernment: r.local_government ?? "",
        noticeNumber: r.notice_number ?? "",
        announcementDate: r.announcement_date ?? "",
        viewCount: r.view_count,
        sourceUrl: r.source_url ?? "",
      })),
      facets,
    };
  } finally {
    db.close();
  }
}

export function getNlcNoticeDetail(
  kind: NlcNoticeKind,
  noticeSequence: string,
): NlcNoticeDetail | null {
  const seq = noticeSequence.trim();
  if (!seq) return null;

  const db = openDb(true);
  try {
    if (kind === "ministry-legislation") {
      type Row = {
        notice_sequence: string;
        source_url: string;
        title: string;
        department: string;
        law_type: string;
        law_field: string;
        target_audience: string;
        start_date: string;
        end_date: string;
        view_count: number | null;
        detail_info_json: string;
        body_text: string;
      };
      const row = stmtGet<Row>(
        db,
        `SELECT * FROM nlc_ministry_legislation_notice WHERE notice_sequence = ?`,
        [seq],
      );
      if (!row) return null;
      return {
        kind,
        noticeSequence: row.notice_sequence,
        title: row.title ?? "",
        sourceUrl: row.source_url ?? "",
        viewCount: row.view_count,
        bodyText: row.body_text ?? "",
        detailInfo: parseDetailInfo(row.detail_info_json),
        department: row.department ?? "",
        lawType: row.law_type ?? "",
        lawField: row.law_field ?? "",
        targetAudience: row.target_audience ?? "",
        startDate: row.start_date ?? "",
        endDate: row.end_date ?? "",
        attachments: listAttachments(db, "legislation", seq),
      };
    }

    if (kind === "ministry-administrative") {
      type Row = {
        notice_sequence: string;
        source_url: string;
        title: string;
        rule_type: string;
        institution: string;
        notice_number: string;
        start_date: string;
        end_date: string;
        phone: string;
        fax: string;
        email: string;
        view_count: number | null;
        detail_info_json: string;
        body_text: string;
      };
      const row = stmtGet<Row>(
        db,
        `SELECT * FROM nlc_ministry_administrative_notice WHERE notice_sequence = ?`,
        [seq],
      );
      if (!row) return null;
      return {
        kind,
        noticeSequence: row.notice_sequence,
        title: row.title ?? "",
        sourceUrl: row.source_url ?? "",
        viewCount: row.view_count,
        bodyText: row.body_text ?? "",
        detailInfo: parseDetailInfo(row.detail_info_json),
        ruleType: row.rule_type ?? "",
        institution: row.institution ?? "",
        noticeNumber: row.notice_number ?? "",
        startDate: row.start_date ?? "",
        endDate: row.end_date ?? "",
        phone: row.phone ?? "",
        fax: row.fax ?? "",
        email: row.email ?? "",
        attachments: listAttachments(db, "administrative", seq),
      };
    }

    if (!tableExists(db, LOCAL_TABLE)) return null;
    type LocalRow = {
      notice_sequence: string;
      source_url: string;
      title: string;
      local_government: string;
      notice_number: string;
      announcement_date: string;
      view_count: number | null;
      detail_info_json: string;
      body_text: string;
    };
    const local = stmtGet<LocalRow>(
      db,
      `SELECT * FROM ${LOCAL_TABLE} WHERE notice_sequence = ?`,
      [seq],
    );
    if (!local) return null;
    return {
      kind,
      noticeSequence: local.notice_sequence,
      title: local.title ?? "",
      sourceUrl: local.source_url ?? "",
      viewCount: local.view_count,
      bodyText: local.body_text ?? "",
      detailInfo: parseDetailInfo(local.detail_info_json),
      localGovernment: local.local_government ?? "",
      noticeNumber: local.notice_number ?? "",
      announcementDate: local.announcement_date ?? "",
      attachments: [],
    };
  } finally {
    db.close();
  }
}

export function getNlcAttachmentForDownload(attachmentId: number): {
  fileName: string;
  downloadUrl: string;
  absPath: string;
} | null {
  if (!Number.isFinite(attachmentId) || attachmentId <= 0) return null;
  const db = openDb(true);
  try {
    type Row = {
      attachment_id: number;
      file_name: string;
      download_url: string;
      local_path: string | null;
    };
    const row = stmtGet<Row>(
      db,
      `SELECT attachment_id, file_name, download_url, local_path FROM nlc_notice_attachment WHERE attachment_id = ?`,
      [attachmentId],
    );
    if (!row?.local_path?.trim()) {
      if (row) {
        return {
          fileName: row.file_name,
          downloadUrl: row.download_url,
          absPath: "",
        };
      }
      return null;
    }
    const root = path.resolve(
      process.env.NLC_DOWNLOADS_ROOT?.trim() || DEFAULT_DOWNLOADS_ROOT,
    );
    const abs = path.resolve(row.local_path.trim());
    if (!abs.startsWith(root)) return null;
    if (!fs.existsSync(abs)) {
      return {
        fileName: row.file_name,
        downloadUrl: row.download_url,
        absPath: "",
      };
    }
    return {
      fileName: row.file_name,
      downloadUrl: row.download_url,
      absPath: abs,
    };
  } finally {
    db.close();
  }
}
