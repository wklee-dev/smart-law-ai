import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DEFAULT_CIEL_DB = "C:/SQLiteDB/ciel.db";

export function getCielDbPath(): string {
  return (
    process.env.CIEL_SQLITE_DB_PATH?.trim() ||
    process.env.CIEL_DB_PATH?.trim() ||
    DEFAULT_CIEL_DB
  );
}

export type CielMenuItem = {
  id: number;
  screen: string;
  parentTitle: string;
  title: string;
  url: string;
  sortOrder: number;
  parameter: string | null;
  /** 원산지 하위 메뉴 여부 */
  group: string | null;
};

export type CielContentSummary = {
  id: number;
  screen: string;
  lawName: string;
  sourceUrl: string;
  textLength: number;
  hasHtml: boolean;
  usable: boolean;
};

export type CielDocument = {
  id: number;
  screen: string;
  lawName: string;
  contentText: string;
  contentHtml: string;
  sourceUrl: string;
  crawledAt: string | null;
  attachments: CielAttachment[];
  links: CielLawLink[];
};

export type CielAttachment = {
  id: number;
  fileName: string;
  filePath: string;
  downloadUrl: string;
};

export type CielLawLink = {
  id: number;
  linkText: string;
  linkUrl: string;
};

type CielDb = {
  all: (sql: string, params?: unknown[]) => Record<string, unknown>[];
  get: (sql: string, params?: unknown[]) => Record<string, unknown> | undefined;
  close: () => void;
};

function openCielDb(): CielDb {
  const p = path.resolve(getCielDbPath().trim());
  if (!fs.existsSync(p)) {
    throw new Error(`씨엘 SQLite DB 파일이 없습니다: ${p}`);
  }
  const db = new DatabaseSync(p, { readOnly: true });
  return {
    all(sql, params = []) {
      return (db.prepare(sql).all(...params) as Record<string, unknown>[]) ?? [];
    },
    get(sql, params = []) {
      return db.prepare(sql).get(...params) as
        | Record<string, unknown>
        | undefined;
    },
    close() {
      db.close();
    },
  };
}

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Origin*.asp / co_*.asp → 원산지 그룹, 승인 면제 → 수출입승인의 면제 */
function menuGroup(title: string, url: string): string | null {
  const u = url.toLowerCase();
  if (
    title === "수출승인의 면제" ||
    title === "수입승인의 면제" ||
    u.includes("exemption_ex") ||
    u.includes("exemption_im")
  ) {
    return "수출입승인의 면제";
  }
  if (
    u.includes("origin") ||
    u.includes("co_easy") ||
    u.includes("co_cus") ||
    title.includes("원산지") ||
    title === "일반원칙" ||
    title === "적정표시방법"
  ) {
    return "원산지";
  }
  return null;
}

export function isCielLoginWallContent(text: string, html: string): boolean {
  const blob = `${text}\n${html}`;
  if (
    blob.includes("유료회원가입") ||
    blob.includes("404 - File or directory not found") ||
    blob.includes("404 - 파일 또는 디렉터리를 찾을 수 없습니다") ||
    blob.includes("500 - Internal server error") ||
    blob.includes("500 - 내부 서버 오류") ||
    blob.includes("해당 자료가 등록되어 있지 않습니다")
  ) {
    return true;
  }
  // iolaw.asp 껍데기만 크롤된 경우 (본문 iframe 미포함)
  const textLen = text.replace(/\s+/g, " ").trim().length;
  if (text.includes("류 바로가기") && textLen > 0 && textLen < 2500) {
    return true;
  }
  return false;
}

function cielHtmlTextLength(html: string): number {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim().length;
}

