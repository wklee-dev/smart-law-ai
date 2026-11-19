"use client";

import type {
  ClFtaAttachRow,
  ClFtaGeneralRow,
  ClFtaHs2Option,
  ClFtaNationRow,
  ClFtaPsrDetail,
  ClFtaPsrRef,
  ClFtaPsrRow,
  ClFtaRateCdRow,
  ClFtaRateListRow,
  ClFtaRecomRow,
} from "@/app/lib/cl-fta-rate-shared";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import styles from "./cl-fta-agreement-tariff.module.css";

const SOURCE_URL = "https://www.clhs.co.kr/Y2026/duty.asp";
const PAGE_WINDOW = 10;

type OverviewTab = "general" | "nations";
type DetailTab = "rate" | "psr";

/** 원본 CL 세계지도 핀 위치 */
const MAP_PINS: { ftaCd: string; left: string; top: string }[] = [
  { ftaCd: "FCL", left: "22%", top: "72%" },
  { ftaCd: "FPE", left: "24%", top: "68%" },
  { ftaCd: "FCO", left: "26%", top: "62%" },
  { ftaCd: "FUS", left: "20%", top: "38%" },
  { ftaCd: "FCA", left: "18%", top: "28%" },
  { ftaCd: "FCE", left: "28%", top: "52%" },
  { ftaCd: "FEF", left: "48%", top: "28%" },
  { ftaCd: "FEU", left: "50%", top: "34%" },
  { ftaCd: "FGB", left: "46%", top: "30%" },
  { ftaCd: "FTR", left: "56%", top: "38%" },
  { ftaCd: "FIL", left: "58%", top: "44%" },
  { ftaCd: "FAE", left: "60%", top: "48%" },
  { ftaCd: "FIN", left: "68%", top: "48%" },
  { ftaCd: "FCN", left: "76%", top: "40%" },
  { ftaCd: "FAS", left: "78%", top: "56%" },
  { ftaCd: "FSG", left: "80%", top: "58%" },
  { ftaCd: "FVN", left: "79%", top: "52%" },
  { ftaCd: "FID", left: "81%", top: "62%" },
  { ftaCd: "FPH", left: "84%", top: "54%" },
  { ftaCd: "FKH", left: "78%", top: "54%" },
  { ftaCd: "FAU", left: "86%", top: "72%" },
  { ftaCd: "FNZ", left: "92%", top: "78%" },
  { ftaCd: "FRC", left: "74%", top: "46%" },
];

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  const data = (await res.json()) as T & { ok?: boolean; error?: string };
  if (!res.ok || data.ok === false) {
    throw new Error(data.error ?? res.statusText);
  }
  return data;
}

function formatHskDisp(code: string): string {
  const d = code.replace(/\D/g, "");
  if (d.length < 4) return code;
  if (d.length <= 6) return `${d.slice(0, 4)}.${d.slice(4)}`;
  return `${d.slice(0, 4)}.${d.slice(4, 6)}-${d.slice(6)}`;
}

function formatEffect(dt: string): string {
  if (!dt) return "—";
  const m = dt.match(/^(\d{4})-(\d{2})-(\d{2})(.*)$/);
  if (!m) return dt;
  const base = `${Number(m[1])}년 ${Number(m[2])}월 ${Number(m[3])}일`;
  return m[4] ? `${base}${m[4]}` : base;
}

function splitBullets(text: string): string[] {
  return text
    .split(/\n|(?=-\s)/)
    .map((s) => s.replace(/^-\s*/, "").trim())
    .filter(Boolean);
}

function PsrTxtWithRefs({
  text,
  refs,
  onRef,
}: {
  text: string;
  refs: ClFtaPsrRef[];
  onRef: (ref: ClFtaPsrRef) => void;
}) {
  if (!text.includes("[참조]") || refs.length === 0) {
    return <div className={styles.sectionBody}>{text || "-"}</div>;
  }
  const parts = text.split(/\[참조\]/g);
  return (
    <div className={styles.sectionBody}>
      {parts.map((part, i) => (
        <Fragment key={`psr-part-${i}`}>
          {part}
          {i < parts.length - 1 ? (
            <button
              type="button"
              className={styles.refLink}
              onClick={() =>
                onRef(refs[Math.min(i, refs.length - 1)]!)
              }
            >
              [참조]
            </button>
          ) : null}
        </Fragment>
      ))}
    </div>
  );
}

