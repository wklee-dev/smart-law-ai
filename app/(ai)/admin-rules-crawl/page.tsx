"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CasCard,
  CasCompactInput,
  CasFormField,
  CasPageHeader,
  CasPageShell,
  CasPrimaryButton,
  CasSearchButton,
  CasSecondaryButton,
  casSelectClass,
  slTableClass,
  slTableWrapClass,
  stickyThClass,
  tdClass,
} from "@/app/(ai)/cas-ncom/cas-ncom-ui";

type CatalogRow = {
  gubun: number;
  classification: string;
  lawName: string;
  lawId: string;
  sourceUrl: string;
  urlType: string;
  sourceSheet: string;
  sourceFile: string;
  createdAt: string;
  updatedAt: string;
};

type UrlTypeMeta = { code: string; label: string; count: number };

type FetchIdItem = {
  gubun: number;
  lawName: string;
  urlType: string;
  ok: boolean;
  lawId?: string;
  error?: string;
};

const PAGE_NUMBER_WINDOW = 10;

function urlTypeLabel(code: string): string {
  if (code === "law") return "법령";
  if (code === "adm_rule") return "행정규칙";
  return code || "—";
}

function visiblePageNumbers(
  currentPage: number,
  totalPages: number,
  windowSize = PAGE_NUMBER_WINDOW,
): number[] {
  const tp = Math.max(1, Math.floor(totalPages));
  const cur = Math.min(Math.max(1, Math.floor(currentPage)), tp);
  const start = Math.floor((cur - 1) / windowSize) * windowSize + 1;
  const end = Math.min(start + windowSize - 1, tp);
  const out: number[] = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}

