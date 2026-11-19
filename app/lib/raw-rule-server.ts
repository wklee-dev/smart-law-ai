import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  getRawRuleDbPath,
} from "@/app/lib/raw-rule-db-paths";
import { RAW_RULE_SELECT_COLUMNS } from "@/app/lib/raw-rule-schema";
import { getSmartLawSqliteDbPath } from "@/app/lib/smart-law-sqlite-paths";

/** smart_law_ai.db 법률 본문 — raw_rule에 법률 미수집 시 보강 */
export const SMART_LAW_DETAIL_PREFIX = "sla:";

export type RawRuleDocType =
  | "법률"
  | "시행령"
  | "시행규칙"
  | "고시"
  | "훈령"
  | "공고"
  | "예규"
  | "기타";

export type RawRuleRow = {
  internal_id: string;
  law_id: string | null;
  law_name: string;
  law_type: string;
  promulgation_date: string | null;
  promulgation_number: string | null;
  department: string | null;
  enforcement_date: string | null;
  content: string | null;
  parent_internal_id: string | null;
  meta_info: string | null;
  gubun: string | null;
  collected_at?: string | null;
};

export type RawRuleTreeNode = {
  id: string;
  lawId: string;
  lawName: string;
  docType: RawRuleDocType;
  lawType: string;
  enforcementDate: string | null;
  promulgationDate: string | null;
  promulgationNumber: string | null;
  department: string | null;
  /** 가상 그룹 노드(법률 본문 미수집) — 클릭 불가 */
  virtual?: boolean;
  children: RawRuleTreeNode[];
};

export type RawRuleArticle = {
  id: string;
  articleNo: string;
  articleTitle: string;
  content: string;
};

export type RawRuleAddendum = {
  id: number;
  promulgationDate: string | null;
  promulgationNumber: string | null;
  content: string;
};

export type RawRuleAnnex = {
  id: number;
  annexNumber: string | null;
  annexTitle: string | null;
  annexContent: string | null;
  annexFileLink: string | null;
};

export type RawRuleDetail = {
  lawId: string;
  externalLawId: string | null;
  lawName: string;
  docType: RawRuleDocType;
  lawType: string;
  promulgationDate: string | null;
  promulgationNumber: string | null;
  department: string | null;
  enforcementDate: string | null;
  gubun: string | null;
  articles: RawRuleArticle[];
  addendums: RawRuleAddendum[];
  annexes: RawRuleAnnex[];
};

/** CLIP 라벨이 law_type에 들어온 경우(법률→률, 고시→시 등) 파싱 */
const CLIP_LABEL_PREFIXES: { re: RegExp; docType: RawRuleDocType }[] = [
  { re: /^률\s+/, docType: "법률" },
  { re: /^행령\s+/, docType: "시행령" },
  { re: /^행규칙\s+/, docType: "시행규칙" },
  { re: /^시\s+/, docType: "고시" },
  { re: /^령\s+/, docType: "훈령" },
  { re: /^고\s+/, docType: "공고" },
  { re: /^규\s+/, docType: "예규" },
];

function parseClipLawTypeField(lawType: string): {
  displayName: string;
  docTypeHint: RawRuleDocType | null;
} {
  const s = (lawType ?? "").trim();
  if (!s) return { displayName: "", docTypeHint: null };

  const bracket = s.indexOf("[");
  const head = (bracket >= 0 ? s.slice(0, bracket) : s).trim();

  for (const { re, docType } of CLIP_LABEL_PREFIXES) {
    if (re.test(head)) {
      return {
        displayName: head.replace(re, "").trim(),
        docTypeHint: docType,
      };
    }
  }

  return { displayName: head, docTypeHint: null };
}

/** law_name 미입력 시 law_type(CLIP 라벨)에서 명칭 복원 */
export function effectiveRawRuleName(row: Pick<RawRuleRow, "law_name" | "law_type" | "internal_id">): string {
  const name = (row.law_name ?? "").trim();
  if (name) return name;
  const parsed = parseClipLawTypeField(row.law_type ?? "");
  return parsed.displayName || row.internal_id;
}

