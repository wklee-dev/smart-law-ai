"use client";

import { AppShellClient } from "@/hanjoo/components/app-shell-client";
import { CoCodePanel } from "@/hanjoo/components/co-code-panel";
import { Button } from "@/hanjoo/components/ui/Button";
import { SearchToolbar } from "@/hanjoo/components/ui/SearchToolbar";
import type { CoForm } from "@/hanjoo/lib/fta-co-codes";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Agreement = { code: string; name: string; countries: string };
type DetailItem = { label: string; content: string };
type OriginRow = {
  code: string;
  name: string;
  countries: string;
  hs: string;
  rule: string;
  detail?: DetailItem[];
  detailNote?: string;
  co?: CoForm;
};

const PAGE_SIZE = 10;

const CRITERIA_COLS = [
  "완전생산",
  "가공공정",
  "세번변경",
  "최소기준",
  "부가가치기준 (집적법)",
  "부가가치기준 (공제법)",
  "부가가치기준 (MC법)",
  "부가가치기준 (순원가법)",
  "원산지확인서",
  "원산지증명서",
] as const;

function cellOf(row: OriginRow, label: string): string {
  const hit = row.detail?.find((item) => item.label === label);
  const text = hit?.content?.trim() ?? "";
  return text || "—";
}

export default function OriginCriteriaPage() {
  return (
    <AppShellClient>
      <OriginCriteria />
    </AppShellClient>
  );
}

function OriginCriteria() {
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [code, setCode] = useState("");
  const [hs, setHs] = useState("");
  const [rows, setRows] = useState<OriginRow[]>([]);
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState<OriginRow | null>(null);
  const [page, setPage] = useState(1);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    void fetch("/api/rates/origin?part=agreements")
      .then(async (res) => {
        const data = (await res.json()) as { ok?: boolean; rows?: Agreement[]; error?: string };
        if (cancel) return;
        if (!data.ok) throw new Error(data.error || "협정 목록을 불러오지 못했습니다.");
        setAgreements(data.rows ?? []);
      })
      .catch((e: unknown) => {
        if (!cancel) setErr(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancel = true;
    };
  }, []);

  async function runSearch() {
    const digits = hs.replace(/\D/g, "");
    if (![2, 4, 6, 10].includes(digits.length)) {
      window.alert("HS코드는 2자리, 4자리, 6자리 또는 10자리로 입력하시기 바랍니다. (조회는 2자리 류 기준)");
      return;
    }
    setLoading(true);
    setErr(null);
    setSelected(null);
    try {
      const sp = new URLSearchParams({ part: "search", hs: digits });
      if (code) sp.set("code", code);
      const res = await fetch(`/api/rates/origin?${sp}`);
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        rows?: OriginRow[];
        note?: string;
      };
      if (!data.ok) throw new Error(data.error || "원산지결정기준을 불러오지 못했습니다.");
      const next = data.rows ?? [];
      setRows(next);
      setNote(data.note ?? "");
      setPage(1);
      setSearched(true);
      setSelected(next[0] ?? null);
    } catch (e) {
      setRows([]);
      setNote("");
      setSelected(null);
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void runSearch();
  }

  function resetForm() {
    setHs("");
    setCode("");
    setRows([]);
    setNote("");
    setSelected(null);
    setPage(1);
    setSearched(false);
    setErr(null);
  }

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, page]);
  const chapter = pageRows[0]?.hs || hs.replace(/\D/g, "").slice(0, 2) || "—";
  const detailNote = rows.find((row) => row.detailNote)?.detailNote ?? "";

  return (
    <div className="panel">
      <div className="panel-hd">원산지결정기준</div>
      <div className="panel-bd case-page origin-glance">
        <SearchToolbar variant="compact" className="origin-glance-toolbar" onSubmit={onSubmit}>
          <label>
            협정국
            <select value={code} aria-label="협정국" onChange={(e) => setCode(e.target.value)}>
              <option value="">전체</option>
              {agreements.map((row) => (
                <option key={row.code} value={row.code}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            HSK
            <input
              value={hs}
              onChange={(e) => setHs(e.target.value)}
              inputMode="numeric"
              placeholder="2자리(6·10도 가능)"
              aria-label="HS코드"
            />
          </label>
          <Button type="submit" action="lookup" />
          <Button type="button" action="reset" onClick={resetForm} />
        </SearchToolbar>

        {err ? <p className="case-err">{err}</p> : null}
        {loading ? <p className="muted">조회 중…</p> : null}
        {searched && !loading ? (
          <p className="muted case-list-meta">
            <span>총 {rows.length.toLocaleString()}건</span>
            <span>페이지당 {PAGE_SIZE}</span>
            <span>조회 기준 HS 류 {chapter}</span>
          </p>
        ) : null}

        {searched ? (
          <div className="table-scroll">
            <table className="answer-table case-table fta-mini fta-origin-result">
              <thead>
                <tr>
                  <th>협정</th>
                  <th>대상국가</th>
                  <th>HS</th>
                  <th>품목별 원산지결정기준</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="muted">
                      저장된 원산지결정기준이 없습니다.
                    </td>
                  </tr>
                ) : (
                  pageRows.map((row) => {
                    const active = selected?.code === row.code && selected.hs === row.hs;
                    return (
                      <tr
                        key={`${row.code}-${row.hs}-${row.rule.slice(0, 20)}`}
                        className={active ? "on" : undefined}
                        onClick={() => setSelected(row)}
                      >
                        <td>{row.name || row.code}</td>
                        <td className="wrap">{row.countries || "—"}</td>
                        <td className="hs">{row.hs}</td>
                        <td className="rule wrap">{row.rule || "—"}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">협정국(선택)과 HS를 입력한 뒤 조회하면 국가별 원산지결정기준을 한눈에 볼 수 있습니다.</p>
        )}

        {searched && rows.length > PAGE_SIZE ? (
          <div className="case-pager">
            <Button
              type="button"
              action="prev"
              size="small"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            />
            <span>
              {page} / {pages}
            </span>
            <Button
              type="button"
              action="next"
              size="small"
              disabled={page >= pages}
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
            />
          </div>
        ) : null}

        {note ? <p className="fta-foot">{note.startsWith("※") ? note : `※ ${note}`}</p> : null}

        {searched && rows.length > 0 ? (
          <section className="case-detail origin-glance-detail">
            <h3>원산지결정기준 — HS {chapter}</h3>
            <div className="table-scroll origin-compare-scroll">
              <table className="answer-table case-table origin-compare-table">
                <thead>
                  <tr>
                    <th className="nation">국가</th>
                    {CRITERIA_COLS.map((label) => (
                      <th key={label}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const active = selected?.code === row.code && selected.hs === row.hs;
                    return (
                      <tr
                        key={`cmp-${row.code}-${row.hs}`}
                        className={active ? "on" : undefined}
                        onClick={() => setSelected(row)}
                      >
                        <td className="nation">{row.name || row.code}</td>
                        {CRITERIA_COLS.map((label) => (
                          <td key={label} className="wrap">
                            {cellOf(row, label)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {detailNote ? <p className="fta-foot">※ {detailNote}</p> : null}
            {selected ? (
              <CoCodePanel co={selected.co} rule={selected.rule} title={selected.name || selected.code} />
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
