import fs from "node:fs";
import path from "node:path";
import { getSmartLawAttachRoot } from "@/app/lib/smart-law-db";
import { getSmartLawSqliteDbPath } from "@/app/lib/smart-law-sqlite-paths";
import { preferCDrive } from "@/app/lib/drive-fallback";

/** @deprecated admin_rules.db — 행정규칙 크롤·조회는 smart_law_ai.db 통합 */

/** 옵션: 크롤러 config.json (참고용) */
const DEFAULT_CONFIG = preferCDrive("C:/Crawling/law_crawler/config.json");

export type AdminRulesConfigSource = {
  param: string;
  /** DB 분류 — `행정규칙`·`admin_rule` → admin_rule*, `법령`·`raw_rule` → raw_rule* */
  gubun?: string;
  table_name: string;
  description: string;
  url: string;
  note?: string;
  category?: string;
};

export type AdminRulesConfigFile = {
  db_name: string;
  /** SQLite 파일 경로 — `admin_rules_table_catalog` 의 테이블을 담음 */
  db_path: string;
  base_dir: string;
  attach_dir: string;
  sources: AdminRulesConfigSource[];
};

export function getAdminRulesConfigPath(): string {
  return (
    process.env.ADMIN_RULES_CONFIG_PATH?.trim() || DEFAULT_CONFIG
  );
}

export function getAdminRulesDbPath(): string {
  const env = process.env.ADMIN_RULES_DB_PATH?.trim();
  if (env) return env;
  return getSmartLawSqliteDbPath();
}

/** 첨부 루트: 그 안에 `ATTACH/<table_name>/…` 또는 `<table_name>/…` 가 오는 상위 폴더 (예: `law_crawler`). DB `local_path`가 `attach/ATTACH/...` 형태여도 `attach/` 접두어는 자동으로 떼고 시도한다. */
export function getAdminRulesAttachRoot(): string {
  return (
    process.env.ADMIN_RULES_ATTACH_ROOT?.trim() ||
    path.join(getSmartLawAttachRoot(), "ATTACH")
  );
}

export function readAdminRulesConfig(): AdminRulesConfigFile {
  const p = getAdminRulesConfigPath();
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw) as AdminRulesConfigFile;
}

function isUnderDir(base: string, candidate: string): boolean {
  const baseResolved = path.resolve(base);
  const candidateResolved = path.resolve(candidate);
  if (candidateResolved === baseResolved) return true;
  const rel = path.relative(baseResolved, candidateResolved);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/** 첨부 검색 기준 루트 — env `ADMIN_RULES_ATTACH_ROOT` (+ ATTACH 하위) */
function getAttachSearchRoots(): string[] {
  const envRoot = path.resolve(getAdminRulesAttachRoot().trim());
  const candidates = [
    envRoot,
    path.resolve(envRoot, "ATTACH"),
    path.resolve(envRoot, ".."),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of candidates) {
    const k = path.resolve(c);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

/** `…/ATTACH/<param>/…` 또는 `…/<param>/…` 아래인지 */
function isUnderTableAttachDir(abs: string, tableName: string): boolean {
  const absResolved = path.resolve(abs);
  for (const root of getAttachSearchRoots()) {
    for (const prefix of [
      path.resolve(root, "ATTACH", tableName),
      path.resolve(root, tableName),
    ]) {
      if (isUnderDir(prefix, absResolved)) return true;
    }
  }
  return false;
}

function relStartsWithAttachSegment(rel: string): boolean {
  const head = rel.split(path.sep)[0];
  return head !== undefined && head.toUpperCase() === "ATTACH";
}

/** DB local_path 후보: attach/ATTACH/… → ATTACH/… 로 정리한 경로를 먼저 시도 */
function relativePathCandidatesForAttach(normalized: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (s: string) => {
    const t = s.replace(/^[\\/]+/, "");
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };
  const noAttachDirPrefix = normalized.replace(/^attach[\\/]+/i, "");
  if (noAttachDirPrefix !== normalized) push(noAttachDirPrefix);
  push(normalized);
  return out;
}

export function resolveAdminAttachmentPath(
  tableName: string,
  localPathRaw: string,
): string {
  const normalized = localPathRaw.replaceAll("\\", path.sep).replaceAll(
    "/",
    path.sep,
  );
  const fileName = path.basename(normalized);

  const tryAbs: string[] = [];
  const push = (p: string) => {
    const k = path.resolve(p);
    if (!tryAbs.includes(k)) tryAbs.push(k);
  };

  if (path.isAbsolute(normalized)) {
    push(normalized);
  }

  for (const root of getAttachSearchRoots()) {
    for (const rel of relativePathCandidatesForAttach(normalized)) {
      push(path.resolve(root, rel));
      if (
        !rel.startsWith(`${tableName}${path.sep}`) &&
        !relStartsWithAttachSegment(rel)
      ) {
        push(path.resolve(root, tableName, rel));
      }
    }
    if (fileName) {
      push(path.resolve(root, "ATTACH", tableName, fileName));
      push(path.resolve(root, tableName, fileName));
    }
  }

  const secure = tryAbs.filter((abs) => isUnderTableAttachDir(abs, tableName));

  for (const abs of secure) {
    if (fs.existsSync(abs)) return abs;
  }
  if (secure.length > 0) return secure[0];
  throw new Error("attachment path outside table folder");
}