function effectiveRawRuleDocType(
  row: Pick<RawRuleRow, "law_type" | "law_name">,
): RawRuleDocType | null {
  const name = (row.law_name ?? "").trim();
  if (!name) {
    const parsed = parseClipLawTypeField(row.law_type ?? "");
    if (parsed.docTypeHint) return parsed.docTypeHint;
  }
  return null;
}

const DOC_TYPE_ORDER: Record<RawRuleDocType, number> = {
  법률: 0,
  시행령: 1,
  시행규칙: 2,
  고시: 3,
  훈령: 4,
  공고: 5,
  예규: 6,
  기타: 7,
};

/** 시행령 하위 배치 순서 (포털: 시행규칙 → 고시 → 훈령 → 공고) */
const DECREE_CHILD_ORDER: Record<RawRuleDocType, number> = {
  법률: 0,
  시행령: 1,
  시행규칙: 2,
  고시: 3,
  훈령: 4,
  공고: 5,
  예규: 6,
  기타: 7,
};

const DECREE_LAW_TYPES = new Set([
  "대통령령",
  "국무총리령",
  "총리령",
  "대통령령(시행령)",
]);

const RULE_LAW_TYPES = new Set([
  "기획재정부령",
  "산업통상자원부령",
  "행정안전부령",
  "재정경제부령",
  "법무부령",
  "국토교통부령",
]);

function stmtAll<T extends Record<string, unknown>>(
  db: DatabaseSync,
  sql: string,
  params: unknown[] = [],
): T[] {
  return (db.prepare(sql).all(...params) as T[]) ?? [];
}

export function openRawRuleDb(readOnly = true): DatabaseSync {
  const p = path.resolve(getRawRuleDbPath().trim());
  if (!fs.existsSync(p)) {
    throw new Error(`raw_rule SQLite DB 파일이 없습니다: ${p}`);
  }
  return new DatabaseSync(p, { readOnly });
}

function classifyRawRuleRow(
  row: Pick<RawRuleRow, "law_type" | "law_name" | "internal_id">,
): RawRuleDocType {
  const hint = effectiveRawRuleDocType(row);
  if (hint) return hint;
  return classifyRawRuleDocType(row.law_type, effectiveRawRuleName(row));
}

export function classifyRawRuleDocType(
  lawType: string,
  lawName: string,
): RawRuleDocType {
  const hint = effectiveRawRuleDocType({ law_type: lawType, law_name: lawName });
  if (hint) return hint;

  const lt = (lawType ?? "").trim();
  const name = (lawName ?? "").trim() || parseClipLawTypeField(lawType).displayName;

  if (lt === "법" || lt === "법률") return "법률";
  if (lt === "고시" || lt.includes("고시")) return "고시";
  if (lt === "훈령" || lt.includes("훈령")) return "훈령";
  if (lt === "공고" || lt.includes("공고")) return "공고";
  if (lt === "예규" || lt.includes("예규")) return "예규";

  if (name.includes("에 관한 고시") || name.includes("고시")) return "고시";
  if (name.includes("에 관한 훈령") || name.includes("훈령")) return "훈령";
  if (name.includes("에 관한 공고") || name.includes("공고")) return "공고";

  if (name.includes("시행규칙") || RULE_LAW_TYPES.has(lt)) {
    return "시행규칙";
  }
  if (
    name.includes("시행령") ||
    DECREE_LAW_TYPES.has(lt) ||
    (lt.includes("령") && !lt.includes("부령") && !name.includes("규칙"))
  ) {
    return "시행령";
  }
  if (lt.includes("부령") || name.includes("규칙")) {
    return "시행규칙";
  }
  return "기타";
}

/** 포털 분류별 상위 법률명 — 관세법령정보포털 트리 기준 */
const CUSTOMS_ACT_SUB_DECREES = new Set([
  "세계무역기구협정 등에 의한 양허관세 규정",
  "최빈개발도상국에 대한 특혜관세 공여 규정",
  "특정국가와의 관세협상에 따른 국제협력관세의 적용에 관한 규정",
]);

const GUBUN_SUPPLEMENT_LAW_NAMES: Record<string, string[]> = {
  관세법령: ["관세법", "관세사법"],
};