function agreementTitle(n: ClFtaNationRow): string {
  // "칠레 FTA" → 칠레, "EFTA"는 그대로 (끝의 FTA만 떼면 E가 됨)
  const raw = (n.fta_nm || n.nation_nm || n.fta_cd).trim();
  const nm = raw.replace(/\s+FTA\s*$/i, "").trim() || raw;
  return `한·${nm} FTA`;
}

function visiblePages(current: number, total: number): number[] {
  const tp = Math.max(1, Math.floor(total));
  const cur = Math.min(Math.max(1, Math.floor(current)), tp);
  const start = Math.floor((cur - 1) / PAGE_WINDOW) * PAGE_WINDOW + 1;
  const end = Math.min(start + PAGE_WINDOW - 1, tp);
  const out: number[] = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}

/** 추천품목 표 rowspan */
function recomSpanMeta(rows: ClFtaRecomRow[]): {
  itemSpan: number[];
  qtySpan: number[];
} {
  const itemSpan = new Array(rows.length).fill(0);
  const qtySpan = new Array(rows.length).fill(0);
  let i = 0;
  while (i < rows.length) {
    let j = i + 1;
    while (j < rows.length && rows[j]!.item_nm === rows[i]!.item_nm) j++;
    itemSpan[i] = j - i;
    let k = i;
    while (k < j) {
      let m = k + 1;
      while (m < j && rows[m]!.qty_txt === rows[k]!.qty_txt) m++;
      qtySpan[k] = m - k;
      k = m;
    }
    i = j;
  }
  return { itemSpan, qtySpan };
}

