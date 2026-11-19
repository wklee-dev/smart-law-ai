"use client";

import { useEffect, useState } from "react";

type Source = { name: string; url: string; db: "있음" | "없음" | "참고"; detail: string };

export function GuidelineSource({ code }: { code: string }) {
  const [rows, setRows] = useState<Source[] | null>(null);
  useEffect(() => {
    let cancel = false;
    void fetch(`/api/guidelines/sources?code=${encodeURIComponent(code)}`)
      .then(async (res) => {
        const data = (await res.json()) as { ok?: boolean; sources?: Source[] };
        if (!cancel && data.ok) setRows(data.sources ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [code]);
  if (!rows) return null;
  return (
    <div className="table-scroll">
      <table className="answer-table case-table duty-source">
        <thead>
          <tr>
            <th>구분</th>
            <th>원본소스</th>
            <th>DB</th>
            <th>확인 내용</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name} className={row.db === "없음" ? "duty-missing" : undefined}>
              <td>{row.name}</td>
              <td>
                <a href={row.url} target="_blank" rel="noreferrer">
                  {row.url}
                </a>
              </td>
              <td>{row.db}</td>
              <td>{row.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