export function extractRawRuleRootKey(
  lawName: string,
  gubun?: string | null,
  lawType?: string | null,
): string {
  const name = (lawName ?? "").trim();
  if (!name) return name;

  const docType = classifyRawRuleDocType(lawType ?? "", name);

  // 법률은 항상 최상위 루트 (다른 법률의 자식이 되지 않음)
  if (docType === "법률") return name;

  const mainDecree = name.match(/^(.+?)\s+시행령$/);
  if (mainDecree) return mainDecree[1].trim();

  const decree = name.match(/^(.+?)\s+시행령(?:\s|$)/);
  if (decree) return decree[1].trim();

  const rule = name.match(/^(.+?)\s+시행규칙(?:\s|$)/);
  if (rule) return rule[1].trim();

  const articleRef = name.match(/^(.+?)\s+제\d+/);
  if (articleRef) return articleRef[1].trim();

  if (gubun === "관세법령") {
    if (CUSTOMS_ACT_SUB_DECREES.has(name)) return "관세법";
    if (name.includes("덤핑방지관세") || name.includes("상계관세")) {
      return "관세법";
    }
    // 종속 행정규칙 — 관세법 시행령 하위 (포털 기준)
    if (
      docType === "고시" ||
      docType === "훈령" ||
      docType === "공고" ||
      docType === "예규"
    ) {
      return "관세법";
    }
  }

  return name;
}

function primaryDecreeName(rootKey: string): string {
  return `${rootKey} 시행령`;
}

function isPrimaryDecree(rootKey: string, lawName: string): boolean {
  return lawName === primaryDecreeName(rootKey);
}

function primaryRuleName(rootKey: string): string {
  return `${rootKey} 시행규칙`;
}

/** 포털 기준 시행령(본령) 직하 — 시행규칙(본규칙)·고시·훈령·공고 */
function belongsUnderPrimaryDecree(
  rootKey: string,
  node: RawRuleTreeNode,
): boolean {
  if (
    node.docType === "고시" ||
    node.docType === "훈령" ||
    node.docType === "공고" ||
    node.docType === "예규"
  ) {
    return rootKey === "관세법";
  }
  if (node.docType === "시행규칙") {
    return node.lawName === primaryRuleName(rootKey);
  }
  return false;
}

function sortDecreeChildren(nodes: RawRuleTreeNode[]): RawRuleTreeNode[] {
  return [...nodes].sort((a, b) => {
    const oa = DECREE_CHILD_ORDER[a.docType] ?? 99;
    const ob = DECREE_CHILD_ORDER[b.docType] ?? 99;
    if (oa !== ob) return oa - ob;
    return a.lawName.localeCompare(b.lawName, "ko");
  });
}

function formatPromulgationMeta(row: RawRuleRow): string {
  const parts: string[] = [];
  if (row.enforcement_date) {
    parts.push(`[시행 ${formatRawRuleDate(row.enforcement_date)}]`);
  }
  const promParts: string[] = [];
  if (row.promulgation_number) promParts.push(row.promulgation_number);
  if (row.promulgation_date) promParts.push(formatRawRuleDate(row.promulgation_date));
  if (promParts.length) {
    parts.push(`[${promParts.join(", ")}]`);
  }
  return parts.join(" ");
}

export function formatRawRuleDate(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  return s;
}

export function rawRuleNodeLabel(row: RawRuleRow): string {
  const displayRow = { ...row, law_name: effectiveRawRuleName(row) };
  const meta = formatPromulgationMeta(displayRow);
  return meta ? `${displayRow.law_name} ${meta}` : displayRow.law_name;
}

function rowToTreeNode(row: RawRuleRow): RawRuleTreeNode {
  const lawName = effectiveRawRuleName(row);
  return {
    id: row.internal_id,
    lawId: row.internal_id,
    lawName,
    docType: classifyRawRuleRow(row),
    lawType: row.law_type,
    enforcementDate: row.enforcement_date,
    promulgationDate: row.promulgation_date,
    promulgationNumber: row.promulgation_number,
    department: row.department,
    children: [],
  };
}

