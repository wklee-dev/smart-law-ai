import fs from "node:fs";
import path from "node:path";

export type WeeklyCrawlerDef = {
  key: string;
  /** scripts/crawlers 하위 폴더명 (원본 D:\Crawling\<dir>) */
  dir: string;
  /** 엑셀 「리스트」 C열 대상 + G열 Source 사이트 */
  excel: { name: string; site: string }[];
  /** 로그인 등 사용자 조작이 필요한 경우 안내 문구 */
  interactive?: string;
  env?: Record<string, string>;
  /** python 인자 목록 (순차 실행) */
  steps: string[][];
};

export function getWeeklyCrawlersRoot(): string {
  return (
    process.env.WEEKLY_CRAWLERS_DIR?.trim() ||
    path.join(process.cwd(), "scripts", "crawlers")
  );
}

let cache: { mtimeMs: number; defs: WeeklyCrawlerDef[] } | null = null;

export function loadWeeklyCrawlers(): WeeklyCrawlerDef[] {
  const file = path.join(getWeeklyCrawlersRoot(), "weekly-crawlers.json");
  if (!fs.existsSync(file)) return [];
  const mtimeMs = fs.statSync(file).mtimeMs;
  if (cache?.mtimeMs === mtimeMs) return cache.defs;
  const json = JSON.parse(fs.readFileSync(file, "utf8")) as {
    crawlers?: WeeklyCrawlerDef[];
  };
  const defs = json.crawlers ?? [];
  cache = { mtimeMs, defs };
  return defs;
}

export function findWeeklyCrawlerKey(name: string, source: string): string | null {
  const hit = loadWeeklyCrawlers().find((d) =>
    d.excel.some((e) => e.name === name && source.startsWith(e.site)),
  );
  return hit?.key ?? null;
}
