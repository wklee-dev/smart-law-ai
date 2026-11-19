"use client";

import { CasSearchButton } from "@/app/components/search-action-buttons";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { HsExplanatoryDualPanes } from "@/app/components/hs-explanatory-dual-panes";
import { TariffItemsTable } from "@/app/components/tariff-items-table";
import {
  type TariffItemRow,
  buildTariffDetailHref,
  buildTariffHeadingHref,
  chapterCodeFromHeading,
  formatHsCodeDotted,
  isTariffEmbedContext,
  normalizeHeadingCode,
  normalizeHsDigits,
  parseHsSearchInput,
  withTariffEmbedParam,
} from "@/app/tariff/lib/tariff-hs-display";
import {
  loadTariffScheduleNav,
  lookupTariffHs,
  saveNavFromHsLookup,
} from "@/app/tariff/lib/tariff-schedule-nav";

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
  tongchim?: { available: boolean; message: string; panes: Pane };
  section?: Pane | null;
  chapter?: Pane | null;
  heading?: Pane | null;
};

type MainTab = "tongchim" | "section" | "chapter" | "heading";
type Lang = "ko" | "en" | "other";

type HeadingRow = {
  record_uuid: string;
  heading_code: string;
  heading_name: string;
  heading_name_en: string;
};

function normalizeTwoCode(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (!d.length) return "";
  return d.slice(0, 2).padStart(2, "0");
}

function TariffHeadingDetailInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const storedNav = useMemo(() => loadTariffScheduleNav(), []);

  const countryCode = (
    searchParams.get("countryCode") ??
    storedNav?.countryCode ??
    "KR"
  ).toUpperCase();
  const year = Number(
    searchParams.get("year") ?? storedNav?.year ?? "2026",
  );
  const sectionCode = normalizeTwoCode(
    searchParams.get("sectionCode") ?? storedNav?.sectionCode ?? "",
  );
  const chapterCodeRaw = normalizeTwoCode(
    searchParams.get("chapterCode") ?? storedNav?.chapterCode ?? "",
  );
  const headingCodeFromQuery = normalizeHeadingCode(
    searchParams.get("headingCode") ?? storedNav?.headingCode ?? "",
  );
  const hsCodeFromQuery = normalizeHsDigits(searchParams.get("hsCode") ?? "");
  const chapterCode =
    chapterCodeRaw || chapterCodeFromHeading(headingCodeFromQuery);

  const [headings, setHeadings] = useState<HeadingRow[]>([]);
  const [headingsLoading, setHeadingsLoading] = useState(false);
  const [headingsErr, setHeadingsErr] = useState<string | null>(null);
  const [chapterMeta, setChapterMeta] = useState<{
    chapter: { nameKr: string; nameEn: string; sectionCode: string } | null;
    section: { nameKr: string; nameEn: string; code: string } | null;
  } | null>(null);
  const [selectedHeadingCode, setSelectedHeadingCode] = useState<string>(
    headingCodeFromQuery,
  );
  const [tariffItems, setTariffItems] = useState<TariffItemRow[]>([]);
  const [tariffItemsLoading, setTariffItemsLoading] = useState(false);
  const [tariffItemsErr, setTariffItemsErr] = useState<string | null>(null);

  const [detail, setDetail] = useState<DetailJson | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState<string | null>(null);
  const [mainTab, setMainTab] = useState<MainTab>("heading");
  const [leftLang, setLeftLang] = useState<Lang>("ko");
  const [rightLang, setRightLang] = useState<Lang>("en");
  const [searchQ, setSearchQ] = useState("");
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [hsSearchLoading, setHsSearchLoading] = useState(false);

  const hsDivision = countryCode === "KR" ? "KR" : "WCO";
  const hsDetailSourceDivision = "WCO";

  useEffect(() => {
    if (hsCodeFromQuery) {
      setSearchQ(formatHsCodeDotted(hsCodeFromQuery));
    }
  }, [hsCodeFromQuery]);

  const updateHeadingInUrl = useCallback(
    (headingCode: string) => {
      const q = withTariffEmbedParam(new URLSearchParams(searchParams.toString()));
      q.set("headingCode", headingCode);
      router.replace(
        `/item-classification/tariff-schedule/heading?${q.toString()}`,
      );
    },
    [router, searchParams],
  );

  const backToChapter = useCallback(() => {
    router.back();
  }, [router]);

  const submitSearch = useCallback(async () => {
    const q = searchQ.trim();
    if (!q) return;

    if (parseHsSearchInput(q)) {
      setHsSearchLoading(true);
      setSearchErr(null);
      try {
        const lookup = await lookupTariffHs(countryCode, year, q);
        saveNavFromHsLookup(countryCode, year, lookup);
        router.push(
          buildTariffHeadingHref({
            countryCode,
            year,
            sectionCode: lookup.sectionCode,
            chapterCode: lookup.chapterCode,
            headingCode: lookup.headingCode,
            hsCode: lookup.matchedHsCode || lookup.hsCode,
            embed: isTariffEmbedContext(),
          }),
        );
      } catch (e) {
        setSearchErr(e instanceof Error ? e.message : String(e));
      } finally {
        setHsSearchLoading(false);
      }
      return;
    }

    setSearchErr("HS 코드(4자리 이상)를 입력하세요.");
  }, [countryCode, router, searchQ, year]);

  useEffect(() => {
    if (!chapterCode || !headingCodeFromQuery) return;
    const needsSync =
      !searchParams.get("chapterCode") ||
      !searchParams.get("headingCode") ||
      !searchParams.get("countryCode");
    if (!needsSync) return;
    const q = withTariffEmbedParam(
      new URLSearchParams({
        countryCode,
        year: String(year),
        sectionCode,
        chapterCode,
        headingCode: headingCodeFromQuery,
      }),
    );
    if (hsCodeFromQuery) q.set("hsCode", hsCodeFromQuery);
    router.replace(
      `/item-classification/tariff-schedule/heading?${q.toString()}`,
    );
  }, [
    chapterCode,
    countryCode,
    headingCodeFromQuery,
    hsCodeFromQuery,
    router,
    searchParams,
    sectionCode,
    year,
  ]);

  useEffect(() => {
    if (!countryCode || !Number.isFinite(year) || !chapterCode) return;
    let cancelled = false;
    void (async () => {
      setHeadingsLoading(true);
      setHeadingsErr(null);
      try {
        const q = new URLSearchParams({
          countryCode,
          year: String(year),
          chapterCode,
        });
        const res = await fetch(`/api/tariff/schedule/headings?${q.toString()}`, {
          cache: "no-store",
        });
        const data = (await res.json()) as {
          ok: boolean;
          headings?: HeadingRow[];
          chapter?: {
            nameKr: string;
            nameEn: string;
            sectionCode: string;
          } | null;
          section?: {
            nameKr: string;
            nameEn: string;
            code: string;
          } | null;
          error?: string;
        };
        if (!res.ok || !data.ok) {
          throw new Error(data.error || "호 목록 로드 실패");
        }
        if (!cancelled) {
          setHeadings(data.headings ?? []);
          setChapterMeta({
            chapter: data.chapter
              ? {
                  nameKr: data.chapter.nameKr,
                  nameEn: data.chapter.nameEn,
                  sectionCode: data.chapter.sectionCode,
                }
              : null,
            section: data.section
              ? {
                  nameKr: data.section.nameKr,
                  nameEn: data.section.nameEn,
                  code: data.section.code,
                }
              : null,
          });
        }
      } catch (e) {
        if (!cancelled) {
          setHeadingsErr(e instanceof Error ? e.message : String(e));
          setHeadings([]);
        }
      } finally {
        if (!cancelled) setHeadingsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chapterCode, countryCode, year]);

  useEffect(() => {
    if (headingCodeFromQuery) {
      setSelectedHeadingCode(headingCodeFromQuery);
    }
  }, [headingCodeFromQuery]);

  useEffect(() => {
    const current = normalizeHeadingCode(
      selectedHeadingCode || headingCodeFromQuery,
    );
    const exists = headings.some(
      (h) => normalizeHeadingCode(h.heading_code) === current,
    );
    if (exists || !headings.length) return;
    const first = normalizeHeadingCode(headings[0]?.heading_code ?? "");
    if (!first) return;
    setSelectedHeadingCode(first);
    updateHeadingInUrl(first);
  }, [headings, headingCodeFromQuery, selectedHeadingCode, updateHeadingInUrl]);

  useEffect(() => {
    if (!selectedHeadingCode) {
      setTariffItems([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      setTariffItemsLoading(true);
      setTariffItemsErr(null);
      try {
        const q = new URLSearchParams({
          countryCode,
          year: String(year),
          headingCode: selectedHeadingCode,
        });
        const res = await fetch(`/api/tariff/schedule/items?${q.toString()}`, {
          cache: "no-store",
        });
        const data = (await res.json()) as {
          ok: boolean;
          items?: TariffItemRow[];
          error?: string;
        };
        if (!res.ok || !data.ok) {
          throw new Error(data.error || "세부 목록 로드 실패");
        }
        if (!cancelled) setTariffItems(data.items ?? []);
      } catch (e) {
        if (!cancelled) {
          setTariffItemsErr(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setTariffItemsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [countryCode, selectedHeadingCode, year]);

  useEffect(() => {
    if (!selectedHeadingCode) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      setDetailLoading(true);
      setDetailErr(null);
      try {
        const p1 = new URLSearchParams({
          division: hsDivision,
          scheduleYear: String(year),
          chapterCode,
          headingCode: selectedHeadingCode,
          preferLatestHsManual: "1",
        });
        const r1 = await fetch(`/api/tariff/hs-explanatory/resolve-meta?${p1}`, {
          cache: "no-store",
        });
        const j1 = (await r1.json()) as {
          ok: boolean;
          id?: number;
          error?: string;
        };
        if (!r1.ok || !j1.ok || !j1.id) {
          throw new Error(j1.error || "해설 메타 조회 실패");
        }
        const r2 = await fetch(
          `/api/tariff/hs-explanatory/detail?id=${j1.id}&division=${encodeURIComponent(hsDetailSourceDivision)}`,
          { cache: "no-store" },
        );
        const j2 = (await r2.json()) as DetailJson;
        if (!r2.ok || !j2.ok) {
          throw new Error(j2.error || "해설 본문 로드 실패");
        }
        if (!cancelled) setDetail(j2);
      } catch (e) {
        if (!cancelled) {
          setDetailErr(e instanceof Error ? e.message : String(e));
          setDetail(null);
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chapterCode, hsDivision, selectedHeadingCode, year]);

  useEffect(() => {
    if (selectedHeadingCode) setMainTab("heading");
  }, [selectedHeadingCode]);

  const currentPane = useMemo((): Pane | null => {
    if (!detail?.ok) return null;
    if (mainTab === "tongchim") return detail.tongchim?.panes ?? null;
    if (mainTab === "section") return detail.section ?? null;
    if (mainTab === "chapter") return detail.chapter ?? null;
    return detail.heading ?? null;
  }, [detail, mainTab]);

  const selectedHeading = headings.find(
    (h) => normalizeHeadingCode(h.heading_code) === selectedHeadingCode,
  );

  const effectiveSectionCode =
    sectionCode || chapterMeta?.section?.code || "";

  const majorRateHs = useMemo(() => {
    if (hsCodeFromQuery.length >= 10) return hsCodeFromQuery;
    const leaf = tariffItems.find(
      (r) => normalizeHsDigits(r.hs_code).length >= 10,
    );
    return leaf ? normalizeHsDigits(leaf.hs_code) : "";
  }, [hsCodeFromQuery, tariffItems]);

  const openMajorRates = useCallback(() => {
    if (!majorRateHs) {
      setSearchErr("주요세율을 보려면 10자리 HS 코드를 검색하거나 표에서 선택하세요.");
      return;
    }
    router.push(
      buildTariffDetailHref({
        hsCode: majorRateHs,
        countryCode,
        year,
        sectionCode: effectiveSectionCode,
        chapterCode,
        headingCode: selectedHeadingCode,
        embed: isTariffEmbedContext(),
      }),
    );
  }, [
    chapterCode,
    countryCode,
    effectiveSectionCode,
    majorRateHs,
    router,
    selectedHeadingCode,
    year,
  ]);

  const crumbBtn =
    "inline-flex max-w-[14rem] items-center gap-1 rounded border border-slate-300 bg-slate-50 px-2 py-1 text-xs text-slate-800 hover:bg-white";
  const explBtn =
    "shrink-0 rounded border border-[#1e2f4f]/40 bg-white px-1.5 py-0.5 text-[11px] font-medium text-[#1e2f4f] hover:bg-[#1e2f4f] hover:text-white";

  const goExplanatory = useCallback((tab: MainTab) => {
    setMainTab(tab);
    requestAnimationFrame(() => {
      document
        .getElementById("tariff-hs-explanatory")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  return (
    <div className="flex h-screen min-h-[640px] flex-col bg-[#eef5fb] p-3 text-slate-900">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-base font-semibold text-slate-900">
          국내관세율 상세목록
        </h1>
        <div className="flex flex-col items-end gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1 text-sm text-slate-600">
              <span className="shrink-0">검색</span>
              <input
                className="min-w-[10rem] rounded border border-slate-300 bg-white px-2 py-1.5 font-mono text-sm"
                placeholder="예: 2106.90-9099"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitSearch();
                }}
              />
            </label>
            <CasSearchButton
              type="button"
              disabled={hsSearchLoading}
              onClick={() => void submitSearch()}
            >
              {hsSearchLoading ? "조회 중…" : "검색"}
            </CasSearchButton>
            <button
              type="button"
              onClick={backToChapter}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              ← 호 목록
            </button>
          </div>
          {searchErr ? (
            <p className="text-xs text-red-600">{searchErr}</p>
          ) : null}
        </div>
      </div>

      {/* 원본 CLIP: 부·류·호 경로 + 각 단계 [해설서] */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-2 shadow-sm">
        {chapterMeta?.section ? (
          <>
            <span className={crumbBtn} title={chapterMeta.section.nameKr}>
              <span className="truncate">
                제{effectiveSectionCode || chapterMeta.section.code}부{" "}
                {chapterMeta.section.nameKr}
              </span>
            </span>
            <button
              type="button"
              className={explBtn}
              onClick={() => goExplanatory("section")}
            >
              [해설서]
            </button>
          </>
        ) : null}
        {chapterMeta?.chapter ? (
          <>
            <span className="text-slate-400">›</span>
            <span className={crumbBtn} title={chapterMeta.chapter.nameKr}>
              <span className="truncate">
                {chapterCode}류 {chapterMeta.chapter.nameKr}
              </span>
            </span>
            <button
              type="button"
              className={explBtn}
              onClick={() => goExplanatory("chapter")}
            >
              [해설서]
            </button>
          </>
        ) : null}
        {selectedHeading ? (
          <>
            <span className="text-slate-400">›</span>
            <span
              className={`${crumbBtn} border-[#1e2f4f]/50 bg-[#eef2f7] font-medium`}
              title={selectedHeading.heading_name}
            >
              <span className="truncate">
                {selectedHeading.heading_code}호 {selectedHeading.heading_name}
              </span>
            </span>
            <button
              type="button"
              className={explBtn}
              onClick={() => goExplanatory("heading")}
            >
              [해설서]
            </button>
          </>
        ) : null}
        {hsCodeFromQuery ? (
          <>
            <span className="text-slate-400">›</span>
            <span className="font-mono text-sm font-semibold text-slate-900">
              {formatHsCodeDotted(hsCodeFromQuery)}
            </span>
          </>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        {!chapterCode && !headingCodeFromQuery ? (
          <div className="flex w-full items-center justify-center rounded border border-slate-300 bg-white p-8 text-sm text-slate-700">
            <div className="space-y-3 text-center">
              <p>호 정보가 없어 상세목록을 열 수 없습니다.</p>
              <Link
                href={
                  searchParams.get("embed") === "1"
                    ? "/item-classification/tariff-schedule?embed=1"
                    : "/item-classification/tariff-schedule"
                }
                className="inline-block rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                관세율표로 이동
              </Link>
            </div>
          </div>
        ) : (
          <>
            <aside className="w-[24rem] min-w-[20rem] overflow-y-auto rounded border border-slate-300 bg-white p-2 shadow-sm">
              {headingsLoading ? (
                <p className="text-sm text-slate-500">호 목록 불러오는 중…</p>
              ) : null}
              {headingsErr ? (
                <p className="text-sm text-red-700">{headingsErr}</p>
              ) : null}
              <ul className="space-y-0.5 text-sm">
                {headings.map((h) => {
                  const code = normalizeHeadingCode(h.heading_code);
                  const active = code === selectedHeadingCode;
                  return (
                    <li key={h.record_uuid}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedHeadingCode(code);
                          updateHeadingInUrl(code);
                        }}
                        className={`w-full rounded px-2 py-1.5 text-left leading-snug ${
                          active
                            ? "bg-[#1e2f4f] text-white"
                            : "hover:bg-slate-100"
                        }`}
                      >
                        제<span className="font-mono">{h.heading_code}</span>호{" "}
                        {h.heading_name}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </aside>

            <main className="min-w-0 flex-1 space-y-3 overflow-y-auto">
              <div className="overflow-hidden rounded border border-slate-300 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
                  <h2 className="text-sm font-semibold text-slate-800">
                    국내관세율 상세목록
                    <span className="ml-2 font-mono font-normal text-slate-600">
                      호 {selectedHeadingCode}
                    </span>
                  </h2>
                  <button
                    type="button"
                    onClick={openMajorRates}
                    disabled={!majorRateHs}
                    className="rounded border border-[#1e2f4f] bg-[#1e2f4f] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#162438] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    주요세율보기
                  </button>
                </div>
                <TariffItemsTable
                  items={tariffItems}
                  loading={tariffItemsLoading}
                  error={tariffItemsErr}
                  countryCode={countryCode}
                  year={year}
                  sectionCode={effectiveSectionCode}
                  chapterCode={chapterCode}
                  headingCode={selectedHeadingCode}
                  countryLabel={countryCode === "KR" ? "한국" : countryCode}
                  highlightHsCode={hsCodeFromQuery || undefined}
                />
              </div>

              <section
                id="tariff-hs-explanatory"
                className="flex min-h-[min(420px,40vh)] flex-col overflow-hidden rounded border border-slate-300 bg-white shadow-sm"
              >
                <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-3 py-2">
                  <h2 className="text-sm font-semibold text-slate-900">
                    HS 해설
                  </h2>
                  <p className="text-xs text-slate-500">
                    자료출처 : {detail?.sourceLabel ?? "—"}
                  </p>
                </div>
                <div className="shrink-0 border-b border-slate-200 px-2 pt-2">
                  <div className="flex flex-wrap gap-1">
                    {[
                      ["tongchim", "통칙"],
                      ["section", "부 해설"],
                      ["chapter", "류 해설"],
                      ["heading", "호 해설"],
                    ].map(([id, lab]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setMainTab(id as MainTab)}
                        className={`rounded-t px-3 py-2 text-sm ${
                          mainTab === id
                            ? "bg-[#1e2f4f] text-white"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`}
                      >
                        {lab}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="min-h-[200px] flex-1 overflow-y-auto p-3">
                  {detailLoading ? (
                    <p className="text-sm text-slate-500">해설 불러오는 중…</p>
                  ) : null}
                  {detailErr ? (
                    <p className="text-sm text-red-700">{detailErr}</p>
                  ) : null}
                  {detail?.ok ? (
                    <HsExplanatoryDualPanes
                      mainTab={mainTab}
                      pane={currentPane}
                      leftLang={leftLang}
                      rightLang={rightLang}
                      setLeftLang={setLeftLang}
                      setRightLang={setRightLang}
                      gridClassName="grid min-h-[160px] gap-3 lg:grid-cols-2"
                      innerScrollerClassName="min-h-[140px] flex-1 overflow-y-auto p-3 text-sm leading-relaxed text-slate-800"
                    />
                  ) : null}
                </div>
              </section>
            </main>
          </>
        )}
      </div>
    </div>
  );
}

export default function TariffHeadingDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-[#eef5fb] p-4 text-sm text-slate-500">
          불러오는 중…
        </div>
      }
    >
      <TariffHeadingDetailInner />
    </Suspense>
  );
}