function sortLawRootChildren(
  nodes: RawRuleTreeNode[],
  rootKey: string,
): RawRuleTreeNode[] {
  const primary = primaryDecreeName(rootKey);
  return [...nodes]
    .sort((a, b) => {
      if (a.lawName === primary) return -1;
      if (b.lawName === primary) return 1;
      const oa = DOC_TYPE_ORDER[a.docType] ?? 99;
      const ob = DOC_TYPE_ORDER[b.docType] ?? 99;
      if (oa !== ob) return oa - ob;
      return a.lawName.localeCompare(b.lawName, "ko");
    })
    .map((n) => ({
      ...n,
      children: sortTreeNodes(n.children),
    }));
}

function sortTreeNodes(nodes: RawRuleTreeNode[]): RawRuleTreeNode[] {
  return [...nodes]
    .sort((a, b) => {
      const oa = DOC_TYPE_ORDER[a.docType] ?? 99;
      const ob = DOC_TYPE_ORDER[b.docType] ?? 99;
      if (oa !== ob) return oa - ob;
      return a.lawName.localeCompare(b.lawName, "ko");
    })
    .map((n) => ({
      ...n,
      children: sortTreeNodes(n.children),
    }));
}

function findPrimaryDecreeNode(
  groupRoot: RawRuleTreeNode,
  rootKey: string,
): RawRuleTreeNode | null {
  const target = primaryDecreeName(rootKey);
  return (
    groupRoot.children.find(
      (c) => c.docType === "시행령" && c.lawName === target,
    ) ?? null
  );
}

function supplementLawRowsFromSmartLaw(
  gubun: string,
  rows: RawRuleRow[],
): RawRuleRow[] {
  const names = GUBUN_SUPPLEMENT_LAW_NAMES[gubun];
  if (!names?.length) return rows;

  const hasLaw = (lawName: string) =>
    rows.some(
      (r) =>
        effectiveRawRuleName(r) === lawName &&
        classifyRawRuleRow(r) === "법률",
    );

  const missing = names.filter((n) => !hasLaw(n));
  if (missing.length === 0) return rows;

  const smartPath = path.resolve(getSmartLawSqliteDbPath().trim());
  if (!fs.existsSync(smartPath)) return rows;

  const db = new DatabaseSync(smartPath, { readOnly: true });
  const placeholders = missing.map(() => "?").join(", ");
  const smartRows = stmtAll<{
    law_id: string;
    law_name_kr: string;
    promulgation_no: string | null;
    promulgation_date: string | null;
    enforcement_date: string | null;
    contact_department_name: string | null;
    ministry_name: string | null;
  }>(
    db,
    `
    SELECT
      l.law_id,
      l.law_name_kr,
      v.promulgation_no,
      v.promulgation_date,
      v.enforcement_date,
      v.contact_department_name,
      l.ministry_name
    FROM laws l
    INNER JOIN law_versions v ON v.law_id = l.id AND v.is_current = 1
    WHERE l.law_name_kr IN (${placeholders})
    `,
    missing,
  );

  const extra: RawRuleRow[] = smartRows.map((r) => ({
    internal_id: `${SMART_LAW_DETAIL_PREFIX}${r.law_id}`,
    law_id: r.law_id,
    law_name: r.law_name_kr,
    law_type: "법률",
    promulgation_date: r.promulgation_date,
    promulgation_number: r.promulgation_no,
    department: r.contact_department_name ?? r.ministry_name,
    enforcement_date: r.enforcement_date,
    content: null,
    parent_internal_id: null,
    meta_info: null,
    gubun,
  }));

  return [...rows, ...extra];
}

