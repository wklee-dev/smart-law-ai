"use client";

import { CasResetButton, CasSearchButton } from "@/app/components/search-action-buttons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { HsExplanatoryDualPanes } from "@/app/components/hs-explanatory-dual-panes";

/** HS 해설 DB는 WCO만 사용 (한국/KR 출처 없음) */
const HS_EXPLANATORY_DIVISION = "WCO" as const;

type SortKey = "hierarchy" | "year" | "hs" | "content";

type ListItem = {
  id: number;
  recordType: string;
  division: string;
  year: number;
  unitLevel: string;
  hsClass: string;
  contentPreview: string;
};

type Pane = {
  titleKo: string;
  titleEn: string;
  bodyKo: string;
  bodyEn: string;
  other: string;
};

type DetailJson = {
  ok: boolean;
  error?: string;
  sourceLabel?: string;
  tongchim?: {
    available: boolean;
    message: string;
    panes: Pane;
  };
  section?: Pane | null;
  chapter?: Pane | null;
  heading?: Pane | null;
};

type MainTab = "tongchim" | "section" | "chapter" | "heading";
type Lang = "ko" | "en" | "other";

/** 조회 영역: 흰 입력면 + 대비 테두리·포커스 링(가독성) */
const filterFieldClass =
  "min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 transition-[border-color,box-shadow] hover:border-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20";

/** HS분류 열: 부·류는 2자리(01), 호는 4자리(0101) — 스크린샷과 동일한 숫자 표기 */
function formatHsClassForTable(recordType: string, raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (recordType === "heading") {
    if (!digits && !raw.trim()) return "—";
    return digits.length >= 4
      ? digits.slice(0, 4)
      : digits.padStart(4, "0");
  }
  if (recordType === "section" || recordType === "chapter") {
    const d2 = digits.slice(0, 2);
    if (!d2) return raw.trim() || "—";
    return d2.padStart(2, "0");
  }
  return (digits.slice(0, 2) || "00").padStart(2, "0");
}

function SortHint({
  active,
  dir,
}: {
  active: boolean;
  dir: "asc" | "desc";
}) {
  if (!active) {
    return (
      <span className="ml-0.5 text-slate-300" aria-hidden>
        ↕
      </span>
    );
  }
  return (
    <span className="ml-0.5 text-blue-600" aria-hidden>
      {dir === "asc" ? "↑" : "↓"}
    </span>
  );
}