export default function AdminRulesCrawlPage() {
  const [dbPath, setDbPath] = useState("");
  const [totalAll, setTotalAll] = useState(0);
  const [missingLawIdCount, setMissingLawIdCount] = useState(0);
  const [classifications, setClassifications] = useState<string[]>([]);
  const [urlTypes, setUrlTypes] = useState<UrlTypeMeta[]>([]);

  const [classification, setClassification] = useState("");
  const [urlType, setUrlType] = useState("");
  const [keyword, setKeyword] = useState("");

  const [items, setItems] = useState<CatalogRow[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [metaErr, setMetaErr] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"info" | "success" | "error">(
    "info",
  );
  const [checked, setChecked] = useState<Set<number>>(() => new Set());

  const refreshMeta = useCallback(async () => {
    const res = await fetch("/api/law-source-catalog/meta", {
      cache: "no-store",
    });
    const data = (await res.json()) as {
      ok: boolean;
      dbPath?: string;
      total?: number;
      missingLawIdCount?: number;
      classifications?: string[];
      urlTypes?: UrlTypeMeta[];
      error?: string;
    };
    if (!res.ok || !data.ok) throw new Error(data.error || "메타 조회 실패");
    setDbPath(data.dbPath ?? "");
    setTotalAll(data.total ?? 0);
    setMissingLawIdCount(data.missingLawIdCount ?? 0);
    setClassifications(data.classifications ?? []);
    setUrlTypes(data.urlTypes ?? []);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await refreshMeta();
      } catch (e) {
        setMetaErr(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [refreshMeta]);

  const loadList = useCallback(
    async (nextPage: number, nextSize: number) => {
      setLoading(true);
      setErr(null);
      try {
        const params = new URLSearchParams();
        if (classification) params.set("classification", classification);
        if (urlType) params.set("url_type", urlType);
        if (keyword.trim()) params.set("q", keyword.trim());
        params.set("page", String(nextPage));
        params.set("page_size", String(nextSize));
        const res = await fetch(`/api/law-source-catalog/list?${params}`, {
          cache: "no-store",
        });
        const data = (await res.json()) as {
          ok: boolean;
          items?: CatalogRow[];
          page?: number;
          pageSize?: number;
          total?: number;
          totalPages?: number;
          error?: string;
        };
        if (!res.ok || !data.ok) throw new Error(data.error || "목록 조회 실패");
        setItems(data.items ?? []);
        setPage(data.page ?? nextPage);
        setPageSize(data.pageSize ?? nextSize);
        setTotal(data.total ?? 0);
        setTotalPages(data.totalPages ?? 1);
        setChecked(new Set());
      } catch (e) {
        setItems([]);
        setTotal(0);
        setTotalPages(1);
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [classification, keyword, urlType],
  );

  useEffect(() => {
    if (metaErr) return;
    void loadList(1, pageSize);
  }, [classification, keyword, loadList, metaErr, urlType]);

  const pageNumbers = useMemo(
    () => visiblePageNumbers(page, totalPages),
    [page, totalPages],
  );

  const from = total === 0 || items.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const to =
    total === 0 || items.length === 0
      ? 0
      : Math.min((page - 1) * pageSize + items.length, total);

  const allPageChecked =
    items.length > 0 && items.every((row) => checked.has(row.gubun));
  const missingOnPage = items.filter((r) => !r.lawId?.trim()).length;

  const toggleAllPage = () => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (allPageChecked) {
        for (const row of items) next.delete(row.gubun);
      } else {
        for (const row of items) next.add(row.gubun);
      }
      return next;
    });
  };

  const toggleOne = (gubun: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(gubun)) next.delete(gubun);
      else next.add(gubun);
      return next;
    });
  };

  const runFetchIds = async (mode: "selected" | "missing" | "one", gubun?: number) => {
    if (fetching) return;

    let gubuns: number[] = [];
    let onlyMissing = false;
    let confirmMsg = "";

    if (mode === "one" && gubun != null) {
      gubuns = [gubun];
      confirmMsg = `선택한 1건에 대해 국가법령정보 Open API로 법령ID(행정규칙일련번호)를 조회해 DB에 저장합니다.`;
    } else if (mode === "selected") {
      gubuns = [...checked];
      if (gubuns.length === 0) {
        setMessageTone("error");
        setMessage("체크한 항목이 없습니다.");
        return;
      }
      confirmMsg = `체크한 ${gubuns.length}건에 대해 Open API(법령→target=law, 행정규칙→target=admrul)로 ID를 조회·저장합니다.`;
    } else {
      onlyMissing = true;
      if (missingLawIdCount <= 0) {
        setMessageTone("info");
        setMessage("법령ID가 비어 있는 항목이 없습니다.");
        return;
      }
      confirmMsg =
        `법령ID 없는 ${missingLawIdCount}건 중 최대 200건을 Open API로 조회·저장합니다.` +
        (urlType ? `\n현재 유형 필터: ${urlTypeLabel(urlType)}` : "");
    }

    if (!window.confirm(confirmMsg + "\n계속할까요?")) return;

    setFetching(true);
    setMessageTone("info");
    setMessage("Open API 호출 중…");
    try {
      const res = await fetch("/api/law-source-catalog/fetch-ids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gubuns: gubuns.length ? gubuns : undefined,
          onlyMissing: gubuns.length ? false : onlyMissing,
          urlType: urlType || undefined,
          limit: gubuns.length ? gubuns.length : 200,
          delayMs: 300,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        processed?: number;
        updated?: number;
        failed?: number;
        skipped?: number;
        items?: FetchIdItem[];
        error?: string;
      };
      if (!res.ok || data.error) {
        throw new Error(data.error || "API 호출 실패");
      }

      const failNames = (data.items ?? [])
        .filter((i) => !i.ok)
        .slice(0, 8)
        .map((i) => `· ${i.lawName}: ${i.error || "실패"}`)
        .join("\n");

      setMessageTone((data.failed ?? 0) > 0 ? "error" : "success");
      setMessage(
        [
          `처리 ${data.processed ?? 0}건 · 저장 ${data.updated ?? 0}건 · 실패 ${data.failed ?? 0}건` +
            ((data.skipped ?? 0) > 0 ? ` · 스킵 ${data.skipped}` : ""),
          failNames ? `\n실패 예시:\n${failNames}` : "",
        ]
          .filter(Boolean)
          .join(""),
      );

      await refreshMeta();
      await loadList(page, pageSize);
    } catch (e) {
      setMessageTone("error");
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setFetching(false);
    }
  };

  const busy = loading || fetching;

  return (
    <CasPageShell>
      <CasPageHeader title="행정규칙크롤링" />

      <p className="text-[12px] text-[#666]">
        법규 목록 카탈로그{" "}
        <code className="rounded bg-[#f4f7f9] px-1">law_source_catalog</code>
        {dbPath ? (
          <>
            {" "}
            · DB: <span className="font-mono text-[11px]">{dbPath}</span>
          </>
        ) : null}
        {totalAll > 0 ? (
          <span className="ml-2 text-[#94a3b8]">
            (전체 {totalAll.toLocaleString()}건
            {missingLawIdCount > 0
              ? ` · 법령ID 없음 ${missingLawIdCount.toLocaleString()}건`
              : ""}
            )
          </span>
        ) : null}
      </p>

      {metaErr ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
          {metaErr}
        </p>
      ) : null}

      <CasCard title="검색조건">
        <form
          className="flex flex-wrap items-end gap-x-4 gap-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void loadList(1, pageSize);
          }}
        >
          <CasFormField label="분류">
            <select
              className={`${casSelectClass} min-w-[100px]`}
              value={classification}
              onChange={(e) => setClassification(e.target.value)}
            >
              <option value="">전체</option>
              {classifications.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </CasFormField>

          <CasFormField label="유형">
            <select
              className={`${casSelectClass} min-w-[110px]`}
              value={urlType}
              onChange={(e) => setUrlType(e.target.value)}
            >
              <option value="">전체</option>
              {urlTypes.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.label} ({t.count})
                </option>
              ))}
            </select>
          </CasFormField>

          <CasFormField label="법규명">
            <CasCompactInput
              type="search"
              className="min-w-[200px]"
              placeholder="법규명·URL 검색"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </CasFormField>

          <CasSearchButton type="submit" disabled={busy}>
            {loading ? "조회 중…" : "검색"}
          </CasSearchButton>
        </form>
      </CasCard>

      <CasCard title="OPEN API 호출">
        <p className="mb-3 text-[12px] leading-relaxed text-[#666]">
          국가법령정보공동활용{" "}
          <code className="rounded bg-[#f4f7f9] px-1">lawSearch.do</code>
          로 법령ID를 조회해{" "}
          <code className="rounded bg-[#f4f7f9] px-1">law_source_catalog</code>
          에 저장합니다. 법령은{" "}
          <code className="rounded bg-[#f4f7f9] px-1">target=law</code>,
          행정규칙은{" "}
          <code className="rounded bg-[#f4f7f9] px-1">target=admrul</code>{" "}
          입니다.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <CasPrimaryButton
            icon="play"
            disabled={busy || checked.size === 0}
            onClick={() => void runFetchIds("selected")}
          >
            {fetching
              ? "호출 중…"
              : `선택 항목 API 호출${checked.size ? ` (${checked.size})` : ""}`}
          </CasPrimaryButton>
          <CasSecondaryButton
            disabled={busy || missingLawIdCount <= 0}
            onClick={() => void runFetchIds("missing")}
            title="법령ID가 비어 있는 항목을 일괄 조회"
          >
            법령ID 일괄가져오기
            {missingLawIdCount > 0 ? ` (${missingLawIdCount})` : ""}
          </CasSecondaryButton>
          {missingOnPage > 0 ? (
            <span className="text-[11px] text-[#94a3b8]">
              현재 페이지 ID없음 {missingOnPage}건
            </span>
          ) : null}
        </div>
      </CasCard>

      {message ? (
        <p
          className={`rounded-md border px-3 py-2 text-[12px] whitespace-pre-line ${
            messageTone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : messageTone === "error"
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : "border-blue-200 bg-blue-50 text-blue-800"
          }`}
        >
          {message}
        </p>
      ) : null}

      {err ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          {err}
        </p>
      ) : null}

      <CasCard
        title="조회 결과"
        className="min-h-0 flex-1"
        bodyClassName="p-2"
        action={
          total > 0 ? (
            <span className="text-[11px] text-[#666]">
              {from.toLocaleString()}–{to.toLocaleString()} /{" "}
              {total.toLocaleString()}건
            </span>
          ) : null
        }
      >
        <div className={`${slTableWrapClass} min-h-[320px] flex-1`}>
          <table className={`${slTableClass} min-w-[1100px] table-fixed`}>
            <colgroup>
              <col className="w-[40px]" />
              <col className="w-[52px]" />
              <col className="w-[88px]" />
              <col className="w-[110px]" />
              <col className="w-[80px]" />
              <col />
              <col className="w-[24%]" />
              <col className="w-[110px]" />
              <col className="w-[72px]" />
            </colgroup>
            <thead className="sticky top-0 z-10">
              <tr>
                <th className={stickyThClass}>
                  <input
                    type="checkbox"
                    checked={allPageChecked}
                    onChange={toggleAllPage}
                    disabled={busy || items.length === 0}
                    aria-label="현재 페이지 전체 선택"
                  />
                </th>
                <th className={stickyThClass}>구분</th>
                <th className={stickyThClass}>분류</th>
                <th className={stickyThClass}>법령ID</th>
                <th className={stickyThClass}>유형</th>
                <th className={stickyThClass}>법규명</th>
                <th className={stickyThClass}>출처 URL</th>
                <th className={stickyThClass}>갱신일</th>
                <th className={stickyThClass}>API</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={9}
                    className={`${tdClass} py-10 text-center text-slate-500`}
                  >
                    조회 중…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className={`${tdClass} py-10 text-center text-slate-500`}
                  >
                    표시할 데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                items.map((row, idx) => (
                  <tr key={row.gubun} className="hover:bg-[#f8fafc]">
                    <td className={`${tdClass} text-center align-middle`}>
                      <input
                        type="checkbox"
                        checked={checked.has(row.gubun)}
                        onChange={() => toggleOne(row.gubun)}
                        disabled={busy}
                        aria-label={`${row.lawName} 선택`}
                      />
                    </td>
                    <td
                      className={`${tdClass} text-center align-middle text-[#666]`}
                    >
                      {(page - 1) * pageSize + idx + 1}
                    </td>
                    <td
                      className={`${tdClass} text-center align-middle whitespace-nowrap`}
                    >
                      {row.classification || "—"}
                    </td>
                    <td
                      className={`${tdClass} text-center align-middle font-mono text-[11px] whitespace-nowrap ${
                        row.lawId?.trim() ? "text-[#1e2f4f]" : "text-[#94a3b8]"
                      }`}
                    >
                      {row.lawId?.trim() || "—"}
                    </td>
                    <td
                      className={`${tdClass} text-center align-middle whitespace-nowrap`}
                    >
                      {urlTypeLabel(row.urlType)}
                    </td>
                    <td className={tdClass}>
                      <div className="whitespace-pre-wrap break-words leading-snug [word-break:keep-all]">
                        {row.lawName || "—"}
                      </div>
                    </td>
                    <td className={tdClass}>
                      {row.sourceUrl ? (
                        <a
                          href={row.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="break-all text-[#1e2f4f] underline-offset-2 hover:underline"
                          title={row.sourceUrl}
                        >
                          {row.sourceUrl}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td
                      className={`${tdClass} text-center align-middle text-[11px] text-[#94a3b8] whitespace-nowrap`}
                    >
                      {row.updatedAt || row.createdAt || "—"}
                    </td>
                    <td className={`${tdClass} text-center align-middle`}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void runFetchIds("one", row.gubun)}
                        className="rounded border border-[#1e2f4f]/40 px-2 py-0.5 text-[11px] font-medium text-[#1e2f4f] hover:bg-[#1e2f4f] hover:text-white disabled:opacity-40"
                        title="Open API로 법령ID 조회"
                      >
                        호출
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-[#e5e9ef] pt-2 text-[12px]">
          <span className="text-[#666]">
            보기 {from} - {to} / {total.toLocaleString()}
            <span className="ml-2 text-[#94a3b8]">
              (페이지 {page} / {totalPages})
            </span>
          </span>

          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              disabled={page <= 1 || busy}
              className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
              onClick={() => void loadList(1, pageSize)}
              title="첫 페이지"
            >
              «
            </button>
            <button
              type="button"
              disabled={page <= 1 || busy}
              className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
              onClick={() => void loadList(page - 1, pageSize)}
              title="이전"
            >
              ‹
            </button>
            {pageNumbers.map((n) => (
              <button
                key={n}
                type="button"
                disabled={busy}
                className={`min-w-[2rem] rounded border px-2 py-1 ${
                  n === page
                    ? "border-[#1e2f4f] bg-[#1e2f4f] font-medium text-white"
                    : "border-slate-300 hover:bg-slate-50"
                }`}
                onClick={() => void loadList(n, pageSize)}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              disabled={page >= totalPages || busy}
              className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
              onClick={() => void loadList(page + 1, pageSize)}
              title="다음"
            >
              ›
            </button>
            <button
              type="button"
              disabled={page >= totalPages || busy}
              className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
              onClick={() => void loadList(totalPages, pageSize)}
              title="마지막 페이지"
            >
              »
            </button>
          </div>

          <label className="flex items-center gap-2 text-[#666]">
            Rows per page
            <select
              className={`${casSelectClass} h-7 px-1`}
              value={pageSize}
              onChange={(e) => {
                const n = Number(e.target.value);
                setPageSize(n);
                void loadList(1, n);
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
      </CasCard>
    </CasPageShell>
  );
}