function buildGroupTree(rows: RawRuleRow[], rootKey: string): RawRuleTreeNode {
  const lawRow = rows.find(
    (r) =>
      classifyRawRuleRow(r) === "법률" &&
      effectiveRawRuleName(r) === rootKey,
  );
  const namedRow = rows.find((r) => effectiveRawRuleName(r) === rootKey);

  let groupRoot: RawRuleTreeNode;
  if (lawRow) {
    groupRoot = rowToTreeNode(lawRow);
  } else if (namedRow) {
    // 상위 법률 미수집 — 동명 최상위 문서를 루트로 (가상 법률 노드 방지)
    groupRoot = rowToTreeNode(namedRow);
  } else {
    groupRoot = {
      id: `virtual:${rootKey}`,
      lawId: "",
      lawName: rootKey,
      docType: "법률",
      lawType: "법률",
      enforcementDate: null,
      promulgationDate: null,
      promulgationNumber: null,
      department: null,
      virtual: true,
      children: [],
    };
  }

  const rootRow = lawRow ?? namedRow ?? null;

  const nodeById = new Map<string, RawRuleTreeNode>();
  for (const row of rows) {
    if (rootRow && row.internal_id === rootRow.internal_id) continue;
    nodeById.set(row.internal_id, rowToTreeNode(row));
  }

  const secondaryDecrees: RawRuleTreeNode[] = [];
  const decreeChildren: RawRuleTreeNode[] = [];
  const rootLevelRules: RawRuleTreeNode[] = [];
  const others: RawRuleTreeNode[] = [];

  for (const row of rows) {
    if (rootRow && row.internal_id === rootRow.internal_id) continue;
    const node = nodeById.get(row.internal_id);
    if (!node) continue;

    const docType = node.docType;
    if (docType === "시행령") {
      if (isPrimaryDecree(rootKey, node.lawName)) {
        groupRoot.children.push(node);
      } else {
        secondaryDecrees.push(node);
      }
      continue;
    }
    if (belongsUnderPrimaryDecree(rootKey, node)) {
      decreeChildren.push(node);
      continue;
    }
    if (docType === "시행규칙") {
      rootLevelRules.push(node);
      continue;
    }
    others.push(node);
  }

  const decreeNode = findPrimaryDecreeNode(groupRoot, rootKey);
  if (decreeNode) {
    decreeNode.children.push(...decreeChildren);
    decreeNode.children = sortDecreeChildren(decreeNode.children);
  } else {
    rootLevelRules.push(...decreeChildren);
  }

  groupRoot.children.push(...secondaryDecrees, ...rootLevelRules, ...others);
  groupRoot.children = sortLawRootChildren(groupRoot.children, rootKey);

  return groupRoot;
}

function hasParentInternalLinks(rows: RawRuleRow[]): boolean {
  return rows.some((r) => (r.parent_internal_id ?? "").trim() !== "");
}

