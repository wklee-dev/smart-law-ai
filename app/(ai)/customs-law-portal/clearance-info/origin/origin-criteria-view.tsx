"use client";

import {
  CasCard,
  CasPageHeader,
  CasPageShell,
  CasSearchButton,
  CasSubNavTabs,
} from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import {
  CLASSIFICATION_FORM_INPUT_CLASS,
  ClassificationFormSplitField,
} from "@/app/(ai)/item-classification/classification-form-split-field";
import { OriginGeneralInfoPanel } from "@/app/(ai)/customs-law-portal/clearance-info/origin/origin-general-info-panel";
import { cellBorder, stickyThClass, tdClass } from "@/app/lib/sl-table-styles";
import { useCallback, useEffect, useMemo, useState } from "react";

type OriginCriteriaLayout = "clip" | "standalone";

type OriginCriteriaTab = "criteria" | "guide";

type Agreement = {
  key: string;
  name: string;
  nameKo: string;
  nameEn: string;
  itemCount: number;
};

type Category = {
  categoryCode: string;
  itemNameKo: string;
  itemNameEn: string;
};

type PsrItem = {
  id: number;
  agreementKey: string;
  agreementName: string;
  categoryCode: string;
  hsCode: string;
  division: string;
  itemNameKo: string;
  itemNameEn: string;
  preferenceCriterionKo: string;
  preferenceCriterionEn: string;
  sourceUrl: string;
  retrievedAt: string;
};

type HierarchyLevel = {
  code: string;
  level: "chapter" | "heading";
  nameKo: string;
  nameEn: string;
};

type SearchMode = "hs" | "ko" | "en";

const COLS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
const ROWS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90] as const;

/** 원본 FTA 포털 「HS 기준 안내」— DB fta_psr_hs_guide 가 비어 있어 포털 기준 고정 표시 */
const HS_VERSION_GUIDE: { name: string; year: string }[] = [
  { name: "칠레", year: "2012" },
  { name: "싱가포르", year: "2012" },
  { name: "EFTA", year: "2017" },
  { name: "ASEAN", year: "2022" },
  { name: "인도", year: "2007" },
  { name: "EU", year: "2007" },
  { name: "페루", year: "2007" },
  { name: "미국", year: "2012" },
  { name: "튀르키예", year: "2007" },
  { name: "호주", year: "2012" },
  { name: "캐나다", year: "2012" },
  { name: "중국", year: "2012" },
  { name: "뉴질랜드", year: "2007" },
  { name: "베트남", year: "2017" },
  { name: "콜롬비아", year: "2012" },
  { name: "중미", year: "2012" },
  { name: "영국", year: "2007" },
  { name: "RCEP", year: "2022" },
  { name: "이스라엘", year: "2012" },
  { name: "캄보디아", year: "2017" },
  { name: "인도네시아", year: "2017" },
  { name: "필리핀", year: "2017" },
  { name: "UAE", year: "2022" },
];

/** CLIP 원본 Guide — EFTA·ASEAN·EU·RCEP 회원국 안내 */
const CLIP_FTA_MEMBER_GUIDE = [
  {
    title: "EFTA (4개국)",
    members:
      "스위스(Switzerland), 리히텐슈타인(Liechtenstein), 아이슬란드(Iceland), 노르웨이(Norway)",
  },
  {
    title: "ASEAN (10개국)",
    members:
      "브루나이(Brunei Darussalam), 캄보디아(Cambodia), 인도네시아(Indonesia), 라오스(Lao PDR), 말레이시아(Malaysia), 미얀마(Myanmar), 필리핀(Philippines), 싱가포르(Singapore), 태국(Thailand), 베트남(Viet Nam)",
  },
  {
    title: "EU (27개국)",
    members:
      "오스트리아, 벨기에, 불가리아, 크로아티아, 키프로스, 체코, 덴마크, 에스토니아, 핀란드, 프랑스, 독일, 그리스, 헝가리, 아일랜드, 이탈리아, 라트비아, 리투아니아, 룩셍부르크, 몰타, 네덜란드, 폴란드, 포르투갈, 루마니아, 슬로바키아, 슬로베니아, 스페인, 스웨덴",
  },
  {
    title: "RCEP (15개국)",
    members:
      "한국, 중국, 일본, 호주, 뉴질랜드, 인도네시아, 말레이시아, 싱가포르, 태국, 베트남, 필리핀, 캄보디아, 라오스, 미얀마, 브루나이",
  },
] as const;

