"use client";

import { CasPageHeader, CasPageShell } from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import type {
  PortalFtaChapter,
  PortalFtaGuide,
  PortalFtaHsItem,
  PortalFtaNation,
  PortalFtaYearRate,
} from "@/app/lib/fta-portal-rate-shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./fta-agreement-rates.module.css";

const SOURCE_URL =
  "https://www.customs.go.kr/ftaportalkor/ad/ftaCnvn/txrtInfo.do?mi=3526";
const PAGE_WINDOW = 10;

type QType = "hs" | "ko" | "en";

function visiblePages(current: number, total: number): number[] {
  const tp = Math.max(1, Math.floor(total));
  const cur = Math.min(Math.max(1, Math.floor(current)), tp);
  const start = Math.floor((cur - 1) / PAGE_WINDOW) * PAGE_WINDOW + 1;
  const end = Math.min(start + PAGE_WINDOW - 1, tp);
  const out: number[] = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}

function nationLabel(n: PortalFtaNation): { kr: string; en: string } {
  if (n.nation_code === "ALL") {
    return { kr: "전체", en: "All FTA" };
  }
  const kr = n.nation_name_kr || n.nation_code;
  const en = n.nation_name_en || "";
  // "RCEP-중국 China" 형태면 영문 분리
  if (!en && /\s[A-Za-z]/.test(kr)) {
    const m = kr.match(/^(.+?)\s+([A-Za-z].*)$/);
    if (m) return { kr: m[1], en: m[2] };
  }
  return { kr, en };
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  const data = (await res.json()) as T & { ok?: boolean; error?: string };
  if (!res.ok || data.ok === false) {
    throw new Error(data.error ?? res.statusText);
  }
  return data;
}