export function ClFtaAgreementTariffView() {
  const [ready, setReady] = useState(true);
  const [nations, setNations] = useState<ClFtaNationRow[]>([]);
  const [overviewGeneral, setOverviewGeneral] = useState<ClFtaGeneralRow[]>([]);
  const [ftaCd, setFtaCd] = useState<string | null>(null);
  const [overviewTab, setOverviewTab] = useState<OverviewTab>("general");
  const [detailTab, setDetailTab] = useState<DetailTab>("rate");
  const [error, setError] = useState<string | null>(null);

  const [nation, setNation] = useState<ClFtaNationRow | null>(null);
  const [general, setGeneral] = useState<ClFtaGeneralRow[]>([]);
  const [psrGuide, setPsrGuide] = useState<ClFtaGeneralRow[]>([]);
  const [recom, setRecom] = useState<ClFtaRecomRow[]>([]);
  const [rateCodes, setRateCodes] = useState<ClFtaRateCdRow[]>([]);
  const [hs2Options, setHs2Options] = useState<ClFtaHs2Option[]>([]);
  const [attachments, setAttachments] = useState<ClFtaAttachRow[]>([]);

  const [hsDraft, setHsDraft] = useState("");
  const [hsApplied, setHsApplied] = useState("");
  const [hs2, setHs2] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [rateRows, setRateRows] = useState<ClFtaRateListRow[]>([]);
  const [rateTotal, setRateTotal] = useState(0);
  const [rateLoading, setRateLoading] = useState(false);
  const [showRates, setShowRates] = useState(false);

  const [psrRows, setPsrRows] = useState<ClFtaPsrRow[]>([]);
  const [psrLoading, setPsrLoading] = useState(false);
  const [psrDetailOpen, setPsrDetailOpen] = useState(false);
  const [psrDetailLoading, setPsrDetailLoading] = useState(false);
  const [psrDetail, setPsrDetail] = useState<ClFtaPsrDetail | null>(null);

  const nationByCd = useMemo(() => {
    const m = new Map<string, ClFtaNationRow>();
    for (const n of nations) m.set(n.fta_cd, n);
    return m;
  }, [nations]);

  const loadMeta = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchJson<{
        ready: boolean;
        nations: ClFtaNationRow[];
        overviewGeneral?: ClFtaGeneralRow[];
      }>("/api/cl-fta-rate/meta?source=cl");
      setReady(data.ready);
      setNations(data.nations ?? []);
      setOverviewGeneral(data.overviewGeneral ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "협정 목록 조회 실패");
    }
  }, []);

  const loadAgreement = useCallback(async (cd: string) => {
    setError(null);
    try {
      const data = await fetchJson<{
        nation: ClFtaNationRow;
        general: ClFtaGeneralRow[];
        psrGuide: ClFtaGeneralRow[];
        recom: ClFtaRecomRow[];
        rateCodes: ClFtaRateCdRow[];
        hs2Options: ClFtaHs2Option[];
        attachments: ClFtaAttachRow[];
      }>(
        `/api/cl-fta-rate/agreement?ftaCd=${encodeURIComponent(cd)}&source=cl`,
      );
      setNation(data.nation);
      setGeneral(data.general ?? []);
      setPsrGuide(data.psrGuide ?? []);
      setRecom(data.recom ?? []);
      setRateCodes(data.rateCodes ?? []);
      setHs2Options(data.hs2Options ?? []);
      setAttachments(data.attachments ?? []);
    } catch (e) {
      setNation(null);
      setError(e instanceof Error ? e.message : "협정 정보 조회 실패");
    }
  }, []);

  const loadRates = useCallback(async () => {
    if (!hsApplied && !hs2 && !ftaCd) return;
    setRateLoading(true);
    setError(null);
    try {
      const u = new URLSearchParams();
      u.set("source", "cl");
      u.set("page", String(page));
      u.set("pageSize", String(pageSize));
      if (ftaCd) u.set("ftaCd", ftaCd);
      if (hsApplied) u.set("hs", hsApplied.replace(/\D/g, ""));
      if (hs2) u.set("hs2", hs2);
      const data = await fetchJson<{
        rows: ClFtaRateListRow[];
        total: number;
      }>(`/api/cl-fta-rate/rates?${u}`);
      setRateRows(data.rows ?? []);
      setRateTotal(data.total ?? 0);
      setShowRates(true);
    } catch (e) {
      setRateRows([]);
      setRateTotal(0);
      setError(e instanceof Error ? e.message : "세율 조회 실패");
    } finally {
      setRateLoading(false);
    }
  }, [ftaCd, page, pageSize, hsApplied, hs2]);

  const loadPsr = useCallback(async () => {
    if (!ftaCd) return;
    setPsrLoading(true);
    try {
      const u = new URLSearchParams();
      u.set("source", "cl");
      u.set("ftaCd", ftaCd);
      if (hs2) u.set("hs2", hs2);
      const data = await fetchJson<{ rows: ClFtaPsrRow[] }>(
        `/api/cl-fta-rate/psr?${u}`,
      );
      setPsrRows(data.rows ?? []);
    } catch (e) {
      setPsrRows([]);
      setError(e instanceof Error ? e.message : "원산지결정기준 조회 실패");
    } finally {
      setPsrLoading(false);
    }
  }, [ftaCd, hs2]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    if (!ftaCd) {
      setNation(null);
      setShowRates(false);
      return;
    }
    setPage(1);
    setHsApplied("");
    setHsDraft("");
    setHs2("");
    setShowRates(false);
    setDetailTab("rate");
    void loadAgreement(ftaCd);
  }, [ftaCd, loadAgreement]);

  useEffect(() => {
    if (ftaCd && detailTab === "rate" && (hsApplied || hs2)) {
      void loadRates();
    }
  }, [ftaCd, detailTab, hsApplied, hs2, page, loadRates]);

  useEffect(() => {
    if (ftaCd && detailTab === "psr") void loadPsr();
  }, [ftaCd, detailTab, hs2, loadPsr]);

  const totalPg = Math.max(1, Math.ceil(rateTotal / pageSize) || 1);
  const pageSafe = Math.min(page, totalPg);
  const pageBlock = useMemo(
    () => visiblePages(pageSafe, totalPg),
    [pageSafe, totalPg],
  );
  const recomMeta = useMemo(() => recomSpanMeta(recom), [recom]);

  const openPsrRef = useCallback(async (ref: ClFtaPsrRef) => {
    setPsrDetailOpen(true);
    setPsrDetailLoading(true);
    setPsrDetail(null);
    setError(null);
    try {
      const u = new URLSearchParams();
      u.set("refFta", ref.ref_fta);
      u.set("psrId", ref.psr_id);
      const data = await fetchJson<{ detail: ClFtaPsrDetail }>(
        `/api/cl-fta-rate/psr-detail?${u}`,
      );
      setPsrDetail(data.detail);
    } catch (e) {
      setPsrDetailOpen(false);
      setError(
        e instanceof Error ? e.message : "원산지결정기준 상세 조회 실패",
      );
    } finally {
      setPsrDetailLoading(false);
    }
  }, []);

  const runSearch = () => {
    const digits = hsDraft.replace(/\D/g, "");
    setPage(1);
    if (ftaCd && detailTab === "psr") {
      if (digits) setHs2(digits.slice(0, 2).padStart(2, "0"));
      else setHs2("");
      return;
    }
    setHsApplied(hsDraft.trim());
    if (!ftaCd) {
      // 개요에서 HSK만 검색 → 전체 협정
      setShowRates(true);
      void (async () => {
        setRateLoading(true);
        try {
          const u = new URLSearchParams();
          u.set("source", "cl");
          u.set("page", "1");
          u.set("pageSize", String(pageSize));
          if (digits) u.set("hs", digits);
          else return;
          const data = await fetchJson<{
            rows: ClFtaRateListRow[];
            total: number;
          }>(`/api/cl-fta-rate/rates?${u}`);
          setRateRows(data.rows ?? []);
          setRateTotal(data.total ?? 0);
          setOverviewTab("nations");
        } catch (e) {
          setError(e instanceof Error ? e.message : "검색 실패");
        } finally {
          setRateLoading(false);
        }
      })();
    }
  };

  const applyLaws = general.filter(
    (g) =>
      g.gubun.includes("적용법령") ||
      g.sect.includes("적용법령") ||
      g.gubun.includes("적용"),
  );
  const certAttaches = attachments.filter(
    (a) =>
      a.doc_gb.includes("원산지증명") ||
      /\.(hwp|hwpx|pdf)$/i.test(a.file_nm || a.file_url),
  );
  const otherAttaches = attachments.filter((a) => !certAttaches.includes(a));

  return (
    <div className={styles.root}>
      <aside className={styles.toc}>
        <div className={styles.tocHead}>목차</div>
        <div className={styles.tocTree}>
          <div
            className={`${styles.tocRoot} ${ftaCd == null ? styles.tocRootOn : ""}`}
            onClick={() => setFtaCd(null)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setFtaCd(null);
            }}
            role="button"
            tabIndex={0}
          >
            FTA협정관세
          </div>
          <ul className={styles.tocGroup}>
            {nations.map((n) => (
              <li key={n.fta_cd}>
                <button
                  type="button"
                  className={`${styles.tocItem} ${
                    ftaCd === n.fta_cd ? styles.tocItemOn : ""
                  }`}
                  onClick={() => setFtaCd(n.fta_cd)}
                >
                  {n.fta_nm || n.nation_nm || n.fta_cd}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <section className={styles.main}>
        {error ? <p className={styles.error}>{error}</p> : null}

        {ftaCd == null ? (
          <>
            <div className={styles.headBar}>
              <h1 className={styles.headTitle}>FTA협정관세</h1>
              <a
                href={SOURCE_URL}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#dff", fontSize: 11, fontWeight: 400 }}
              >
                원본
              </a>
            </div>
            <div className={styles.headSearch}>
              <select className={styles.select} defaultValue="HSK">
                <option value="HSK">HSK</option>
              </select>
              <input
                className={styles.input}
                value={hsDraft}
                placeholder="품목번호"
                onChange={(e) => setHsDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") runSearch();
                }}
              />
              <button type="button" className={styles.searchBtn} onClick={runSearch}>
                검색
              </button>
              {!ready ? (
                <span className={styles.muted}>DB 미준비</span>
              ) : null}
            </div>

            <div className={styles.mapWrap}>
              <span className={styles.mapLabel}>협정 국가 선택</span>
              {MAP_PINS.map((p) => {
                const n = nationByCd.get(p.ftaCd);
                if (!n) return null;
                return (
                  <button
                    key={p.ftaCd}
                    type="button"
                    className={styles.pin}
                    style={{ left: p.left, top: p.top }}
                    title={n.fta_nm || n.nation_nm}
                    onClick={() => setFtaCd(p.ftaCd)}
                  >
                    <span className={styles.pinDot} />
                    <span className={styles.pinText}>
                      {n.fta_nm || n.nation_nm}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className={styles.tabs}>
              <button
                type="button"
                className={`${styles.tab} ${
                  overviewTab === "general" ? styles.tabOn : ""
                }`}
                onClick={() => setOverviewTab("general")}
              >
                일반원칙
              </button>
              <button
                type="button"
                className={`${styles.tab} ${
                  overviewTab === "nations" ? styles.tabOn : ""
                }`}
                onClick={() => setOverviewTab("nations")}
              >
                협정내용
              </button>
            </div>

            <div className={styles.body}>
              {overviewTab === "general" ? (
                <>
                  <h2 className={styles.sectionTitle}>
                    FTA 협정관세 일반원칙
                  </h2>
                  {overviewGeneral.length === 0 ? (
                    <p className={styles.muted}>일반원칙 데이터가 없습니다.</p>
                  ) : (
                    overviewGeneral.map((g, i) => (
                      <div key={`og-${i}`} className={styles.sectionBlock}>
                        <h3 className={styles.sectionH}>{g.gubun || g.sect}</h3>
                        <div className={styles.sectionBody}>{g.content}</div>
                      </div>
                    ))
                  )}
                </>
              ) : (
                <>
                  <h2 className={styles.sectionTitle}>협정별 내용</h2>
                  {showRates && rateTotal > 0 ? (
                    <>
                      <p className={styles.stats}>
                        검색 결과 {rateTotal.toLocaleString()}건
                        {rateLoading ? " · 조회 중…" : ""}
                      </p>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>협정</th>
                            <th>HSK</th>
                            <th>품명</th>
                            <th>부호</th>
                            <th>세율</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rateRows.map((r, i) => (
                            <tr key={`${r.fta_cd}-${r.hsk_cd}-${r.rate_cd}-${i}`}>
                              <td className={styles.num}>
                                <button
                                  type="button"
                                  className={styles.tocItem}
                                  style={{ padding: 0 }}
                                  onClick={() => setFtaCd(r.fta_cd)}
                                >
                                  {r.fta_nm || r.nation_nm || r.fta_cd}
                                </button>
                              </td>
                              <td className={styles.num}>
                                {formatHskDisp(r.hsk_cd)}
                              </td>
                              <td>{r.hsk_nm || r.hsk_nm_en || "-"}</td>
                              <td className={styles.num}>{r.rate_cd}</td>
                              <td className={styles.num}>
                                {r.rate_txt ||
                                  (r.rate_val != null ? `${r.rate_val}%` : "-")}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  ) : (
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>협정</th>
                          <th>적용대상</th>
                          <th>발효일</th>
                          <th>세율건수</th>
                        </tr>
                      </thead>
                      <tbody>
                        {nations.map((n) => (
                          <tr key={n.fta_cd}>
                            <td>
                              <button
                                type="button"
                                style={{
                                  border: 0,
                                  background: "none",
                                  color: "#2f5d8c",
                                  cursor: "pointer",
                                  textDecoration: "underline",
                                  padding: 0,
                                  fontSize: 12,
                                }}
                                onClick={() => setFtaCd(n.fta_cd)}
                              >
                                {n.fta_nm || n.fta_cd}
                              </button>
                            </td>
                            <td>{n.nation_nm || "-"}</td>
                            <td className={styles.num}>
                              {formatEffect(n.effect_dt)}
                            </td>
                            <td className={styles.num}>
                              {n.rate_count.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <div className={styles.headBar}>
              <h1 className={styles.headTitle}>
                {nation ? agreementTitle(nation) : ftaCd}
              </h1>
            </div>
            <div className={styles.tabs}>
              <button
                type="button"
                className={`${styles.tab} ${
                  detailTab === "rate" ? styles.tabOn : ""
                }`}
                onClick={() => setDetailTab("rate")}
              >
                협정관세율
              </button>
              <button
                type="button"
                className={`${styles.tab} ${
                  detailTab === "psr" ? styles.tabOn : ""
                }`}
                onClick={() => setDetailTab("psr")}
              >
                원산지결정기준
              </button>
              <div style={{ flex: 1 }} />
              <div className={styles.headSearch} style={{ border: 0, padding: "4px 0" }}>
                <select
                  className={styles.select}
                  value={ftaCd}
                  onChange={(e) => setFtaCd(e.target.value)}
                >
                  {nations.map((n) => (
                    <option key={n.fta_cd} value={n.fta_cd}>
                      {n.fta_nm || n.nation_nm}
                    </option>
                  ))}
                </select>
                {detailTab === "psr" ? (
                  <select
                    className={styles.select}
                    value={hs2}
                    onChange={(e) => {
                      const v = e.target.value;
                      setHs2(v);
                      setHsDraft(v);
                    }}
                  >
                    <option value="">류 전체</option>
                    {hs2Options.map((o) => (
                      <option key={o.hs2} value={o.hs2}>
                        {o.hs2}
                        {o.hs2_nm ? ` ${o.hs2_nm}` : ""}
                      </option>
                    ))}
                  </select>
                ) : null}
                <select className={styles.select} defaultValue="HSK">
                  <option value="HSK">HSK</option>
                </select>
                <input
                  className={styles.input}
                  value={hsDraft}
                  placeholder={
                    detailTab === "psr" ? "HS 2단위(류)" : "품목번호"
                  }
                  onChange={(e) => setHsDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") runSearch();
                  }}
                />
                <button
                  type="button"
                  className={styles.searchBtn}
                  onClick={runSearch}
                >
                  검색
                </button>
              </div>
            </div>

            <div className={styles.body}>
              {detailTab === "rate" ? (
                <>
                  <div className={styles.sectionBlock}>
                    <h3 className={styles.sectionH}>1. 적용법령</h3>
                    {applyLaws.length ? (
                      applyLaws.map((g, i) => (
                        <div key={`al-${i}`} className={styles.sectionBody}>
                          {g.content}
                        </div>
                      ))
                    ) : (
                      <div className={styles.sectionBody}>
                        자유무역협정의 이행을 위한 관세법의 특례에 관한 법률 및
                        동법 시행령·시행규칙, 해당 협정문.
                        {otherAttaches.length ? (
                          <ul className={styles.bulletList}>
                            {otherAttaches.map((a, i) => (
                              <li key={`att-${i}`}>
                                {a.file_url ? (
                                  <a
                                    href={a.file_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    {a.file_nm || a.file_url}
                                  </a>
                                ) : (
                                  a.file_nm
                                )}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    )}
                  </div>

                  <div className={styles.sectionBlock}>
                    <h3 className={styles.sectionH}>2. 적용대상국가</h3>
                    <div className={styles.sectionBody}>
                      {nation?.nation_nm || "-"}
                      {nation?.effect_dt
                        ? ` (발효: ${formatEffect(nation.effect_dt)})`
                        : ""}
                    </div>
                  </div>

                  <div className={styles.sectionBlock}>
                    <h3 className={styles.sectionH}>3. 원산지증명서</h3>
                    {nation?.cert_desc ? (
                      <ul className={styles.bulletList}>
                        {splitBullets(nation.cert_desc).map((line, i) => (
                          <li key={`c-${i}`}>{line}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className={styles.muted}>등록된 내용이 없습니다.</p>
                    )}
                    {certAttaches.length ? (
                      <ul className={styles.bulletList}>
                        {certAttaches.map((a, i) => (
                          <li key={`cert-att-${i}`}>
                            {a.file_url ? (
                              <a
                                href={a.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {a.file_nm || a.file_url}
                              </a>
                            ) : (
                              a.file_nm
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>

                  <div className={styles.sectionBlock}>
                    <h3 className={styles.sectionH}>4. 세율부호</h3>
                    {rateCodes.length === 0 ? (
                      <p className={styles.muted}>세율부호 없음</p>
                    ) : (
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>부호</th>
                            <th>내용</th>
                            <th>설명</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rateCodes.map((c) => (
                            <tr key={c.rate_cd}>
                              <td className={styles.num}>{c.rate_cd}</td>
                              <td className={styles.num}>
                                {c.nation_nm || nation?.fta_nm || "-"}
                              </td>
                              <td>{c.grp_nm || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {recom.length > 0 ? (
                    <div className={styles.sectionBlock}>
                      <h3 className={styles.sectionH}>
                        5. 협정관세추천 대상품목
                      </h3>
                      <p className={styles.muted}>
                        (추천기관 : {recom[0]?.agency || "—"})
                      </p>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>품목</th>
                            <th>HS</th>
                            <th>품명</th>
                            <th>적용물량</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recom.map((r, idx) => (
                            <tr key={`rc-${idx}`}>
                              {recomMeta.itemSpan[idx] ? (
                                <td rowSpan={recomMeta.itemSpan[idx]}>
                                  {r.item_nm}
                                </td>
                              ) : null}
                              <td className={styles.num}>
                                {r.hsk_disp || formatHskDisp(r.hsk_cd)}
                              </td>
                              <td>{r.hsk_nm || "-"}</td>
                              {recomMeta.qtySpan[idx] ? (
                                <td
                                  className={styles.num}
                                  rowSpan={recomMeta.qtySpan[idx]}
                                >
                                  {r.qty_txt || "-"}
                                </td>
                              ) : null}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}

                  {showRates || hsApplied || hs2 ? (
                    <div className={styles.sectionBlock}>
                      <h3 className={styles.sectionH}>협정관세율 조회결과</h3>
                      <p className={styles.stats}>
                        총 {rateTotal.toLocaleString()}건
                        {rateLoading ? " · 조회 중…" : ""}
                      </p>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>HSK</th>
                            <th>품명</th>
                            <th>부호</th>
                            <th>세율</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rateRows.length === 0 ? (
                            <tr>
                              <td colSpan={4} className={styles.muted}>
                                {rateLoading
                                  ? "조회 중…"
                                  : "검색 결과가 없습니다. HSK를 입력 후 검색하세요."}
                              </td>
                            </tr>
                          ) : (
                            rateRows.map((r, i) => (
                              <tr
                                key={`${r.hsk_cd}-${r.rate_cd}-${r.row_no}-${i}`}
                              >
                                <td className={styles.num}>
                                  {formatHskDisp(r.hsk_cd)}
                                </td>
                                <td>
                                  {[r.hsk_nm, r.hsk_nm_en]
                                    .filter(Boolean)
                                    .join(" / ") || "-"}
                                </td>
                                <td className={styles.num}>{r.rate_cd}</td>
                                <td className={styles.num}>
                                  {r.rate_txt ||
                                    (r.rate_val != null
                                      ? `${r.rate_val}%`
                                      : "-")}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                      {rateTotal > pageSize ? (
                        <div className={styles.pager}>
                          <button
                            type="button"
                            className={styles.pageBtn}
                            disabled={pageSafe <= 1}
                            onClick={() => setPage(1)}
                          >
                            «
                          </button>
                          {pageBlock.map((p) => (
                            <button
                              key={p}
                              type="button"
                              className={`${styles.pageBtn} ${
                                p === pageSafe ? styles.pageBtnOn : ""
                              }`}
                              onClick={() => setPage(p)}
                            >
                              {p}
                            </button>
                          ))}
                          <button
                            type="button"
                            className={styles.pageBtn}
                            disabled={pageSafe >= totalPg}
                            onClick={() => setPage(totalPg)}
                          >
                            »
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className={styles.muted}>
                      HSK를 입력하고 검색하면 협정관세율이 표시됩니다.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <div className={styles.sectionBlock}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th style={{ width: 72 }}>HS</th>
                          <th>품목별 원산지결정기준</th>
                        </tr>
                      </thead>
                      <tbody>
                        {psrLoading ? (
                          <tr>
                            <td colSpan={2} className={styles.muted}>
                              조회 중…
                            </td>
                          </tr>
                        ) : psrRows.length === 0 ? (
                          <tr>
                            <td colSpan={2} className={styles.muted}>
                              {hs2
                                ? "해당 류의 원산지결정기준이 없습니다."
                                : "HS 2단위(류)를 입력하거나 선택한 뒤 검색하세요."}
                            </td>
                          </tr>
                        ) : (
                          psrRows.map((r) => (
                            <tr key={`${r.fta_cd}-${r.hs2}`}>
                              <td className={styles.num}>{r.hs2}</td>
                              <td>
                                <PsrTxtWithRefs
                                  text={r.psr_txt || r.base_desc || "-"}
                                  refs={r.refs ?? []}
                                  onRef={openPsrRef}
                                />
                                {r.note_txt ? (
                                  <div className={styles.muted}>
                                    {r.note_txt}
                                  </div>
                                ) : null}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {psrGuide.map((g, i) => (
                    <div key={`pg-${i}`} className={styles.sectionBlock}>
                      <h3 className={styles.sectionH}>
                        {g.gubun || g.sect}
                      </h3>
                      <div className={styles.sectionBody}>{g.content}</div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </>
        )}
      </section>

      {psrDetailOpen ? (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={() => setPsrDetailOpen(false)}
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-label="원산지결정기준"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHead}>원산지결정기준</div>
            <div className={styles.modalBody}>
              {psrDetailLoading ? (
                <p className={styles.muted}>조회 중…</p>
              ) : psrDetail ? (
                <>
                  <table className={styles.psrDetailTable}>
                    <thead>
                      <tr>
                        <th style={{ width: "32%" }}>구분</th>
                        <th>내용</th>
                      </tr>
                    </thead>
                    <tbody>
                      {psrDetail.rows.map((r) => (
                        <tr key={`pd-${r.seq_no}-${r.gubun}`}>
                          <td className={styles.num}>{r.gubun}</td>
                          <td>{r.content}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {psrDetail.note ? (
                    <p className={styles.psrDetailNote}>{psrDetail.note}</p>
                  ) : (
                    <p className={styles.psrDetailNote}>
                      ※ 원산지확인서 및 원산지증명서의 원산지결정기준 부호는
                      [품목별 원산지 결정기준]을 충족하였을 경우의 표기이며,
                      협정에서 정한 일반적 원산지 결정기준을 충족하여 생산된
                      물품인 경우 다른 원산지 결정기준 부호가 사용될 수 있음을
                      유의하시기 바랍니다.
                    </p>
                  )}
                </>
              ) : (
                <p className={styles.muted}>상세 정보가 없습니다.</p>
              )}
            </div>
            <div className={styles.modalFoot}>
              <button
                type="button"
                className={styles.searchBtn}
                onClick={() => setPsrDetailOpen(false)}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