/** parent_internal_id 기반 트리 (재취합 DB) */
function buildRawRuleTreeFromParents(rows: RawRuleRow[]): RawRuleTreeNode[] {
  const nodeById = new Map<string, RawRuleTreeNode>();
  for (const row of rows) {
    nodeById.set(row.internal_id, rowToTreeNode(row));
  }

  const roots: RawRuleTreeNode[] = [];
  for (const row of rows) {
    const node = nodeById.get(row.internal_id);
    if (!node) continue;
    const parentId = (row.parent_internal_id ?? "").trim();
    const parent = parentId ? nodeById.get(parentId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return sortTreeNodes(roots);
}

export function listRawRuleRowsByGubun(gubun: string): RawRuleRow[] {
  const db = openRawRuleDb();
  return stmtAll<RawRuleRow>(
    db,
    `
    SELECT
      ${RAW_RULE_SELECT_COLUMNS}
    FROM raw
    WHERE gubun = ?
    ORDER BY law_name COLLATE NOCASE
    `,
    [gubun],
  );
}

export function buildRawRuleTree(gubun: string): RawRuleTreeNode[] {
  const baseRows = listRawRuleRowsByGubun(gubun);

  if (hasParentInternalLinks(baseRows)) {
    return buildRawRuleTreeFromParents(baseRows);
  }

  const rows = supplementLawRowsFromSmartLaw(gubun, baseRows);

  const groups = new Map<string, RawRuleRow[]>();

  for (const row of rows) {
    const key = extractRawRuleRootKey(
      effectiveRawRuleName(row),
      gubun,
      row.law_type,
    );
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const trees = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "ko"))
    .map(([rootKey, groupRows]) => buildGroupTree(groupRows, rootKey));

  return sortTreeNodes(trees);
}

/** 일반법령 「전체」— 구분별 트리를 합쳐 법령명 기준 중복 제거 */
export function buildRawRuleTreeAll(): RawRuleTreeNode[] {
  const gubuns = listRawRuleGubuns();
  const byName = new Map<string, RawRuleTreeNode>();
  for (const g of gubuns) {
    for (const node of buildRawRuleTree(g)) {
      const key = node.lawName.trim();
      if (!key || byName.has(key)) continue;
      byName.set(key, node);
    }
  }
  return sortTreeNodes([...byName.values()]);
}

export function getRawRuleCategoryStatsAll() {
  const gubuns = listRawRuleGubuns();
  let totalRows = 0;
  let rawRuleRows = 0;
  let customsActRows = 0;
  let noticeRows = 0;
  let hasCustomsActLaw = false;
  const byDocType: Record<string, number> = {};
  for (const g of gubuns) {
    const s = getRawRuleCategoryStats(g);
    totalRows += s.totalRows;
    rawRuleRows += s.rawRuleRows ?? 0;
    customsActRows += s.customsActRows;
    noticeRows += s.noticeRows;
    hasCustomsActLaw = hasCustomsActLaw || s.hasCustomsActLaw;
    for (const [k, v] of Object.entries(s.byDocType ?? {})) {
      byDocType[k] = (byDocType[k] ?? 0) + (v as number);
    }
  }
  return {
    totalRows,
    rawRuleRows,
    rootGroups: buildRawRuleTreeAll().length,
    hasCustomsActLaw,
    customsActRows,
    byDocType,
    noticeRows,
  };
}

function getSmartLawRawRuleDetail(externalLawId: string): RawRuleDetail | null {
  const smartPath = path.resolve(getSmartLawSqliteDbPath().trim());
  if (!fs.existsSync(smartPath)) return null;

  const db = new DatabaseSync(smartPath, { readOnly: true });
  const row = db
    .prepare(
      `
      SELECT
        v.id AS version_id,
        l.law_id,
        l.law_name_kr,
        v.promulgation_no,
        v.promulgation_date,
        v.enforcement_date,
        v.contact_department_name,
        l.ministry_name
      FROM laws l
      INNER JOIN law_versions v ON v.law_id = l.id AND v.is_current = 1
      WHERE l.law_id = ?
      LIMIT 1
      `,
    )
    .get(externalLawId) as
    | {
        version_id: number;
        law_id: string;
        law_name_kr: string;
        promulgation_no: string | null;
        promulgation_date: string | null;
        enforcement_date: string | null;
        contact_department_name: string | null;
        ministry_name: string | null;
      }
    | undefined;

  if (!row) return null;

  const articleRows = stmtAll<{
    id: number;
    article_no: string | null;
    article_title: string | null;
    article_content: string | null;
  }>(
    db,
    `
    SELECT id, article_no, article_title, article_content
    FROM law_articles
    WHERE law_version_id = ?
    ORDER BY display_order ASC, id ASC
    `,
    [row.version_id],
  );

  return {
    lawId: `${SMART_LAW_DETAIL_PREFIX}${row.law_id}`,
    externalLawId: row.law_id,
    lawName: row.law_name_kr,
    docType: "법률",
    lawType: "법률",
    promulgationDate: row.promulgation_date,
    promulgationNumber: row.promulgation_no,
    department: row.contact_department_name ?? row.ministry_name,
    enforcementDate: row.enforcement_date,
    gubun: null,
    articles: articleRows.map((a, i) => ({
      id: `sla-art-${a.id}`,
      articleNo: (a.article_no ?? "").trim(),
      articleTitle:
        `${(a.article_no ?? "").trim()}${a.article_title ? `(${a.article_title})` : ""}`.trim() ||
        `제${i + 1}조`,
      content: (a.article_content ?? "").trim(),
    })),
    addendums: [],
    annexes: [],
  };
}

const ARTICLE_HEAD_RE = /(제\d+조(?:의\d+)?(?:\([^)]*\))?)/g;

export function parseRawRuleArticles(content: string): RawRuleArticle[] {
  const text = (content ?? "").trim();
  if (!text) return [];

  const matches = [...text.matchAll(ARTICLE_HEAD_RE)];
  if (matches.length === 0) {
    return [
      {
        id: "full",
        articleNo: "",
        articleTitle: "전문",
        content: text,
      },
    ];
  }

  const articles: RawRuleArticle[] = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const start = m.index ?? 0;
    const end =
      i + 1 < matches.length ? (matches[i + 1].index ?? text.length) : text.length;
    const slice = text.slice(start, end).trim();
    const headerMatch = slice.match(/^(제\d+조(?:의\d+)?(?:\([^)]*\))?)/);
    const articleNo = headerMatch?.[1] ?? m[1];
    const lineBreak = slice.indexOf("\n");
    const firstLine =
      lineBreak >= 0 ? slice.slice(0, lineBreak).trim() : slice.trim();

    articles.push({
      id: `art-${i}`,
      articleNo,
      articleTitle: firstLine || articleNo,
      content: slice,
    });
  }

  return articles;
}