function chapterFromGrid(rowTens: number, col: number): string {
  return String(rowTens + col).padStart(2, "0");
}

function DualHeader({ ko, en }: { ko: string; en: string }) {
  return (
    <span className="inline-flex flex-col items-center justify-center gap-0.5 py-0.5 leading-tight">
      <span className="text-[13px] font-semibold text-slate-800">{ko}</span>
      <span className="text-[11px] font-normal text-slate-500">{en}</span>
    </span>
  );
}

const tdCompactClass = `${tdClass} align-middle py-0`;

function HsVersionGuideTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-center text-sm">
        <tbody>
          <tr>
            <th
              colSpan={12}
              className="border border-stone-300 bg-[#ebe8e0] px-2 py-2 text-sm font-semibold text-slate-800"
            >
              원산지 결정기준
            </th>
          </tr>
          <tr>
            {HS_VERSION_GUIDE.slice(0, 12).map((g) => (
              <td
                key={`n1-${g.name}`}
                className="border border-stone-300 px-1 py-2 text-[11px] font-medium text-slate-800"
              >
                {g.name}
              </td>
            ))}
          </tr>
          <tr>
            {HS_VERSION_GUIDE.slice(0, 12).map((g) => (
              <td
                key={`y1-${g.name}`}
                className="border border-stone-300 px-1 py-2 tabular-nums text-slate-700"
              >
                {g.year}
              </td>
            ))}
          </tr>
          <tr>
            {HS_VERSION_GUIDE.slice(12).map((g) => (
              <td
                key={`n2-${g.name}`}
                className="border border-stone-300 px-1 py-2 text-[11px] font-medium text-slate-800"
              >
                {g.name}
              </td>
            ))}
            {Array.from({
              length: Math.max(0, 12 - HS_VERSION_GUIDE.slice(12).length),
            }).map((_, i) => (
              <td key={`pad-n-${i}`} className="border border-stone-300 px-1 py-2" />
            ))}
          </tr>
          <tr>
            {HS_VERSION_GUIDE.slice(12).map((g) => (
              <td
                key={`y2-${g.name}`}
                className="border border-stone-300 px-1 py-2 tabular-nums text-slate-700"
              >
                {g.year}
              </td>
            ))}
            {Array.from({
              length: Math.max(0, 12 - HS_VERSION_GUIDE.slice(12).length),
            }).map((_, i) => (
              <td key={`pad-y-${i}`} className="border border-stone-300 px-1 py-2" />
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function ClipFtaMemberGuide() {
  return (
    <div className="rounded border border-[#e6d48a] bg-[#fff9e6] p-4">
      <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-[#8a6d1f]">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#8a6d1f] text-[11px] font-bold text-white">
          i
        </span>
        Guide
      </div>
      <ul className="space-y-3 text-[12px] leading-relaxed text-[#444]">
        {CLIP_FTA_MEMBER_GUIDE.map((block) => (
          <li key={block.title}>
            <strong className="text-[#333]">{block.title}</strong>
            <div className="mt-1">{block.members}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function OriginCriteriaView({
  layout = "clip",
}: {
  layout?: OriginCriteriaLayout;
}) {
  const isClip = layout === "clip";
  const [activeTab, setActiveTab] = useState<OriginCriteriaTab>("criteria");
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [agreementKey, setAgreementKey] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryCode, setCategoryCode] = useState<string | null>(null);
  const [searchMode, setSearchMode] = useState<SearchMode>("hs");
  const [searchQ, setSearchQ] = useState("");
  const [items, setItems] = useState<PsrItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [metaErr, setMetaErr] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [detail, setDetail] = useState<PsrItem | null>(null);
  const [view, setView] = useState<"idle" | "categories" | "results">("idle");
  const [hierarchy, setHierarchy] = useState<HierarchyLevel[]>([]);
  const [lastSearchWasHs, setLastSearchWasHs] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/fta-psr/agreements", { cache: "no-store" });
        const data = (await res.json()) as {
          ok: boolean;
          items?: Agreement[];
          error?: string;
        };
        if (!res.ok || !data.ok) throw new Error(data.error || "협정 목록 실패");
        setAgreements(data.items ?? []);
      } catch (e) {
        setMetaErr(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  const selectedAgreement = useMemo(
    () => agreements.find((a) => a.key === agreementKey) ?? null,
    [agreementKey, agreements],
  );

  const categoryMap = useMemo(() => {
    const m = new Map<string, Category>();
    for (const c of categories) m.set(c.categoryCode, c);
    return m;
  }, [categories]);

  const selectedCategory = categoryCode
    ? categoryMap.get(categoryCode) ?? null
    : null;

  const loadCategories = useCallback(async (key: string) => {
    if (!key) {
      setCategories([]);
      return;
    }
    const res = await fetch(
      `/api/fta-psr/categories?agreement_key=${encodeURIComponent(key)}`,
      { cache: "no-store" },
    );
    const data = (await res.json()) as {
      ok: boolean;
      items?: Category[];
      error?: string;
    };
    if (!res.ok || !data.ok) throw new Error(data.error || "품목분류 로드 실패");
    setCategories(data.items ?? []);
  }, []);

  const loadHierarchy = useCallback(
    async (key: string, hsCode: string) => {
      const digits = hsCode.replace(/\D/g, "");
      if (digits.length < 2) {
        setHierarchy([]);
        return;
      }
      try {
        const q = new URLSearchParams({ hs_code: digits });
        if (key) q.set("agreement_key", key);
        const res = await fetch(`/api/fta-psr/hierarchy?${q.toString()}`, {
          cache: "no-store",
        });
        const data = (await res.json()) as {
          ok: boolean;
          levels?: HierarchyLevel[];
        };
        if (res.ok && data.ok) setHierarchy(data.levels ?? []);
        else setHierarchy([]);
      } catch {
        setHierarchy([]);
      }
    },
    [],
  );

  const loadItems = useCallback(
    async (opts: {
      agreementKey: string;
      categoryCode?: string | null;
      searchMode: SearchMode;
      searchQ: string;
      page: number;
      showHierarchy?: boolean;
    }) => {
      const q = new URLSearchParams();
      if (opts.agreementKey) q.set("agreement_key", opts.agreementKey);
      if (opts.categoryCode) q.set("category_code", opts.categoryCode);
      const term = opts.searchQ.trim();
      if (term) {
        if (opts.searchMode === "hs") q.set("hs_code", term.replace(/\D/g, ""));
        else if (opts.searchMode === "ko") q.set("item_name_ko", term);
        else q.set("item_name_en", term);
      }
      q.set("page", String(opts.page));
      q.set("page_size", String(pageSize));

      if (!opts.agreementKey && !opts.categoryCode && !term) {
        throw new Error("협정 선택 또는 검색어를 입력하세요.");
      }
      if (opts.agreementKey && !opts.categoryCode && !term) {
        return null;
      }

      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(`/api/fta-psr/items?${q.toString()}`, {
          cache: "no-store",
        });
        const data = (await res.json()) as {
          ok: boolean;
          items?: PsrItem[];
          total?: number;
          totalPages?: number;
          page?: number;
          error?: string;
        };
        if (!res.ok || !data.ok) throw new Error(data.error || "조회 실패");
        setItems(data.items ?? []);
        setTotal(data.total ?? 0);
        setTotalPages(data.totalPages ?? 1);
        setPage(data.page ?? opts.page);
        setView("results");

        const hsDigits =
          opts.searchMode === "hs"
            ? term.replace(/\D/g, "")
            : opts.categoryCode?.replace(/\D/g, "") || "";
        if (opts.showHierarchy && hsDigits.length >= 2) {
          setLastSearchWasHs(true);
          await loadHierarchy(opts.agreementKey, hsDigits);
        } else if (opts.categoryCode) {
          setLastSearchWasHs(false);
          await loadHierarchy(opts.agreementKey, opts.categoryCode);
        } else {
          setLastSearchWasHs(false);
          setHierarchy([]);
        }
        return data;
      } finally {
        setLoading(false);
      }
    },
    [loadHierarchy, pageSize],
  );

  const pickAgreement = useCallback(
    async (key: string) => {
      setAgreementKey(key);
      setCategoryCode(null);
      setItems([]);
      setTotal(0);
      setDetail(null);
      setErr(null);
      setHierarchy([]);
      setLastSearchWasHs(false);
      if (!key) {
        setCategories([]);
        setView("idle");
        return;
      }
      try {
        await loadCategories(key);
        setView("categories");
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
        setView("idle");
      }
    },
    [loadCategories],
  );

  const pickCategory = useCallback(
    async (code: string) => {
      const cat = categoryMap.get(code);
      if (!cat || !agreementKey) return;
      setCategoryCode(code);
      setSearchQ(code);
      setSearchMode("hs");
      try {
        await loadItems({
          agreementKey,
          categoryCode: code,
          searchMode: "hs",
          searchQ: "",
          page: 1,
          showHierarchy: true,
        });
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    },
    [agreementKey, categoryMap, loadItems],
  );

  const submitSearch = useCallback(async () => {
    const term = searchQ.trim();
    if (!agreementKey && !term) {
      setErr("협정 선택 또는 검색어를 입력하세요.");
      return;
    }
    if (!term && agreementKey) {
      setCategoryCode(null);
      setItems([]);
      setHierarchy([]);
      setLastSearchWasHs(false);
      setView("categories");
      return;
    }

    /** HS 검색: 2자리면 류 전체, 4자리 이상이면 세번 prefix — 원본처럼 결과+계층 */
    if (searchMode === "hs") {
      const digits = term.replace(/\D/g, "");
      if (!digits) {
        setErr("HS코드를 입력하세요.");
        return;
      }
      const cat =
        digits.length === 2 ? digits.padStart(2, "0") : null;
      setCategoryCode(cat);
      try {
        await loadItems({
          agreementKey,
          categoryCode: cat,
          searchMode: "hs",
          searchQ: cat ? "" : digits,
          page: 1,
          showHierarchy: true,
        });
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
      return;
    }

    setCategoryCode(null);
    try {
      await loadItems({
        agreementKey,
        categoryCode: null,
        searchMode,
        searchQ: term,
        page: 1,
        showHierarchy: false,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [agreementKey, loadItems, searchMode, searchQ]);

  const goPage = useCallback(
    async (next: number) => {
      try {
        await loadItems({
          agreementKey,
          categoryCode,
          searchMode,
          searchQ,
          page: next,
          showHierarchy: lastSearchWasHs || Boolean(categoryCode),
        });
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    },
    [
      agreementKey,
      categoryCode,
      lastSearchWasHs,
      loadItems,
      searchMode,
      searchQ,
    ],
  );

  const ftaGrid = (
    <section
      className={
        isClip
          ? "rounded border border-stone-300 bg-white"
          : "rounded border border-slate-300 bg-white p-3 shadow-sm"
      }
    >
      {!isClip ? (
        <div className="mb-2 text-sm font-semibold text-slate-800">협정 선택</div>
      ) : null}
      <div
        className={
          isClip
            ? "grid grid-cols-2 gap-0 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
            : "grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
        }
      >
        <button
          type="button"
          onClick={() => void pickAgreement("")}
          className={
            isClip
              ? `border border-stone-300 px-2 py-2.5 text-left text-xs leading-snug transition-colors ${
                  agreementKey === ""
                    ? "bg-[#1e2f4f] text-white"
                    : "bg-[#f8f6f2] text-slate-800 hover:bg-[#ebe8e0]"
                }`
              : `rounded border px-2 py-2 text-left text-xs leading-snug transition-colors ${
                  agreementKey === ""
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                }`
          }
        >
          <div className="font-semibold">전체</div>
          <div className="opacity-80">ALL FTA</div>
        </button>
        {agreements.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={() => void pickAgreement(a.key)}
            className={
              isClip
                ? `border border-stone-300 px-2 py-2.5 text-left text-xs leading-snug transition-colors ${
                    agreementKey === a.key
                      ? "bg-[#1e2f4f] text-white"
                      : "bg-[#f8f6f2] text-slate-800 hover:bg-[#ebe8e0]"
                  }`
                : `rounded border px-2 py-2 text-left text-xs leading-snug transition-colors ${
                    agreementKey === a.key
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                  }`
            }
          >
            <div className="font-semibold">{a.nameKo}</div>
            <div className="opacity-80">{a.nameEn || a.name}</div>
          </button>
        ))}
      </div>
    </section>
  );

  const searchSection = isClip ? (
    <CasCard title="검색">
      <ClassificationFormSplitField label="검색범위">
        <div className="flex flex-wrap items-center gap-4 px-1 py-1 text-[12px] text-[#333]">
          <label className="inline-flex items-center gap-1.5">
            <input
              type="radio"
              name="psr-mode"
              checked={searchMode === "hs"}
              onChange={() => setSearchMode("hs")}
              className="h-3.5 w-3.5 border-[#d8dee6]"
            />
            품목번호
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input
              type="radio"
              name="psr-mode"
              checked={searchMode === "ko" || searchMode === "en"}
              onChange={() => setSearchMode("ko")}
              className="h-3.5 w-3.5 border-[#d8dee6]"
            />
            품목명
          </label>
        </div>
      </ClassificationFormSplitField>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-stone-300 bg-[#f8f6f2] px-3 py-2.5">
        <input
          className={`${CLASSIFICATION_FORM_INPUT_CLASS} min-w-[12rem] flex-1`}
          placeholder={
            searchMode === "hs" ? "품목번호를 입력하세요." : "품목명을 입력하세요."
          }
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submitSearch();
          }}
        />
        <CasSearchButton type="button" onClick={() => void submitSearch()}>
          조회
        </CasSearchButton>
      </div>
    </CasCard>
  ) : (
    <section className="rounded border border-slate-300 bg-white px-3 py-2.5 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-sm text-slate-700">
          <input
            type="radio"
            name="psr-mode"
            checked={searchMode === "hs"}
            onChange={() => setSearchMode("hs")}
          />
          HS코드
        </label>
        <label className="flex items-center gap-1.5 text-sm text-slate-700">
          <input
            type="radio"
            name="psr-mode"
            checked={searchMode === "ko"}
            onChange={() => setSearchMode("ko")}
          />
          한글 품목명
        </label>
        <label className="flex items-center gap-1.5 text-sm text-slate-700">
          <input
            type="radio"
            name="psr-mode"
            checked={searchMode === "en"}
            onChange={() => setSearchMode("en")}
          />
          영문 품목명
        </label>
        <input
          className="min-w-[12rem] flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
          placeholder="검색어를 입력하세요."
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submitSearch();
          }}
        />
        <CasSearchButton type="button" onClick={() => void submitSearch()}>
          검색
        </CasSearchButton>
      </div>
    </section>
  );

  const criteriaBody = (
    <>
      {metaErr ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {metaErr}
        </p>
      ) : null}

      {ftaGrid}
      {searchSection}

        {err ? (
          <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {err}
          </p>
        ) : null}

        {/* 분류 그리드 */}
        {view === "categories" && agreementKey ? (
          <section className="overflow-auto rounded border border-slate-300 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800">
              {selectedAgreement?.nameKo ?? agreementKey} — 품목분류(류) 선택
            </div>
            <table className="w-full min-w-[880px] table-fixed border-collapse text-center text-[11px] text-slate-800">
              <thead>
                <tr>
                  <th className="w-8 border border-slate-300 bg-slate-100 py-1" />
                  {COLS.map((c) => (
                    <th
                      key={c}
                      className="border border-slate-300 bg-slate-100 py-1 font-semibold"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((rowTens) => (
                  <tr key={rowTens}>
                    <th className="border border-slate-300 bg-slate-100 py-1 font-semibold">
                      {rowTens}
                    </th>
                    {COLS.map((col) => {
                      const code = chapterFromGrid(rowTens, col);
                      const cat = categoryMap.get(code);
                      return (
                        <td
                          key={code}
                          className="border border-slate-300 p-0 align-middle"
                        >
                          {cat ? (
                            <button
                              type="button"
                              onClick={() => void pickCategory(code)}
                              className="flex min-h-[3.25rem] w-full flex-col items-center justify-center gap-0.5 px-1 py-1.5 hover:bg-sky-50"
                              title={`${code} ${cat.itemNameKo}`}
                            >
                              <span className="font-medium leading-tight text-slate-900">
                                {Number(code)} {cat.itemNameKo}
                              </span>
                              <span className="line-clamp-2 text-[10px] leading-tight text-slate-500">
                                {cat.itemNameEn}
                              </span>
                            </button>
                          ) : (
                            <span className="block min-h-[3.25rem]" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

      {!isClip && view === "idle" && !loading ? (
        <section className="overflow-hidden rounded border border-slate-300 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800">
            HS 기준 안내{" "}
            <span className="font-normal text-slate-500">(FTA 협정문 기준)</span>
          </div>
          <div className="overflow-x-auto p-3">
            <HsVersionGuideTable />
            <ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-600">
              <li>
                원산지결정기준 조회는 협정별 HS 버전 기준으로 이루어지며, 해당
                협정에서 사용하는 HS 버전의 6단위(소호)를 입력해야 합니다.
              </li>
              <li>정확한 HS코드를 입력하기 위해 위 표를 참고하시기 바랍니다.</li>
              <li>
                예: 한-칠레 FTA는 HS 2012를 사용하므로, HS 2022에만 있는 세번을
                입력하면 결과가 조회되지 않습니다.
              </li>
            </ul>
          </div>
          <p className="border-t border-slate-200 px-3 py-2 text-xs text-slate-500">
            협정을 선택하거나 HS코드·품목명으로 검색하세요.
          </p>
        </section>
      ) : null}

      {isClip && view !== "results" ? <ClipFtaMemberGuide /> : null}

        {/* 결과 */}
        {view === "results" ? (
          <section className="space-y-2">
            {hierarchy.length > 0 ? (
              <table className="w-full border-collapse overflow-hidden rounded shadow-sm">
                <tbody>
                  {hierarchy.map((lv) => (
                    <tr key={`${lv.level}-${lv.code}`}>
                      <td
                        className={`${cellBorder} w-16 bg-white px-2 py-3 text-center align-middle font-mono text-sm font-semibold tabular-nums text-slate-900`}
                      >
                        {lv.code}
                      </td>
                      <td
                        className={`${cellBorder} bg-white px-4 py-3 text-center align-middle`}
                      >
                        <div className="text-[13px] font-medium leading-snug text-slate-900">
                          {lv.nameKo || "—"}
                        </div>
                        {lv.nameEn ? (
                          <div className="mt-1 text-[12px] leading-snug text-slate-500">
                            {lv.nameEn}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : selectedCategory || categoryCode ? (
              <table className="w-full border-collapse overflow-hidden rounded shadow-sm">
                <tbody>
                  <tr>
                    <td
                      className={`${cellBorder} w-14 bg-[#1e293b] px-3 py-3 text-center align-middle font-mono text-base font-semibold tabular-nums text-white`}
                    >
                      {(categoryCode ?? "").padStart(2, "0")}
                    </td>
                    <td
                      className={`${cellBorder} bg-[#1e293b] px-4 py-3 text-center align-middle text-white`}
                    >
                      <div className="text-[13px] font-medium leading-snug">
                        {selectedCategory?.itemNameKo ?? ""}
                      </div>
                      {selectedCategory?.itemNameEn ? (
                        <div className="mt-1 text-[12px] leading-snug text-slate-300">
                          {selectedCategory.itemNameEn}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                </tbody>
              </table>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-[#cfd5de] bg-white px-3 py-2 text-sm shadow-sm">
              <div>
                조회 결과{" "}
                <strong className="tabular-nums text-blue-800">
                  {total.toLocaleString()}
                </strong>
                건
                {selectedAgreement ? (
                  <span className="ml-2 text-slate-500">
                    · {selectedAgreement.nameKo}
                  </span>
                ) : (
                  <span className="ml-2 text-slate-500">· 전체 협정</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1 || loading}
                  onClick={() => void goPage(page - 1)}
                  className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-40"
                >
                  이전
                </button>
                <span className="tabular-nums text-xs text-slate-600">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages || loading}
                  onClick={() => void goPage(page + 1)}
                  className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-40"
                >
                  다음
                </button>
                {agreementKey ? (
                  <button
                    type="button"
                    onClick={() => {
                      setView("categories");
                      setItems([]);
                      setCategoryCode(null);
                    }}
                    className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                  >
                    분류 목록
                  </button>
                ) : null}
              </div>
            </div>

            <div className="overflow-auto rounded border border-[#b8c0cc] bg-white shadow-sm">
              <table className="w-full min-w-[800px] border-collapse text-sm">
                <thead>
                  <tr className="border-t-2 border-t-slate-700">
                    {!agreementKey ? (
                      <th className={stickyThClass}>
                        <DualHeader ko="협정" en="Agreement" />
                      </th>
                    ) : null}
                    <th className={`${stickyThClass} w-[7.5rem]`}>
                      <DualHeader ko="품목번호" en="HS" />
                    </th>
                    <th className={`${stickyThClass} w-[4.5rem]`}>
                      <DualHeader ko="분류" en="Division" />
                    </th>
                    <th className={`${stickyThClass} min-w-[14rem]`}>
                      <DualHeader ko="품목명" en="Item" />
                    </th>
                    <th className={`${stickyThClass} min-w-[18rem]`}>
                      <DualHeader ko="원산지기준" en="Preference Criterion" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td
                        colSpan={agreementKey ? 4 : 5}
                        className={`${cellBorder} px-3 py-12 text-center text-slate-500`}
                      >
                        조회 중…
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td
                        colSpan={agreementKey ? 4 : 5}
                        className={`${cellBorder} px-3 py-12 text-center text-slate-500`}
                      >
                        조회 결과가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    items.map((it) => (
                      <tr
                        key={`${it.agreementKey}-${it.hsCode}-${it.id}`}
                        className="cursor-pointer transition-colors hover:bg-[#f3f8fc]"
                        onClick={() => setDetail(it)}
                      >
                        {!agreementKey ? (
                          <td
                            className={`${tdClass} whitespace-nowrap px-3 py-2.5 text-center text-slate-700`}
                          >
                            {it.agreementName}
                          </td>
                        ) : null}
                        <td
                          className={`${tdClass} px-3 py-2.5 text-center font-mono text-[13px] tabular-nums text-slate-900`}
                        >
                          {it.hsCode}
                        </td>
                        <td
                          className={`${tdClass} px-2 py-2.5 text-center text-slate-800`}
                        >
                          {it.division}
                        </td>
                        <td className={`${tdClass} p-0`}>
                          <div className="flex min-h-[3.25rem] flex-col">
                            <div className="flex flex-1 items-center justify-center border-b border-dashed border-[#c5ccd6] px-3 py-2 text-center text-[13px] leading-snug text-slate-900">
                              {it.itemNameKo || "—"}
                            </div>
                            <div className="flex flex-1 items-center justify-center px-3 py-2 text-center text-[12px] leading-snug text-slate-500">
                              {it.itemNameEn || "\u00a0"}
                            </div>
                          </div>
                        </td>
                        <td className={`${tdClass} p-0`}>
                          <div className="flex min-h-[3.25rem] flex-col">
                            <div className="flex flex-1 items-center justify-center border-b border-dashed border-[#c5ccd6] px-3 py-2 text-left text-[13px] leading-snug whitespace-pre-wrap text-slate-900">
                              {it.preferenceCriterionKo || "—"}
                            </div>
                            <div
                              className={`flex flex-1 items-center justify-center px-3 py-2 text-center text-[12px] leading-snug ${
                                it.preferenceCriterionEn
                                  ? "font-medium tabular-nums tracking-wide text-slate-700"
                                  : "text-slate-400"
                              }`}
                              title={
                                it.preferenceCriterionEn
                                  ? "원산지기준 약어(영문)"
                                  : "약어 없음"
                              }
                            >
                              {it.preferenceCriterionEn || "—"}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
    </>
  );

  const detailModal = detail ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal
          onClick={() => setDetail(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-lg bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">
                원산지결정기준 상세
              </h2>
              <button
                type="button"
                className="rounded border border-slate-300 px-2 py-1 text-sm"
                onClick={() => setDetail(null)}
              >
                닫기
              </button>
            </div>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs text-slate-500">협정</dt>
                <dd>
                  {detail.agreementName} ({detail.agreementKey})
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">HS 코드</dt>
                <dd className="font-mono">{detail.hsCode}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">품목분류</dt>
                <dd>{detail.categoryCode}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">품목명(한국어)</dt>
                <dd>{detail.itemNameKo || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">품목명(영어)</dt>
                <dd>{detail.itemNameEn || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">원산지결정기준(한국어)</dt>
                <dd className="whitespace-pre-wrap rounded bg-slate-50 p-2">
                  {detail.preferenceCriterionKo || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">원산지결정기준(영어)</dt>
                <dd className="whitespace-pre-wrap rounded bg-slate-50 p-2">
                  {detail.preferenceCriterionEn || "—"}
                </dd>
              </div>
              {detail.sourceUrl ? (
                <div>
                  <dt className="text-xs text-slate-500">출처</dt>
                  <dd>
                    <a
                      href={detail.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all text-blue-700 underline"
                    >
                      {detail.sourceUrl}
                    </a>
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>
        </div>
      ) : null;

  if (!isClip) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-[#f4f7fb] text-slate-900">
        <div className="shrink-0 px-4 py-3">
          <CasPageHeader title="협정별 원산지결정기준" />
        </div>
        <main className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
          {criteriaBody}
        </main>
        {detailModal}
      </div>
    );
  }

  return (
    <CasPageShell>
      <CasPageHeader title="원산지" />
      <CasSubNavTabs
        tabs={[
          { key: "criteria", label: "원산지결정기준" },
          { key: "guide", label: "종합정보" },
        ]}
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as OriginCriteriaTab)}
      />
      {activeTab === "criteria" ? (
        <div className="space-y-3">{criteriaBody}</div>
      ) : (
        <OriginGeneralInfoPanel />
      )}
      {detailModal}
    </CasPageShell>
  );
}
