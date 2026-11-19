import type { ClipWorldHsClassificationCaseSortKey } from "@/app/lib/clip-world-hs-classification-cases-shared";
import { CLIP_WORLD_HS_CLASSIFICATION_CASE_SORT_KEYS } from "@/app/lib/clip-world-hs-classification-cases-shared";

export type ClipWorldHsClassificationCasesListState = {
  registeredFrom: string;
  registeredTo: string;
  country: string;
  effectivePeriod: string;
  keywordField: string;
  keyword: string;
  page: number;
  pageSize: number;
  sort: ClipWorldHsClassificationCaseSortKey;
  sortDir: "asc" | "desc";
};

function str(v: string | null): string {
  return (v ?? "").trim();
}

function normalizeSort(raw: string | null): ClipWorldHsClassificationCaseSortKey {
  const s = str(raw) || "registered_date";
  return (
    CLIP_WORLD_HS_CLASSIFICATION_CASE_SORT_KEYS as readonly string[]
  ).includes(s)
    ? (s as ClipWorldHsClassificationCaseSortKey)
    : "registered_date";
}

export function listStateToSearchParams(
  state: ClipWorldHsClassificationCasesListState,
  extra?: { listPage?: number; sidePage?: number },
): URLSearchParams {
  const u = new URLSearchParams();
  if (state.registeredFrom) u.set("registeredFrom", state.registeredFrom);
  if (state.registeredTo) u.set("registeredTo", state.registeredTo);
  if (state.country) u.set("country", state.country);
  if (state.effectivePeriod) u.set("effectivePeriod", state.effectivePeriod);
  if (state.keyword.trim()) u.set("keyword", state.keyword.trim());
  u.set("keywordField", state.keywordField || "title");
  u.set("page", String(Math.max(1, state.page)));
  u.set("pageSize", String(state.pageSize));
  u.set("sort", state.sort);
  u.set("dir", state.sortDir);
  if (extra?.listPage != null && extra.listPage > 0) {
    u.set("listPage", String(extra.listPage));
  }
  if (extra?.sidePage != null && extra.sidePage > 0) {
    u.set("sidePage", String(extra.sidePage));
  }
  return u;
}

const IGNORED_QUERY_KEYS = new Set([
  "sidePage",
  "listPage",
  "caseId",
  "embed",
]);

export function searchParamsToListState(
  sp: URLSearchParams,
): ClipWorldHsClassificationCasesListState | null {
  if (![...sp.keys()].some((k) => !IGNORED_QUERY_KEYS.has(k))) {
    return null;
  }
  const pageRaw = Number(sp.get("listPage") ?? sp.get("page") ?? "1");
  const pageSizeRaw = Number(sp.get("pageSize") ?? "10");
  return {
    registeredFrom: str(sp.get("registeredFrom")),
    registeredTo: str(sp.get("registeredTo")),
    country: str(sp.get("country")),
    effectivePeriod: str(sp.get("effectivePeriod")),
    keywordField: str(sp.get("keywordField")) || "title",
    keyword: str(sp.get("keyword")),
    page: Math.max(1, Number.isFinite(pageRaw) ? Math.floor(pageRaw) : 1),
    pageSize: Math.min(
      100,
      Math.max(5, Number.isFinite(pageSizeRaw) ? Math.floor(pageSizeRaw) : 10),
    ),
    sort: normalizeSort(sp.get("sort")),
    sortDir: sp.get("dir")?.trim().toLowerCase() === "asc" ? "asc" : "desc",
  };
}

export function sidePageFromSearchParams(sp: URLSearchParams): number {
  const n = Number(sp.get("sidePage") ?? "1");
  return Math.max(1, Number.isFinite(n) ? Math.floor(n) : 1);
}

export function listPageFromSearchParams(sp: URLSearchParams): number | null {
  const raw = sp.get("listPage");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : null;
}

const CASES_BASE = "/item-classification/world-hs-classification-cases";

function copyEmbed(sp: URLSearchParams, target: URLSearchParams): void {
  if (sp.get("embed") === "1") target.set("embed", "1");
}

export function worldHsClassificationCasesPageHref(
  sp: URLSearchParams,
  opts?: {
    caseId?: string | null;
    listPage?: number;
    sidePage?: number;
    state?: ClipWorldHsClassificationCasesListState | null;
  },
): string {
  const state =
    opts?.state ??
    searchParamsToListState(sp) ??
    ({
      registeredFrom: "",
      registeredTo: "",
      country: "",
      effectivePeriod: "",
      keywordField: "title",
      keyword: "",
      page: 1,
      pageSize: 10,
      sort: "registered_date",
      sortDir: "desc",
    } as ClipWorldHsClassificationCasesListState);

  const listPage =
    opts?.listPage ??
    listPageFromSearchParams(sp) ??
    state.page;
  const sidePage = opts?.sidePage ?? sidePageFromSearchParams(sp);

  const u = listStateToSearchParams(
    { ...state, page: listPage },
    { listPage, sidePage: opts?.caseId ? sidePage : undefined },
  );

  const caseId = opts?.caseId?.trim();
  if (caseId) u.set("caseId", caseId);
  copyEmbed(sp, u);

  const qs = u.toString();
  return qs ? `${CASES_BASE}?${qs}` : CASES_BASE;
}
