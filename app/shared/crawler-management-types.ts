export type CrawlerScheduleKind = "week" | "year" | "page" | "range" | "manual";

export type CrawlerRunRow = {
  id: number;
  crawler_id: string;
  crawler_name: string;
  command: string;
  cwd: string | null;
  status: string;
  started_at: string;
  finished_at: string | null;
  exit_code: number | null;
  log_path: string | null;
  period: string | null;
};

/** 엑셀 「리스트」 시트 A~O열 + 실행 정보 */
export type CrawlerListItem = {
  id: string;
  excelRow: number;
  /** A 구분 */
  category: string;
  /** B 진행사항(상태) — 실행 중이면 「실행중」 */
  status: string;
  /** C 대상 */
  name: string;
  /** D 진행사항 */
  progress: string;
  /** E 매주최신화 대상 */
  weekly: string;
  /** F 비고 */
  note: string;
  /** G·H·I Source (사이트 > 메뉴 > 하위메뉴) */
  source: string;
  /** smart_law_ai 내장 주간 크롤러 키 (scripts/crawlers/weekly-crawlers.json) */
  weeklyKey: string | null;
  /** J 대상 */
  target: string;
  /** K DB */
  db: string;
  dbIsSmartLaw: boolean;
  /** L embedding */
  embedding: string;
  /** M 프로그램 위치 */
  programLocationRaw: string;
  programDir: string | null;
  /** N 첨부파일 */
  attachment: string;
  /** O 호출 */
  callRaw: string;
  /** P 검증 */
  verifyRaw: string;
  primaryCommand: string | null;
  scheduleKind: CrawlerScheduleKind;
  latestPeriod: string | null;
  nextPeriod: string | null;
  nextCommand: string | null;
  lastRun: CrawlerRunRow | null;
};

/** smart_law_ai 내장 주간 크롤러 (scripts/crawlers) */
export type WeeklyCrawlerItem = {
  key: string;
  /** 엑셀 대상 (Source 사이트) */
  names: string[];
  dir: string;
  dirExists: boolean;
  originalDir: string;
  command: string;
  interactive: string | null;
  queued: boolean;
  lastRun: CrawlerRunRow | null;
};

export type WeeklyBatchState = {
  queue: string[];
  current: string | null;
  startedAt: string;
  done: number;
  total: number;
};