function rewriteCielAssetUrls(html: string): string {
  let out = html;
  // 상대 경로 → Ciel 절대 URL
  out = out.replace(
    /\s(href|src)=(['"])\.\.\/\.\.\/([^'"]+)\2/gi,
    " $1=$2https://www.clhs.co.kr/$3$2",
  );
  out = out.replace(
    /\s(href|src)=(['"])\.\.\/([^'"]+)\2/gi,
    " $1=$2https://www.clhs.co.kr/Y2026/$3$2",
  );
  // iolaw 하위 상대 경로 (images/… 등)
  out = out.replace(
    /\s(src)=(['"])(?!https?:|\/\/|\/|data:)([^'"]+)\2/gi,
    " $1=$2https://www.clhs.co.kr/Y2026/iolaw/$3$2",
  );
  out = out.replace(/\sbackground=(['"])\.\.\/[^'"]*\1/gi, "");
  // target=_parent → _blank
  out = out.replace(/target=(['"])_parent\1/gi, 'target="_blank"');
  return out;
}

function extractBalancedTdInner(
  html: string,
  openTagIndex: number,
  openTagLength: number,
): string | null {
  const start = openTagIndex + openTagLength;
  let depth = 1;
  const tagRe = /<\/?td\b[^>]*>/gi;
  tagRe.lastIndex = start;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html))) {
    if (/^<\/td/i.test(m[0])) {
      depth -= 1;
      if (depth === 0) return html.slice(start, m.index);
    } else {
      depth += 1;
    }
  }
  return null;
}

/** #F4F4F4 td 중 가장 긴 본문(중첩 테이블 포함)을 균형 태그로 추출 */
function extractBestF4Content(html: string): string {
  let best = "";
  const openRe = /<td\b[^>]*bgcolor=["']#F4F4F4["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = openRe.exec(html))) {
    const inner = extractBalancedTdInner(html, m.index, m[0].length);
    if (!inner) continue;
    if (cielHtmlTextLength(inner) > cielHtmlTextLength(best)) best = inner;
  }
  return best;
}

/**
 * 크롤 HTML에서 원본 사이트 크롬(상단바·탭·검색폼)을 제거하고 본문만 남깁니다.
 * 주의: #F4F4F4 셀은 표 헤더에도 쓰이므로, 짧은 헤더 셀만 잡히면 본문이 사라집니다.
 */
export function sanitizeCielHtml(html: string): string {
  if (!html.trim()) return "";
  let out = html;
  out = out.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
  out = out.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "");
  out = out.replace(/on\w+\s*=\s*(['"]).*?\1/gi, "");

  const body = out.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (body?.[1]) out = body[1];

  // 내장 탭·검색 form 제거
  out = out.replace(/<form[\s\S]*?<\/form>/gi, "");

  // 상단 "원산지" 등 타이틀 바 행 제거
  out = out.replace(
    /<tr[^>]*>\s*<td[^>]*(?:tableheadsky|background=["'][^"']*tableheadsky)[\s\S]*?<\/tr>/gi,
    "",
  );

  // onclick으로 탭 이동하는 셀이 있는 행 제거
  out = out.replace(
    /<tr[^>]*>[\s\S]*?window\.location\s*=\s*['"]origin[\s\S]*?<\/tr>/gi,
    "",
  );

  // 본문 마커(A. / 1. 관련법령)가 있으면 그 직전 테이블부터 본문으로 사용
  const sectionMark = out.search(
    /<b>\s*A\.\s*<\/b>|>\s*A\.\s*|<b>\s*1\.\s*관련법령\s*<\/b>/i,
  );
  if (sectionMark >= 0) {
    const before = out.slice(0, sectionMark);
    const tableStarts = [...before.matchAll(/<table\b/gi)].map((m) => m.index ?? -1);
    const tableStart = tableStarts.length > 0 ? tableStarts[tableStarts.length - 1]! : -1;
    if (tableStart >= 0) {
      let chunk = out.slice(tableStart);
      // 하단 장식(back3.gif) 행 이후 제거
      const foot = chunk.search(
        /<tr[^>]*>\s*<td[^>]*background=["'][^"']*back3\.gif["']/i,
      );
      if (foot >= 0) {
        chunk = `${chunk.slice(0, foot)}</table>`;
      }
      if (cielHtmlTextLength(chunk) >= 80) {
        return rewriteCielAssetUrls(chunk).trim();
      }
    }
  }

  // 본문 박스(td bgcolor #F4F4F4) — 중첩 테이블을 포함한 균형 추출
  const bestF4 = extractBestF4Content(out);
  if (cielHtmlTextLength(bestF4) >= 200) {
    out = bestF4;
  } else {
    // A. / 1. 섹션부터 잘라내기 (레거시 폴백)
    const aIdx = out.search(
      />\s*A\.\s*|<\b[^>]*>\s*A\.\s*|<b>\s*1\.\s*관련법령\s*<\/b>/i,
    );
    if (aIdx >= 0) {
      const fromA = out.slice(Math.max(0, aIdx - 80));
      const pMatch = fromA.match(/<(?:p|b|table)[\s\S]*$/i);
      out = pMatch ? pMatch[0] : fromA;
    }
  }

  return rewriteCielAssetUrls(out).trim();
}

export function listCielMenus(): {
  dbPath: string;
  items: CielMenuItem[];
} {
  const db = openCielDb();
  try {
    const rows = db.all(
      `SELECT id, screen, parent_title, title, url, sort_order, parameter
       FROM menu_list
       ORDER BY sort_order ASC, id ASC`,
    );
    const items = rows.map((r) => {
      const title = str(r.title).trim();
      const url = str(r.url).trim();
      return {
        id: num(r.id),
        screen: str(r.screen).trim(),
        parentTitle: str(r.parent_title).trim(),
        title,
        url,
        sortOrder: num(r.sort_order),
        parameter: r.parameter == null ? null : str(r.parameter),
        group: menuGroup(title, url),
      };
    });
    return { dbPath: getCielDbPath(), items };
  } finally {
    db.close();
  }
}

function rowToSummary(r: Record<string, unknown>): CielContentSummary {
  const text = str(r.content_text);
  const html = str(r.content_html);
  return {
    id: num(r.id),
    screen: str(r.screen).trim(),
    lawName: str(r.law_name).replace(/\s+/g, " ").trim(),
    sourceUrl: str(r.source_url).trim(),
    textLength: text.length,
    hasHtml: html.length > 0,
    usable: !isCielLoginWallContent(text, html),
  };
}

/**
 * 메뉴 선택 시 콘텐츠 해석:
 * - law_name = 메뉴 title 인 문서(원산지 탭 등)
 * - 아니면 screen = 메뉴 title 인 목록
 */
export function resolveCielMenuContent(menuTitle: string): {
  mode: "document" | "list" | "empty";
  document: CielDocument | null;
  items: CielContentSummary[];
  siblingTabs: CielMenuItem[];
} {
  const title = menuTitle.trim();
  const { items: menus } = listCielMenus();
  const selected = menus.find((m) => m.title === title) ?? null;
  const siblingTabs =
    selected?.group != null
      ? menus.filter((m) => m.group === selected.group)
      : [];

  const db = openCielDb();
  try {
    const byName = db.all(
      `SELECT id, screen, law_name, content_text, content_html, source_url, crawled_at
       FROM law_content
       WHERE TRIM(REPLACE(REPLACE(law_name, char(13), ''), char(9), ' ')) = ?
       ORDER BY length(content_html) DESC, id ASC`,
      [title],
    );

    for (const row of byName) {
      const text = str(row.content_text);
      const html = str(row.content_html);
      if (!isCielLoginWallContent(text, html)) {
        return {
          mode: "document",
          document: loadDocumentById(db, num(row.id)),
          items: [],
          siblingTabs,
        };
      }
    }

    const byScreen = db
      .all(
        `SELECT id, screen, law_name, content_text, content_html, source_url
         FROM law_content
         WHERE TRIM(screen) = ?
         ORDER BY law_name COLLATE NOCASE ASC, id ASC`,
        [title],
      )
      .map(rowToSummary);

    const usable = byScreen.filter((x) => x.usable);
    const items = usable.length > 0 ? usable : byScreen;

    if (items.length === 1) {
      return {
        mode: "document",
        document: loadDocumentById(db, items[0]!.id),
        items: [],
        siblingTabs,
      };
    }

    if (items.length > 1) {
      return { mode: "list", document: null, items, siblingTabs };
    }

    return { mode: "empty", document: null, items: [], siblingTabs };
  } finally {
    db.close();
  }
}

function loadDocumentById(db: CielDb, id: number): CielDocument | null {
  const row = db.get(
    `SELECT id, screen, law_name, content_text, content_html, source_url, crawled_at
     FROM law_content WHERE id = ? LIMIT 1`,
    [id],
  );
  if (!row) return null;

  const lawName = str(row.law_name).replace(/\s+/g, " ").trim();
  const screen = str(row.screen).trim();
  const contentText = str(row.content_text);
  let contentHtml = sanitizeCielHtml(str(row.content_html));
  // sanitize가 본문을 과도하게 잘라낸 경우 텍스트로 폴백 (HTML 우선 표시 방지)
  if (
    cielHtmlTextLength(contentHtml) < 80 &&
    contentText.replace(/\s+/g, " ").trim().length >= 80
  ) {
    contentHtml = "";
  }

  const attachments = db
    .all(
      `SELECT id, file_name, file_path, download_url
       FROM attachments
       WHERE TRIM(law_name) = ? OR TRIM(screen) = ?
       ORDER BY id ASC`,
      [lawName, screen],
    )
    .map((a) => ({
      id: num(a.id),
      fileName: str(a.file_name),
      filePath: str(a.file_path),
      downloadUrl: str(a.download_url),
    }));

  const links = db
    .all(
      `SELECT id, link_text, link_url
       FROM law_links
       WHERE TRIM(from_law) = ?
       ORDER BY id ASC
       LIMIT 200`,
      [lawName],
    )
    .map((l) => ({
      id: num(l.id),
      linkText: str(l.link_text).replace(/\s+/g, " ").trim(),
      linkUrl: str(l.link_url).trim(),
    }));

  return {
    id: num(row.id),
    screen,
    lawName,
    contentText,
    contentHtml,
    sourceUrl: str(row.source_url).trim(),
    crawledAt: row.crawled_at == null ? null : str(row.crawled_at),
    attachments,
    links,
  };
}

export function getCielDocumentById(id: number): CielDocument | null {
  const db = openCielDb();
  try {
    return loadDocumentById(db, id);
  } finally {
    db.close();
  }
}

export function searchCielContent(keyword: string, limit = 80): CielContentSummary[] {
  const q = keyword.trim();
  if (!q) return [];
  const db = openCielDb();
  try {
    const like = `%${q.replace(/%/g, "")}%`;
    const rows = db.all(
      `SELECT id, screen, law_name, content_text, content_html, source_url
       FROM law_content
       WHERE law_name LIKE ? OR screen LIKE ? OR content_text LIKE ?
       ORDER BY
         CASE WHEN law_name LIKE ? THEN 0 WHEN screen LIKE ? THEN 1 ELSE 2 END,
         length(content_html) DESC
       LIMIT ?`,
      [like, like, like, like, like, limit],
    );
    return rows.map(rowToSummary).filter((x) => x.usable);
  } finally {
    db.close();
  }
}