export function FtaAgreementRatesView() {
  const [ready, setReady] = useState(true);
  const [nations, setNations] = useState<PortalFtaNation[]>([]);
  const [guides, setGuides] = useState<PortalFtaGuide[]>([]);
  const [metaLoading, setMetaLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [ftaCd, setFtaCd] = useState("ALL");
  const [qType, setQType] = useState<QType>("hs");
  const [qDraft, setQDraft] = useState("");
  const [qApplied, setQApplied] = useState("");
  const [qTypeApplied, setQTypeApplied] = useState<QType>("hs");
  const [chapter, setChapter] = useState("");
  const [hasQuery, setHasQuery] = useState(false);

  const [chapters, setChapters] = useState<PortalFtaChapter[]>([]);
  const [chaptersLoading, setChaptersLoading] = useState(false);

  const [rows, setRows] = useState<PortalFtaHsItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [itemsLoading, setItemsLoading] = useState(false);

  const [yearOpen, setYearOpen] = useState(false);
  const [yearHs, setYearHs] = useState("");
  const [yearNation, setYearNation] = useState("");
  const [yearRows, setYearRows] = useState<PortalFtaYearRate[]>([]);
  const [yearLoading, setYearLoading] = useState(false);

  const selected = useMemo(
    () => nations.find((n) => n.nation_code === ftaCd) ?? null,
    [nations, ftaCd],
  );

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const showChapterGrid =
    !hasQuery && ftaCd !== "ALL" && !chapter && chapters.length > 0;
  const showGuides = !hasQuery && ftaCd === "ALL" && !chapter;
  const showResults = hasQuery || Boolean(chapter);

  const loadMeta = useCallback(async () => {
    setMetaLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{
        ready: boolean;
        portal?: boolean;
        nations: PortalFtaNation[];
        guides: PortalFtaGuide[];
      }>("/api/cl-fta-rate/meta");
      setReady(data.ready);
      setNations(data.nations ?? []);
      setGuides(data.guides ?? []);
      if ((data.nations ?? []).some((n) => n.nation_code === "ALL")) {
        setFtaCd("ALL");
      } else if (data.nations?.[0]) {
        setFtaCd(data.nations[0].nation_code);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "메타 조회 실패");
      setReady(false);
    } finally {
      setMetaLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  const loadChapters = useCallback(async (cd: string) => {
    if (!cd || cd === "ALL") {
      setChapters([]);
      return;
    }
    setChaptersLoading(true);
    try {
      const data = await fetchJson<{ chapters: PortalFtaChapter[] }>(
        `/api/cl-fta-rate/chapters?ftaCd=${encodeURIComponent(cd)}`,
      );
      setChapters(data.chapters ?? []);
    } catch (e) {
      setChapters([]);
      setError(e instanceof Error ? e.message : "류 목록 조회 실패");
    } finally {
      setChaptersLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadChapters(ftaCd);
  }, [ftaCd, loadChapters]);

  const loadItems = useCallback(async () => {
    if (!hasQuery && !chapter) {
      setRows([]);
      setTotal(0);
      return;
    }
    setItemsLoading(true);
    setError(null);
    try {
      const u = new URLSearchParams();
      if (ftaCd) u.set("ftaCd", ftaCd);
      if (chapter) u.set("chapter", chapter);
      if (hasQuery && qApplied) {
        u.set("q", qApplied);
        u.set("qType", qTypeApplied);
      }
      u.set("page", String(page));
      u.set("pageSize", String(pageSize));
      const data = await fetchJson<{
        rows: PortalFtaHsItem[];
        total: number;
      }>(`/api/cl-fta-rate/items?${u}`);
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      setRows([]);
      setTotal(0);
      setError(e instanceof Error ? e.message : "품목 조회 실패");
    } finally {
      setItemsLoading(false);
    }
  }, [
    chapter,
    ftaCd,
    hasQuery,
    page,
    pageSize,
    qApplied,
    qTypeApplied,
  ]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const selectNation = (code: string) => {
    setFtaCd(code);
    setChapter("");
    setHasQuery(false);
    setQApplied("");
    setPage(1);
    setRows([]);
    setTotal(0);
  };

  const runSearch = () => {
    const q = qDraft.trim();
    if (!q) {
      setError("검색어를 입력하세요.");
      return;
    }
    if (qType === "hs" && !/\d/.test(q)) {
      setError("HS코드 숫자를 입력하세요.");
      return;
    }
    setError(null);
    setChapter("");
    setQApplied(q);
    setQTypeApplied(qType);
    setHasQuery(true);
    setPage(1);
  };

  const openChapter = (code: string) => {
    setChapter(code);
    setHasQuery(false);
    setQApplied("");
    setPage(1);
  };

  const clearDrill = () => {
    setChapter("");
    setHasQuery(false);
    setQApplied("");
    setPage(1);
    setRows([]);
    setTotal(0);
  };

  const openYears = async (row: PortalFtaHsItem) => {
    setYearOpen(true);
    setYearHs(row.hs_no);
    setYearNation(row.nation_code);
    setYearRows([]);
    setYearLoading(true);
    try {
      const u = new URLSearchParams({
        ftaCd: row.nation_code,
        hs: row.hs_no,
      });
      const data = await fetchJson<{ rows: PortalFtaYearRate[] }>(
        `/api/cl-fta-rate/years?${u}`,
      );
      setYearRows(data.rows ?? []);
    } catch (e) {
      setYearRows([]);
      setError(e instanceof Error ? e.message : "연도별 세율 조회 실패");
    } finally {
      setYearLoading(false);
    }
  };

  return (
    <CasPageShell>
      <CasPageHeader title="협정별세율정보" />
      <div className={styles.root}>
        <div className={styles.card}>
          <div className={styles.toolbar}>
            <h2 className={styles.title}>FTA 수입세율 조회</h2>
            <a
              className={styles.sourceLink}
              href={SOURCE_URL}
              target="_blank"
              rel="noreferrer"
            >
              FTA 포털 원문
            </a>
          </div>

          {error ? <p className={styles.error}>{error}</p> : null}
          {metaLoading ? (
            <p className={styles.muted}>불러오는 중…</p>
          ) : !ready ? (
            <p className={styles.empty}>
              협정별 세율 데이터가 없습니다. FTA 포털 크롤 후 다시 확인하세요.
            </p>
          ) : (
            <>
              <div className={styles.nationGrid} role="listbox" aria-label="협정">
                {nations.map((n) => {
                  const label = nationLabel(n);
                  const on = n.nation_code === ftaCd;
                  return (
                    <button
                      key={n.nation_code}
                      type="button"
                      role="option"
                      aria-selected={on}
                      className={`${styles.nationBtn} ${on ? styles.nationBtnOn : ""}`}
                      onClick={() => selectNation(n.nation_code)}
                    >
                      <span className={styles.nationKr}>{label.kr}</span>
                      {label.en ? (
                        <span className={styles.nationEn}>{label.en}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              <div className={styles.searchBar}>
                <div className={styles.radios}>
                  {(
                    [
                      ["hs", "HS코드"],
                      ["ko", "한글 품목명"],
                      ["en", "영문 품목명"],
                    ] as const
                  ).map(([v, label]) => (
                    <label key={v} className={styles.radio}>
                      <input
                        type="radio"
                        name="fta-qtype"
                        checked={qType === v}
                        onChange={() => setQType(v)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <input
                  className={styles.searchInput}
                  value={qDraft}
                  placeholder="검색어를 입력하세요."
                  onChange={(e) => setQDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") runSearch();
                  }}
                />
                <button
                  type="button"
                  className={styles.searchBtn}
                  onClick={runSearch}
                  disabled={itemsLoading}
                >
                  검색
                </button>
              </div>

              {showGuides ? (
                <>
                  <h3 className={styles.sectionTitle}>
                    HS 기준 안내 (FTA 협정문 기준)
                  </h3>
                  {guides.length === 0 ? (
                    <p className={styles.empty}>안내 데이터가 없습니다.</p>
                  ) : (
                    <table className={styles.guideTable}>
                      <tbody>
                        {guides.map((g, i) => (
                          <tr key={`${g.agreement_name}-${i}`}>
                            <th scope="row">
                              {g.agreement_name || g.guide_type}
                            </th>
                            <td>HS {g.base_ref || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              ) : null}

              {showChapterGrid ? (
                <>
                  <h3 className={styles.sectionTitle}>
                    {selected
                      ? `${nationLabel(selected).kr}${
                          nationLabel(selected).en
                            ? ` ${nationLabel(selected).en}`
                            : ""
                        } · HS 류`
                      : "HS 류"}
                  </h3>
                  {chaptersLoading ? (
                    <p className={styles.muted}>류 목록 불러오는 중…</p>
                  ) : (
                    <div className={styles.chapterGrid}>
                      {chapters.map((c) => (
                        <button
                          key={c.chapter_code}
                          type="button"
                          className={styles.chapterCell}
                          onClick={() => openChapter(c.chapter_code)}
                        >
                          <span className={styles.chapterCode}>
                            {c.chapter_code}
                          </span>
                          <span className={styles.chapterKr}>
                            {c.chapter_name_kr}
                          </span>
                          {c.chapter_name_en ? (
                            <span className={styles.chapterEn}>
                              {c.chapter_name_en}
                            </span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : null}

              {showResults ? (
                <>
                  <div className={styles.resultMeta}>
                    <span>
                      {selected
                        ? `${nationLabel(selected).kr}`
                        : ftaCd}
                      {chapter ? ` · 류 ${chapter}` : ""}
                      {hasQuery ? ` · 검색 “${qApplied}”` : ""}
                      {` · ${total.toLocaleString("ko-KR")}건`}
                    </span>
                    <button
                      type="button"
                      className={styles.backLink}
                      onClick={clearDrill}
                    >
                      ← 협정 화면으로
                    </button>
                  </div>

                  {itemsLoading ? (
                    <p className={styles.muted}>조회 중…</p>
                  ) : rows.length === 0 ? (
                    <p className={styles.empty}>
                      조회결과가 존재하지 않습니다.
                    </p>
                  ) : (
                    <div className={styles.tableWrap}>
                      <table className={styles.grid}>
                        <thead>
                          <tr>
                            {ftaCd === "ALL" ? <th>협정</th> : null}
                            <th>품목번호 HS</th>
                            <th>분류 Division</th>
                            <th>품목명 Item</th>
                            <th>협정세율 Preferential Tariff</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r) => (
                            <tr
                              key={`${r.nation_code}-${r.hs_no}-${r.division}`}
                            >
                              {ftaCd === "ALL" ? (
                                <td>{r.nation_name_kr || r.nation_code}</td>
                              ) : null}
                              <td className={styles.hs}>{r.hs_no}</td>
                              <td className={styles.div}>
                                {r.division || "—"}
                              </td>
                              <td>{r.item_name || "—"}</td>
                              <td className={styles.rate}>
                                {r.base_year || r.base_rate ? (
                                  <div className={styles.rateCell}>
                                    <span>
                                      {r.base_year
                                        ? `${r.base_year}: ${r.base_rate || "—"}`
                                        : r.base_rate || "—"}
                                    </span>
                                    {r.has_year_link || r.hs_no.length >= 10 ? (
                                      <button
                                        type="button"
                                        className={styles.yearBtn}
                                        onClick={() => void openYears(r)}
                                      >
                                        모든 연도 보기
                                      </button>
                                    ) : null}
                                  </div>
                                ) : (
                                  "—"
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {totalPages > 1 ? (
                    <div className={styles.pager}>
                      <button
                        type="button"
                        className={styles.pageBtn}
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        ‹
                      </button>
                      {visiblePages(page, totalPages).map((p) => (
                        <button
                          key={p}
                          type="button"
                          className={`${styles.pageBtn} ${
                            p === page ? styles.pageBtnOn : ""
                          }`}
                          onClick={() => setPage(p)}
                        >
                          {p}
                        </button>
                      ))}
                      <button
                        type="button"
                        className={styles.pageBtn}
                        disabled={page >= totalPages}
                        onClick={() =>
                          setPage((p) => Math.min(totalPages, p + 1))
                        }
                      >
                        ›
                      </button>
                    </div>
                  ) : null}
                </>
              ) : null}

              {!showGuides &&
              !showChapterGrid &&
              !showResults &&
              !chaptersLoading ? (
                <p className={styles.empty}>
                  협정을 선택하거나 검색어를 입력하세요.
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>

      {yearOpen ? (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={() => setYearOpen(false)}
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-modal
            aria-label="모든 연도보기"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHead}>
              <span>모든 연도보기</span>
              <button
                type="button"
                className={styles.modalClose}
                aria-label="닫기"
                onClick={() => setYearOpen(false)}
              >
                ×
              </button>
            </div>
            <div className={styles.modalBody}>
              <p className={styles.modalMeta}>
                {yearNation} · HS {yearHs}
              </p>
              {yearLoading ? (
                <p className={styles.muted}>조회 중…</p>
              ) : yearRows.length === 0 ? (
                <p className={styles.muted}>연도별 세율 데이터가 없습니다.</p>
              ) : (
                <table className={styles.yearTable}>
                  <thead>
                    <tr>
                      <th>연도 Year</th>
                      <th>협정세율 Agreement rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {yearRows.map((y) => (
                      <tr key={y.rate_year}>
                        <td>{y.rate_year}</td>
                        <td>{y.agreement_rate || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </CasPageShell>
  );
}