export function getRawRuleDetail(lawId: string): RawRuleDetail | null {
  if (lawId.startsWith(SMART_LAW_DETAIL_PREFIX)) {
    return getSmartLawRawRuleDetail(lawId.slice(SMART_LAW_DETAIL_PREFIX.length));
  }

  const db = openRawRuleDb();
  const row = db
    .prepare(
      `
      SELECT
        ${RAW_RULE_SELECT_COLUMNS}
      FROM raw
      WHERE internal_id = ?
      LIMIT 1
      `,
    )
    .get(lawId) as RawRuleRow | undefined;

  if (!row) return null;

  const lawName = effectiveRawRuleName(row);

  const addendumRows = stmtAll<{
    id: number;
    addendum_date: string | null;
    addendum_content: string | null;
  }>(
    db,
    `
    SELECT id, addendum_date, addendum_content
    FROM raw_addendum
    WHERE internal_id = ?
    ORDER BY id
    `,
    [lawId],
  );

  const annexRows = stmtAll<{
    id: number;
    annex_no: string | null;
    annex_title: string | null;
    annex_link: string | null;
  }>(
    db,
    `
    SELECT id, annex_no, annex_title, annex_link
    FROM raw_annex
    WHERE internal_id = ?
    ORDER BY id
    `,
    [lawId],
  );

  return {
    lawId: row.internal_id,
    externalLawId: row.law_id,
    lawName,
    docType: classifyRawRuleRow(row),
    lawType: row.law_type,
    promulgationDate: row.promulgation_date,
    promulgationNumber: row.promulgation_number,
    department: row.department,
    enforcementDate: row.enforcement_date,
    gubun: row.gubun,
    articles: parseRawRuleArticles(row.content ?? ""),
    addendums: addendumRows.map((a) => ({
      id: a.id,
      promulgationDate: a.addendum_date,
      promulgationNumber: null,
      content: a.addendum_content ?? "",
    })),
    annexes: annexRows.map((a) => ({
      id: a.id,
      annexNumber: a.annex_no,
      annexTitle: a.annex_title,
      annexContent: null,
      annexFileLink: a.annex_link,
    })),
  };
}

export function getRawRuleCategoryStats(gubun: string) {
  const baseRows = listRawRuleRowsByGubun(gubun);
  const rows = hasParentInternalLinks(baseRows)
    ? baseRows
    : supplementLawRowsFromSmartLaw(gubun, baseRows);
  const byType = new Map<string, number>();
  for (const row of rows) {
    const dt = classifyRawRuleRow(row);
    byType.set(dt, (byType.get(dt) ?? 0) + 1);
  }
  const roots = new Set(
    rows.map((r) =>
      extractRawRuleRootKey(effectiveRawRuleName(r), gubun, r.law_type),
    ),
  );
  const noticeRows =
    (byType.get("고시") ?? 0) +
    (byType.get("훈령") ?? 0) +
    (byType.get("공고") ?? 0);
  return {
    totalRows: rows.length,
    rawRuleRows: baseRows.length,
    rootGroups: roots.size,
    hasCustomsActLaw: rows.some(
      (r) => effectiveRawRuleName(r) === "관세법",
    ),
    customsActRows: rows.filter(
      (r) =>
        extractRawRuleRootKey(
          effectiveRawRuleName(r),
          gubun,
          r.law_type,
        ) === "관세법",
    ).length,
    byDocType: Object.fromEntries(byType),
    noticeRows,
  };
}

export function listRawRuleGubuns(): string[] {
  const db = openRawRuleDb();
  const rows = stmtAll<{ gubun: string }>(
    db,
    "SELECT DISTINCT gubun FROM raw WHERE gubun IS NOT NULL AND gubun != '' ORDER BY gubun",
  );
  return rows.map((r) => r.gubun);
}
