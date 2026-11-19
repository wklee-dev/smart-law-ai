"use client";

import { AppShellClient } from "@/hanjoo/components/app-shell-client";
import { Button } from "@/hanjoo/components/ui/Button";
import { useEffect, useState, type ReactNode } from "react";

type Citation = {
  id: number;
  lawName: string;
  heading: string;
  title: string;
  enforce: string;
  text: string;
  sourceTable: string;
  sourceId: string;
};

type Row = {
  code: string;
  name: string;
  lawName: string;
  summary: string;
  citations: Citation[];
};

export default function ImportTaxesPage() {
  return (
    <AppShellClient>
      <ImportTaxes />
    </AppShellClient>
  );
}

function lawLinkLabel(citation: Citation): string {
  const no = citation.heading.match(/^제\d+조(?:의\d+)?/)?.[0] ?? "";
  const name = citation.lawName.includes("자유무역협정")
    ? "FTA관세특례법"
    : citation.lawName.includes("교통")
      ? "교통·에너지·환경세법"
      : citation.lawName.includes("농어촌")
        ? "농어촌특별세법"
        : citation.lawName;
  return no ? `${name} ${no}` : name;
}

function TaxIcon({ code }: { code: string }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  let body: ReactNode;
  switch (code) {
    case "customs":
      body = (
        <>
          <path d="M3 17h18" />
          <path d="M5 17V11l4-3h6l4 3v6" />
          <path d="M8 17v-3h3v3" />
          <circle cx="8.5" cy="19" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="15.5" cy="19" r="1.2" fill="currentColor" stroke="none" />
        </>
      );
      break;
    case "fta":
      body = (
        <>
          <path d="M7 3h7l3 3v15H7z" />
          <path d="M14 3v3h3" />
          <path d="M9 11h6M9 15h6" />
        </>
      );
      break;
    case "individual":
      body = (
        <>
          <ellipse cx="12" cy="6" rx="5" ry="2.2" />
          <path d="M7 6v3c0 1.2 2.2 2.2 5 2.2s5-1 5-2.2V6" />
          <path d="M7 9v3c0 1.2 2.2 2.2 5 2.2s5-1 5-2.2V9" />
          <path d="M7 12v3c0 1.2 2.2 2.2 5 2.2s5-1 5-2.2v-3" />
        </>
      );
      break;
    case "liquor":
      body = (
        <>
          <path d="M9 3h6" />
          <path d="M10 3v3.5L8 10v8a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-8l-2-3.5V3" />
          <path d="M9 14h6" />
        </>
      );
      break;
    case "education":
      body = (
        <>
          <path d="M3 9l9-4 9 4-9 4-9-4z" />
          <path d="M7 11.5v4.5c0 .8 2.2 2 5 2s5-1.2 5-2v-4.5" />
          <path d="M21 9v6" />
        </>
      );
      break;
    case "transport":
      body = (
        <>
          <path d="M4 16h12V8H4z" />
          <path d="M16 11h3l2 3v2h-5" />
          <circle cx="7.5" cy="17.5" r="1.5" />
          <circle cx="16.5" cy="17.5" r="1.5" />
        </>
      );
      break;
    case "rural":
      body = (
        <>
          <path d="M4 19h16" />
          <path d="M6 19V10l6-5 6 5v9" />
          <path d="M10 19v-5h4v5" />
        </>
      );
      break;
    case "vat":
      body = (
        <>
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <path d="M8 10h8M8 14h5" />
        </>
      );
      break;
    case "local":
      body = (
        <>
          <path d="M4 19h16" />
          <path d="M6 19V9l3-2 3 2 3-2 3 2v10" />
          <path d="M9 19v-4h2v4M13 19v-4h2v4" />
        </>
      );
      break;
    default:
      body = (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v5M12 16h.01" />
        </>
      );
  }
  return <svg {...common}>{body}</svg>;
}

function ExternalIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M14 4h6v6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 14 20 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ImportTaxes() {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Citation | null>(null);
  const [choices, setChoices] = useState<Citation[]>([]);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    void fetch("/api/rates/import-taxes")
      .then(async (res) => {
        const data = (await res.json()) as { ok?: boolean; error?: string; rows?: Row[] };
        if (cancel) return;
        if (!data.ok) throw new Error(data.error || "세금 요약을 불러오지 못했습니다.");
        setRows(data.rows ?? []);
        setErr(null);
      })
      .catch((e: unknown) => {
        if (!cancel) setErr(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, []);

  function openCitation(row: Row, citation: Citation) {
    setChoices(row.citations);
    setSelected(citation);
  }

  return (
    <div className="import-taxes-ui">
      <div className="it-card">
        <div className="it-card-hd">세목별 과세표준 및 세액산출방법</div>
        <div className="it-card-bd">
          {err ? <p className="it-err">{err}</p> : null}
          {loading && rows.length === 0 ? <p className="it-loading">불러오는 중…</p> : null}
          <div className="it-table-wrap">
            <table className="it-table">
              <colgroup>
                <col className="it-col-kind" />
                <col className="it-col-body" />
                <col className="it-col-law" />
              </colgroup>
              <thead>
                <tr>
                  <th>구분</th>
                  <th>과세표준 및 세액산출방법</th>
                  <th>관련법령</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={3} style={{ textAlign: "center", color: "#64748b" }}>
                      조회 결과가 없습니다.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.code}>
                      <td className="it-kind">
                        <div className="it-kind-inner">
                          <span className="it-kind-ico" title={row.name}>
                            <TaxIcon code={row.code} />
                          </span>
                          <span className="it-kind-name">{row.name}</span>
                        </div>
                      </td>
                      <td className="it-summary">{row.summary}</td>
                      <td>
                        <div className="it-laws">
                          {row.citations[0] ? (
                            <button
                              type="button"
                              className="it-law-btn"
                              onClick={() => openCitation(row, row.citations[0])}
                            >
                              {lawLinkLabel(row.citations[0])}
                              <ExternalIcon />
                            </button>
                          ) : (
                            <span className="it-law-empty">DB 내 근거자료 없음</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selected ? (
        <div className="tax-dialog-back" role="presentation" onClick={() => setSelected(null)}>
          <div
            className="tax-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tax-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <h2 id="tax-dialog-title">법령 상세보기</h2>
              <Button type="button" action="close" size="small" onClick={() => setSelected(null)} />
            </header>
            {choices.length > 1 ? (
              <label className="tax-dialog-pick">
                조문
                <select
                  value={selected.id}
                  onChange={(e) => {
                    const next = choices.find((item) => item.id === Number(e.target.value));
                    if (next) setSelected(next);
                  }}
                >
                  {choices.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.heading}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <dl>
              <div>
                <dt>법령명</dt>
                <dd>{selected.lawName}</dd>
              </div>
              <div>
                <dt>조문번호</dt>
                <dd>{selected.heading}</dd>
              </div>
              <div>
                <dt>조문제목</dt>
                <dd>{selected.title}</dd>
              </div>
              <div>
                <dt>시행일</dt>
                <dd>{selected.enforce || "DB 내 근거자료 없음"}</dd>
              </div>
              <div>
                <dt>출처</dt>
                <dd>
                  {selected.sourceTable} · {selected.sourceId}
                </dd>
              </div>
            </dl>
            <pre>{selected.text}</pre>
          </div>
        </div>
      ) : null}
    </div>
  );
}