export default function HsExplanatoryPage() {
  const [year, setYear] = useState<number | "">("");
  const [hs, setHs] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [years, setYears] = useState<number[]>([]);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [listErr, setListErr] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("hierarchy");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [selected, setSelected] = useState<ListItem | null>(null);
  const [detail, setDetail] = useState<DetailJson | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [mainTab, setMainTab] = useState<MainTab>("heading");
  const [leftLang, setLeftLang] = useState<Lang>("ko");
  const [rightLang, setRightLang] = useState<Lang>("en");

  const effYear = useMemo(() => {
    if (year !== "" && Number.isFinite(year)) return year as number;
    return years[0] ?? 2022;
  }, [year, years]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const pageNumbers = useMemo(() => {
    const window = 10;
    const half = Math.floor(window / 2);
    let start = Math.max(1, page - half);
    const end = Math.min(totalPages, start + window - 1);
    start = Math.max(1, end - window + 1);
    const out: number[] = [];
    for (let i = start; i <= end; i += 1) out.push(i);
    return out;
  }, [page, totalPages]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setListErr(null);
    try {
      const params = new URLSearchParams();
      params.set("division", HS_EXPLANATORY_DIVISION);
      params.set("year", String(effYear));
      if (hs.trim()) params.set("hs", hs.trim());
      if (q.trim()) params.set("q", q.trim());
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      params.set("sortBy", sortBy);
      params.set("sortDir", sortDir);
      const res = await fetch(
        `/api/tariff/hs-explanatory/list?${params.toString()}`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        years?: number[];
        year?: number;
        total?: number;
        items?: ListItem[];
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `목록 오류 (${res.status})`);
      }
      if (data.years?.length) setYears(data.years);
      if (data.year != null && year === "") setYear(data.year);
      setTotal(data.total ?? 0);
      setItems(data.items ?? []);
    } catch (e) {
      setItems([]);
      setListErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [effYear, hs, q, page, pageSize, year, sortBy, sortDir]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const loadDetailById = useCallback(
    async (id: number, recordType?: ListItem["recordType"]) => {
      if (recordType) {
        setMainTab(
          recordType === "section"
            ? "section"
            : recordType === "chapter"
              ? "chapter"
              : "heading",
        );
      }
      setDetailLoading(true);
      setDetail(null);
      try {
        const params = new URLSearchParams();
        params.set("id", String(id));
        params.set("division", HS_EXPLANATORY_DIVISION);
        const res = await fetch(
          `/api/tariff/hs-explanatory/detail?${params.toString()}`,
          { cache: "no-store" },
        );
        const data = (await res.json()) as DetailJson;
        if (!res.ok || !data.ok) {
          throw new Error(data.error || `상세 오류 (${res.status})`);
        }
        setDetail(data);
      } catch (e) {
        setDetail({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      } finally {
        setDetailLoading(false);
      }
    },
    [],
  );

  const loadDetail = useCallback(
    async (row: ListItem) => {
      await loadDetailById(row.id, row.recordType);
    },
    [loadDetailById],
  );

  const onHsLinkClick = useCallback(
    async (hsCode: string) => {
      const digits = hsCode.replace(/\D/g, "");
      if (digits.length < 2) return;
      const headingCode =
        digits.length >= 4 ? digits.slice(0, 4) : digits.padStart(4, "0");
      const chapterCode = headingCode.slice(0, 2);
      try {
        const params = new URLSearchParams();
        params.set("division", HS_EXPLANATORY_DIVISION);
        params.set("scheduleYear", String(effYear));
        params.set("chapterCode", chapterCode);
        params.set("headingCode", headingCode);
        const res = await fetch(
          `/api/tariff/hs-explanatory/resolve-meta?${params.toString()}`,
          { cache: "no-store" },
        );
        const data = (await res.json()) as {
          ok: boolean;
          id?: number;
          error?: string;
        };
        if (!res.ok || !data.ok || data.id == null) {
          throw new Error(data.error || `HS ${headingCode} 해설을 찾을 수 없습니다.`);
        }
        setMainTab("heading");
        setHs(headingCode);
        setPage(1);
        await loadDetailById(data.id, "heading");
        const listRes = await fetch(
          `/api/tariff/hs-explanatory/list?${new URLSearchParams({
            division: HS_EXPLANATORY_DIVISION,
            year: String(effYear),
            hs: headingCode,
            page: "1",
            pageSize: String(pageSize),
            sortBy,
            sortDir,
          }).toString()}`,
          { cache: "no-store" },
        );
        const listData = (await listRes.json()) as {
          ok: boolean;
          items?: ListItem[];
        };
        const hit = listData.items?.find((r) => r.id === data.id);
        if (hit) setSelected(hit);
      } catch (e) {
        setDetail({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    },
    [effYear, loadDetailById, pageSize, sortBy, sortDir],
  );

  const onSelectRow = useCallback(
    (row: ListItem) => {
      setSelected(row);
      void loadDetail(row);
    },
    [loadDetail],
  );

  const toggleSort = useCallback((key: SortKey) => {
    setSortBy((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir("asc");
      return key;
    });
    setPage(1);
  }, []);

  const currentPane = useMemo(() => {
    if (!detail?.ok) return null;
    if (mainTab === "tongchim") return detail.tongchim?.panes ?? null;
    if (mainTab === "section") return detail.section ?? null;
    if (mainTab === "chapter") return detail.chapter ?? null;
    return detail.heading ?? null;
  }, [detail, mainTab]);

  const tabDefs: { id: MainTab; label: string }[] = [
    { id: "tongchim", label: "통칙" },
    { id: "section", label: "부 해설" },
    { id: "chapter", label: "류 해설" },
    { id: "heading", label: "호 해설" },
  ];

  return (
    <div className="flex h-screen min-h-[640px] w-full min-w-0 flex-col bg-slate-200/80 text-slate-900">
      <header className="shrink-0 border-b border-slate-300 bg-white px-3 py-2 shadow-sm sm:px-4">
        <h1 className="text-base font-semibold leading-tight text-slate-800">
          HS 해설서
        </h1>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-auto">
          <div className="w-full min-w-0 space-y-3 px-2 pb-3 pt-1 sm:px-4">
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-slate-100">
              <h2 className="mb-3 text-sm font-semibold tracking-tight text-slate-800">
                조회 조건
              </h2>
              <div className="flex flex-wrap items-end gap-x-5 gap-y-4">
                <fieldset className="min-w-[8rem] rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5">
                  <legend className="px-1 text-xs font-medium text-slate-700">
                    구분
                  </legend>
                  <div className="flex gap-4 text-sm text-slate-800">
                    <span className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="division"
                        className="pointer-events-none size-4 border-slate-300 text-blue-600 focus:ring-blue-500"
                        checked
                        readOnly
                        tabIndex={-1}
                        aria-label="WCO"
                      />
                      WCO
                    </span>
                  </div>
                </fieldset>
                <label className="flex min-w-[6.5rem] flex-col text-sm">
                  <span className="mb-1.5 text-xs font-medium text-slate-700">
                    년도
                  </span>
                  <select
                    className={`${filterFieldClass} cursor-pointer`}
                    value={year === "" ? effYear : year}
                    onChange={(e) =>
                      setYear(Number(e.target.value) || "")
                    }
                  >
                    {(years.length ? years : [effYear]).map((y) => (
                      <option key={y} value={y}>
                        {y}년
                      </option>
                    ))}
                  </select>
                </label>
                <label className="min-w-[7.5rem] flex flex-col text-sm">
                  <span className="mb-1.5 text-xs font-medium text-slate-700">
                    HS분류
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    className={filterFieldClass}
                    value={hs}
                    onChange={(e) => setHs(e.target.value)}
                    placeholder="예: 0103"
                  />
                </label>
                <label className="min-w-[12rem] flex-1 flex flex-col text-sm sm:min-w-[16rem]">
                  <span className="mb-1.5 text-xs font-medium text-slate-700">
                    검색어
                  </span>
                  <input
                    type="search"
                    autoComplete="off"
                    className={filterFieldClass}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="명칭·내용"
                  />
                </label>
                <div className="flex shrink-0 gap-2">
                  <CasResetButton
                    type="button"
                    onClick={() => {
                      setHs("");
                      setQ("");
                      setPage(1);
                    }}
                  />
                  <CasSearchButton
                    type="button"
                    onClick={() => {
                      setPage(1);
                      void loadList();
                    }}
                  />
                </div>
              </div>
            </section>

            {listErr ? (
              <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {listErr}
              </p>
            ) : null}

            <section className="rounded-lg border border-slate-300 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
                <span className="text-sm text-slate-600">
                  전체{" "}
                  <strong className="text-slate-900">
                    {total.toLocaleString()}
                  </strong>{" "}
                  건
                </span>
                <label className="flex items-center gap-2 text-sm">
                  페이지당
                  <select
                    className={`${filterFieldClass} inline-block w-auto min-w-[4.5rem] cursor-pointer py-1.5 pr-8`}
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value) || 10);
                      setPage(1);
                    }}
                  >
                    {[10, 20, 50].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-0 border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                      <th className="w-[3.5rem] shrink-0 whitespace-nowrap px-3 py-2 font-medium">
                        구분
                      </th>
                      <th className="w-[3.5rem] shrink-0 whitespace-nowrap px-3 py-2 font-medium">
                        <button
                          type="button"
                          className="inline-flex items-center font-medium hover:text-slate-900"
                          onClick={() => toggleSort("year")}
                        >
                          년도
                          <SortHint active={sortBy === "year"} dir={sortDir} />
                        </button>
                      </th>
                      <th className="w-[3.5rem] shrink-0 whitespace-nowrap px-3 py-2 font-medium">
                        <button
                          type="button"
                          className="inline-flex items-center font-medium hover:text-slate-900"
                          onClick={() => toggleSort("hierarchy")}
                        >
                          단위
                          <SortHint
                            active={sortBy === "hierarchy"}
                            dir={sortDir}
                          />
                        </button>
                      </th>
                      <th className="w-[4.5rem] shrink-0 whitespace-nowrap px-3 py-2 font-medium">
                        <button
                          type="button"
                          className="inline-flex items-center font-medium hover:text-slate-900"
                          onClick={() => toggleSort("hs")}
                        >
                          HS분류
                          <SortHint active={sortBy === "hs"} dir={sortDir} />
                        </button>
                      </th>
                      <th className="min-w-0 px-3 py-2 font-medium">
                        <button
                          type="button"
                          className="inline-flex items-center font-medium hover:text-slate-900"
                          onClick={() => toggleSort("content")}
                        >
                          내용
                          <SortHint
                            active={sortBy === "content"}
                            dir={sortDir}
                          />
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-3 py-8 text-center text-slate-500"
                        >
                          불러오는 중…
                        </td>
                      </tr>
                    ) : items.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-3 py-8 text-center text-slate-500"
                        >
                          데이터가 없습니다.
                        </td>
                      </tr>
                    ) : (
                      items.map((row) => {
                        const active = selected?.id === row.id;
                        return (
                          <tr
                            key={row.id}
                            onClick={() => onSelectRow(row)}
                            onKeyDown={(ev) => {
                              if (ev.key === "Enter" || ev.key === " ") {
                                ev.preventDefault();
                                onSelectRow(row);
                              }
                            }}
                            tabIndex={0}
                            role="button"
                            className={`cursor-pointer border-b border-slate-100 transition-colors hover:bg-violet-50 ${
                              active ? "bg-violet-100/90" : ""
                            }`}
                          >
                            <td className="px-3 py-2 text-slate-700">
                              {row.division}
                            </td>
                            <td className="px-3 py-2">{row.year}</td>
                            <td className="px-3 py-2">{row.unitLevel}</td>
                            <td className="px-3 py-2 font-mono">
                              {formatHsClassForTable(row.recordType, row.hsClass)}
                            </td>
                            <td className="min-w-0 px-3 py-2 text-slate-700">
                              <span className="line-clamp-2 block whitespace-pre-wrap break-words">
                                {row.contentPreview}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-1 border-t border-slate-200 px-2 py-2 text-sm">
                <button
                  type="button"
                  className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
                  disabled={page <= 1}
                  onClick={() => setPage(1)}
                  title="첫 페이지"
                >
                  |◀
                </button>
                <button
                  type="button"
                  className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ◀
                </button>
                {pageNumbers.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPage(n)}
                    className={`min-w-[2rem] rounded px-2 py-1 ${
                      n === page
                        ? "bg-[#1e2f4f] font-semibold text-white"
                        : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <button
                  type="button"
                  className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
                  disabled={page >= totalPages}
                  onClick={() =>
                    setPage((p) => Math.min(totalPages, p + 1))
                  }
                >
                  ▶
                </button>
                <button
                  type="button"
                  className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
                  disabled={page >= totalPages}
                  onClick={() => setPage(totalPages)}
                  title="마지막 페이지"
                >
                  ▶|
                </button>
              </div>
            </section>
          </div>
        </div>

        <section
          className="flex h-[min(460px,42vh)] min-h-[260px] shrink-0 flex-col border-t-2 border-slate-300 bg-white shadow-[0_-4px_14px_rgba(15,23,42,0.08)]"
          aria-label="상세보기"
        >
          <div className="flex shrink-0 items-start justify-between gap-2 border-b border-slate-200 px-4 py-2">
            <h2 className="text-sm font-semibold text-slate-900 before:mr-1 before:text-slate-400 before:content-['|']">
              상세보기
            </h2>
            <p className="text-right text-xs text-slate-500">
              자료출처 :{" "}
              {detail?.sourceLabel ??
                (selected
                  ? `${selected.year}년도 WCO 해설서`
                  : "—")}
            </p>
          </div>

          <div className="shrink-0 border-b border-slate-200 px-2 pt-2">
            <div className="flex flex-wrap gap-1">
              {tabDefs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setMainTab(t.id)}
                  className={`rounded-t px-3 py-2 text-sm font-medium ${
                    mainTab === t.id
                      ? "bg-[#1e2f4f] text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
            {!selected ? (
              <p className="text-sm text-slate-500">
                목록에서 행을 선택하면 통칙·부·류·호 해설이 표시됩니다. (기본 탭:
                호 해설)
              </p>
            ) : detailLoading ? (
              <p className="text-sm text-slate-500">상세 불러오는 중…</p>
            ) : detail && !detail.ok ? (
              <p className="text-sm text-red-600">{detail.error}</p>
            ) : (
              <HsExplanatoryDualPanes
                mainTab={mainTab}
                pane={currentPane}
                leftLang={leftLang}
                rightLang={rightLang}
                setLeftLang={setLeftLang}
                setRightLang={setRightLang}
                onHsLinkClick={(code) => void onHsLinkClick(code)}
                gridClassName="grid h-full min-h-[240px] gap-3 md:grid-cols-2"
                paneClassName="flex h-full min-h-0 flex-col overflow-hidden rounded border border-slate-200 bg-slate-50/90"
                innerScrollerClassName="min-h-0 flex-1 overflow-y-auto p-3 text-sm leading-relaxed text-slate-800"
              />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
