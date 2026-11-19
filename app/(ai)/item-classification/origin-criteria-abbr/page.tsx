"use client";

import { CasPageHeader } from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import { CasSearchButton } from "@/app/components/search-action-buttons";
import { useCallback, useEffect, useRef, useState } from "react";

type Agreement = {
  code: string;
  name: string;
  nameEn: string;
  count: number;
};

type OriginRow = {
  id: number;
  stdyy: string;
  ontAgreeCd: string;
  ontAgreeNm: string;
  hs6Cd: string;
  gods4Name: string;
  gods6Name: string;
  orgDcsnBase: string;
  coPrtCd: string;
  lastStdyy: string;
};

import {
  stickyThClass,
  tdClass,
} from "@/app/lib/sl-table-styles";

const tdCompactClass = `${tdClass} align-middle`;

function MultilineCell({ text }: { text: string }) {
  const t = (text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!t) return <span className="text-slate-400">—</span>;
  return (
    <div className="whitespace-pre-wrap break-words leading-[1.55] [word-break:keep-all]">
      {t}
    </div>
  );
}

export default function OriginCriteriaAbbrPage() {
  const [stdYears, setStdYears] = useState<string[]>([]);
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [stdyy, setStdyy] = useState("");
  const [ontAgreeCd, setOntAgreeCd] = useState("");
  const [hs6Cd, setHs6Cd] = useState("");
  const [recentStdyy, setRecentStdyy] = useState(true);
  const [suggest, setSuggest] = useState<string[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);

  const [items, setItems] = useState<OriginRow[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [metaErr, setMetaErr] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [wrapLines, setWrapLines] = useState(true);

  const suggestRef = useRef<HTMLDivElement | null>(null);
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/ftapass-origin/meta", { cache: "no-store" });
        const data = (await res.json()) as {
          ok: boolean;
          stdYears?: string[];
          agreements?: Agreement[];
          error?: string;
        };
        if (!res.ok || !data.ok) throw new Error(data.error || "메타 조회 실패");
        setStdYears(data.stdYears ?? []);
        setAgreements(data.agreements ?? []);
      } catch (e) {
        setMetaErr(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!suggestRef.current?.contains(e.target as Node)) {
        setSuggestOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const loadSuggest = useCallback((q: string) => {
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    const digits = q.replace(/\D/g, "").slice(0, 6);
    if (digits.length < 2 || digits.length >= 6) {
      setSuggest([]);
      setSuggestOpen(false);
      setSuggestLoading(false);
      return;
    }
    setSuggestLoading(true);
    setSuggestOpen(true);
    suggestTimer.current = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(
            `/api/ftapass-origin/suggest?q=${encodeURIComponent(digits)}`,
            { cache: "no-store" },
          );
          const data = (await res.json()) as {
            ok: boolean;
            items?: string[];
          };
          if (data.ok) {
            setSuggest(data.items ?? []);
            setSuggestOpen(true);
          }
        } catch {
          setSuggest([]);
        } finally {
          setSuggestLoading(false);
        }
      })();
    }, 150);
  }, []);

  const runSearch = useCallback(
    async (nextPage = 1, nextSize = pageSize) => {
      const hs = hs6Cd.replace(/\D/g, "").slice(0, 6);
      if (!stdyy && !ontAgreeCd && !hs) {
        setErr("기준년도·적용협정·세번 중 하나 이상 입력하세요.");
        return;
      }
      if (hs && hs.length < 6) {
        setErr("세번은 6자리 이상이어야 합니다.");
        return;
      }
      setLoading(true);
      setErr(null);
      setHasSearched(true);
      setSuggestOpen(false);
      try {
        const params = new URLSearchParams();
        if (stdyy) params.set("stdyy", stdyy);
        if (ontAgreeCd) params.set("ont_agree_cd", ontAgreeCd);
        if (hs) params.set("hs6_cd", hs);
        if (recentStdyy) params.set("recent_stdyy", "1");
        params.set("page", String(nextPage));
        params.set("page_size", String(nextSize));
        const res = await fetch(`/api/ftapass-origin/search?${params}`, {
          cache: "no-store",
        });
        const data = (await res.json()) as {
          ok: boolean;
          items?: OriginRow[];
          page?: number;
          pageSize?: number;
          total?: number;
          totalPages?: number;
          error?: string;
        };
        if (!res.ok || !data.ok) throw new Error(data.error || "검색 실패");
        setItems(data.items ?? []);
        setPage(data.page ?? nextPage);
        setPageSize(data.pageSize ?? nextSize);
        setTotal(data.total ?? 0);
        setTotalPages(data.totalPages ?? 1);
      } catch (e) {
        setItems([]);
        setTotal(0);
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [hs6Cd, ontAgreeCd, pageSize, recentStdyy, stdyy],
  );

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4 text-slate-800">
      <CasPageHeader title="원산지결정기준" />

      {metaErr ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {metaErr}
        </p>
      ) : null}

      {/* 검색 필터 바 — FTA PASS 스타일 */}
      <form
        className="relative z-20 flex flex-wrap items-center gap-x-4 gap-y-2 overflow-visible rounded border border-[#b8c9dc] bg-[#e8f0f8] px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          void runSearch(1);
        }}
      >
        <label className="flex items-center gap-2 text-[13px]">
          <span className="whitespace-nowrap font-medium text-slate-700">
            기준년도
          </span>
          <select
            className="h-8 min-w-[110px] rounded border border-slate-400 bg-white px-2 text-[13px]"
            value={stdyy}
            onChange={(e) => setStdyy(e.target.value)}
          >
            <option value="">전체</option>
            {stdYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-[13px]">
          <span className="whitespace-nowrap font-medium text-slate-700">
            적용협정
          </span>
          <select
            className="h-8 min-w-[180px] max-w-[240px] rounded border border-slate-400 bg-white px-2 text-[13px]"
            value={ontAgreeCd}
            onChange={(e) => setOntAgreeCd(e.target.value)}
          >
            <option value="">전체</option>
            {agreements.map((a) => (
              <option key={a.code} value={a.code}>
                {a.name}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-2 text-[13px]" ref={suggestRef}>
          <span className="whitespace-nowrap font-medium text-slate-700">
            ▸ 세번
          </span>
          <div className="relative">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              placeholder="6자리"
              className="h-8 w-[110px] rounded border border-slate-400 bg-white px-2 text-[13px] tracking-wider"
              value={hs6Cd}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                setHs6Cd(v);
                setErr(null);
                loadSuggest(v);
              }}
              onFocus={() => {
                const d = hs6Cd.replace(/\D/g, "");
                if (d.length >= 2 && d.length < 6) {
                  loadSuggest(d);
                  setSuggestOpen(true);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") setSuggestOpen(false);
              }}
            />
            {suggestOpen && hs6Cd.replace(/\D/g, "").length >= 2 && hs6Cd.replace(/\D/g, "").length < 6 ? (
              <ul className="absolute left-0 top-full z-50 mt-0.5 max-h-56 min-w-[110px] overflow-auto border border-slate-400 bg-white py-0.5 shadow-lg">
                {suggestLoading ? (
                  <li className="px-2 py-1.5 text-[12px] text-slate-500">조회 중…</li>
                ) : suggest.length === 0 ? (
                  <li className="px-2 py-1.5 text-[12px] text-slate-500">
                    일치 세번 없음
                  </li>
                ) : (
                  suggest.map((s) => (
                    <li key={s}>
                      <button
                        type="button"
                        className="block w-full px-2 py-1 text-left text-[13px] font-medium hover:bg-[#1e2f4f] hover:text-white"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setHs6Cd(s);
                          setSuggest([]);
                          setSuggestOpen(false);
                        }}
                      >
                        {s}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            ) : null}
          </div>
        </div>

        <label className="flex items-center gap-1.5 text-[13px] text-slate-700">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-[#1e2f4f]"
            checked={recentStdyy}
            onChange={(e) => setRecentStdyy(e.target.checked)}
          />
          최근기준년도
        </label>

        <CasSearchButton type="submit" disabled={loading}>
          검색
        </CasSearchButton>
      </form>

      {err ? (
        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {err}
        </p>
      ) : null}

      {/* 결과 그리드 */}
      <div className="min-h-0 flex-1 overflow-auto rounded border border-[#9aabb8] bg-white shadow-sm">
        <table className="w-full min-w-[1180px] border-collapse table-fixed">
          <colgroup>
            <col className="w-[52px]" />
            <col className="w-[92px]" />
            <col className="w-[128px]" />
            <col className="w-[80px]" />
            <col className="w-[17%]" />
            <col className="w-[13%]" />
            <col className="w-[34%]" />
            <col className="w-[120px]" />
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr>
              <th className={stickyThClass}> </th>
              <th className={stickyThClass}>기준년도</th>
              <th className={stickyThClass}>적용협정</th>
              <th className={stickyThClass}>세번</th>
              <th className={stickyThClass}>4단위 품명</th>
              <th className={stickyThClass}>6단위 품명</th>
              <th className={stickyThClass}>품목별 기준</th>
              <th className={stickyThClass}>확인서 약어표</th>
            </tr>
          </thead>
          <tbody>
            {!hasSearched ? (
              <tr>
                <td
                  colSpan={8}
                  className={`${tdClass} py-10 text-center text-slate-500`}
                >
                  기준년도·적용협정·세번을 선택한 뒤 검색하세요. (세번 6자리)
                </td>
              </tr>
            ) : loading ? (
              <tr>
                <td
                  colSpan={8}
                  className={`${tdClass} py-10 text-center text-slate-500`}
                >
                  조회 중…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className={`${tdClass} py-10 text-center text-slate-500`}
                >
                  검색 결과가 없습니다.
                </td>
              </tr>
            ) : (
              items.map((row, idx) => (
                <tr key={row.id} className="hover:bg-[#f4f8fc]">
                  <td className={`${tdCompactClass} text-center text-slate-500`}>
                    {(page - 1) * pageSize + idx + 1}
                  </td>
                  <td className={`${tdCompactClass} text-center whitespace-nowrap`}>
                    {row.stdyy || "—"}
                  </td>
                  <td className={`${tdClass} whitespace-nowrap`}>
                    {row.ontAgreeNm || "—"}
                  </td>
                  <td className={`${tdCompactClass} text-center font-medium tracking-wide`}>
                    {row.hs6Cd || "—"}
                  </td>
                  <td
                    className={`${tdClass} ${wrapLines ? "" : "truncate max-w-0"}`}
                    title={row.gods4Name}
                  >
                    {wrapLines ? (
                      <MultilineCell text={row.gods4Name} />
                    ) : (
                      row.gods4Name || "—"
                    )}
                  </td>
                  <td
                    className={`${tdClass} ${wrapLines ? "" : "truncate max-w-0"}`}
                    title={row.gods6Name}
                  >
                    {wrapLines ? (
                      <MultilineCell text={row.gods6Name} />
                    ) : (
                      row.gods6Name || "—"
                    )}
                  </td>
                  <td
                    className={`${tdClass} ${wrapLines ? "" : "truncate max-w-0"}`}
                    title={row.orgDcsnBase}
                  >
                    {wrapLines ? (
                      <MultilineCell text={row.orgDcsnBase} />
                    ) : (
                      row.orgDcsnBase || "—"
                    )}
                  </td>
                  <td
                    className={`${tdClass} ${wrapLines ? "" : "truncate max-w-0"}`}
                    title={row.coPrtCd}
                  >
                    {wrapLines ? (
                      <div className="font-semibold text-[#1e2f4f]">
                        <MultilineCell text={row.coPrtCd} />
                      </div>
                    ) : (
                      <span className="block text-center font-semibold text-[#1e2f4f]">
                        {row.coPrtCd || "—"}
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 페이징 */}
      {hasSearched ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-2 text-[13px]">
          <div className="flex items-center gap-3">
            <span className="text-slate-600">
              보기 {from} - {to} / {total.toLocaleString()}
            </span>
            <button
              type="button"
              className="rounded border border-slate-300 bg-white px-2.5 py-1 hover:bg-slate-50"
              onClick={() => setWrapLines((v) => !v)}
            >
              줄바꿈설정
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page <= 1 || loading}
              className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
              onClick={() => void runSearch(1)}
            >
              «
            </button>
            <button
              type="button"
              disabled={page <= 1 || loading}
              className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
              onClick={() => void runSearch(page - 1)}
            >
              ‹
            </button>
            <span className="min-w-[2rem] px-2 text-center font-medium">
              {page}
            </span>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
              onClick={() => void runSearch(page + 1)}
            >
              ›
            </button>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
              onClick={() => void runSearch(totalPages)}
            >
              »
            </button>
          </div>

          <label className="flex items-center gap-2 text-slate-600">
            Rows per page
            <select
              className="h-7 rounded border border-slate-300 bg-white px-1"
              value={pageSize}
              onChange={(e) => {
                const n = Number(e.target.value);
                setPageSize(n);
                void runSearch(1, n);
              }}
            >
              {[25, 50, 100, 200].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      <p className="text-[12px] leading-relaxed text-[#1e2f4f]">
        ※ 본 정보는 참고용이며 법적 구속력이 없습니다. 원산지결정기준의 정확한
        적용은 해당 FTA 협정문 및 국내 법령을 확인하시기 바랍니다.
      </p>
    </div>
  );
}
