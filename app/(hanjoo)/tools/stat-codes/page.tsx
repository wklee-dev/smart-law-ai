"use client";

import { AppShellClient } from "@/hanjoo/components/app-shell-client";
import { Button } from "@/hanjoo/components/ui/Button";
import { SearchToolbar } from "@/hanjoo/components/ui/SearchToolbar";
import { FormEvent, useEffect, useState } from "react";

type Category = { code: string; sign: string; name: string };
type Detail = { code: string; nameKr: string; abbrKr: string; abbrEn: string; nameEn: string };

export default function StatCodesPage() {
  return (
    <AppShellClient>
      <StatCodes />
    </AppShellClient>
  );
}

function StatCodes() {
  const [nameDraft, setNameDraft] = useState("");
  const [signDraft, setSignDraft] = useState("");
  const [keyword, setKeyword] = useState("");
  const [sign, setSign] = useState("");
  const [signs, setSigns] = useState<string[]>([]);
  const [catPage, setCatPage] = useState(1);
  const [catSize, setCatSize] = useState(10);
  const [categories, setCategories] = useState<Category[]>([]);
  const [catTotal, setCatTotal] = useState(0);
  const [selected, setSelected] = useState<Category | null>(null);
  const [detailDraft, setDetailDraft] = useState("");
  const [detailKeyword, setDetailKeyword] = useState("");
  const [detPage, setDetPage] = useState(1);
  const [detSize, setDetSize] = useState(10);
  const [details, setDetails] = useState<Detail[]>([]);
  const [detTotal, setDetTotal] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    const sp = new URLSearchParams({
      part: "categories",
      page: String(catPage),
      pageSize: String(catSize),
      keyword,
      sign,
    });
    void fetch(`/api/tools/stat-codes?${sp}`)
      .then(async (res) => {
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          rows?: Category[];
          total?: number;
          signs?: string[];
        };
        if (cancel) return;
        if (!data.ok) throw new Error(data.error || "통계부호를 불러오지 못했습니다.");
        const rows = data.rows ?? [];
        setCategories(rows);
        setCatTotal(data.total ?? 0);
        setSigns(data.signs ?? []);
        setSelected((prev) => rows.find((row) => row.code === prev?.code) ?? rows[0] ?? null);
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
  }, [catPage, catSize, keyword, sign]);

  useEffect(() => {
    if (!selected) {
      setDetails([]);
      setDetTotal(0);
      return;
    }
    let cancel = false;
    const sp = new URLSearchParams({
      part: "details",
      code: selected.code,
      page: String(detPage),
      pageSize: String(detSize),
      keyword: detailKeyword,
    });
    void fetch(`/api/tools/stat-codes?${sp}`)
      .then(async (res) => {
        const data = (await res.json()) as { ok?: boolean; error?: string; rows?: Detail[]; total?: number };
        if (cancel) return;
        if (!data.ok) throw new Error(data.error || "상세 부호를 불러오지 못했습니다.");
        setDetails(data.rows ?? []);
        setDetTotal(data.total ?? 0);
      })
      .catch((e: unknown) => {
        if (!cancel) setErr(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancel = true;
    };
  }, [selected, detPage, detSize, detailKeyword]);

  function searchCategories(e: FormEvent) {
    e.preventDefault();
    setCatPage(1);
    setKeyword(nameDraft.trim());
    setSign(signDraft);
  }

  const catPages = Math.max(1, Math.ceil(catTotal / catSize));
  const detPages = Math.max(1, Math.ceil(detTotal / detSize));
  const title = selected ? `${selected.name || selected.code} 통계부호 상세` : "통계부호 상세";

  return (
    <div className="panel">
      <div className="panel-hd">통계부호</div>
      <div className="panel-bd case-page">
        <SearchToolbar variant="panel" onSubmit={searchCategories}>
          <label>
            통계부호명
            <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} placeholder="통계부호명" />
          </label>
          <label>
            수출입구분
            <select value={signDraft} onChange={(e) => setSignDraft(e.target.value)} aria-label="수출입구분">
              <option value="">전체</option>
              {signs.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" action="lookup" />
          <Button
            type="button"
            action="reset"
            onClick={() => {
              setNameDraft("");
              setSignDraft("");
              setKeyword("");
              setSign("");
              setCatPage(1);
            }}
          />
        </SearchToolbar>
        {err ? <p className="case-err">{err}</p> : null}
        <div className="stat-split">
          <section className="fta-card">
            <header>
              <h3>통계부호구분 목록</h3>
              <span className="basis">전체 {catTotal.toLocaleString()}건</span>
            </header>
            <div className="stat-tools">
              <select
                value={catSize}
                aria-label="목록 개수"
                onChange={(e) => {
                  setCatPage(1);
                  setCatSize(Number(e.target.value));
                }}
              >
                {[10, 20, 50].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>
            <table className="fta-mini">
              <thead>
                <tr>
                  <th>수출입구분코드</th>
                  <th>통계부호명</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={2}>조회 중…</td>
                  </tr>
                ) : categories.length === 0 ? (
                  <tr>
                    <td colSpan={2}>조회된 통계부호가 없습니다.</td>
                  </tr>
                ) : (
                  categories.map((row) => (
                    <tr
                      key={row.code}
                      className={selected?.code === row.code ? "on" : ""}
                      onClick={() => {
                        setSelected(row);
                        setDetPage(1);
                        setDetailDraft("");
                        setDetailKeyword("");
                      }}
                    >
                      <td>{row.sign}</td>
                      <td>{row.name || row.code}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <Pager page={catPage} pages={catPages} onPage={setCatPage} />
          </section>
          <section className="fta-card">
            <header>
              <h3>{title}</h3>
              <span className="basis">전체 {detTotal.toLocaleString()}건</span>
            </header>
            <SearchToolbar
              variant="compact"
              className="stat-tools"
              onSubmit={(e) => {
                e.preventDefault();
                setDetPage(1);
                setDetailKeyword(detailDraft.trim());
              }}
            >
              <input
                value={detailDraft}
                onChange={(e) => setDetailDraft(e.target.value)}
                placeholder="부호·명칭 필터"
                aria-label="부호·명칭 필터"
                disabled={!selected}
              />
              <Button type="submit" action="lookup" size="small" disabled={!selected} />
              <Button
                type="button"
                action="reset"
                size="small"
                disabled={!selected}
                onClick={() => {
                  setDetailDraft("");
                  setDetailKeyword("");
                  setDetPage(1);
                }}
              />
              <select
                value={detSize}
                aria-label="상세 개수"
                onChange={(e) => {
                  setDetPage(1);
                  setDetSize(Number(e.target.value));
                }}
              >
                {[10, 20, 50].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </SearchToolbar>
            <table className="fta-mini">
              <thead>
                <tr>
                  <th>부호</th>
                  <th>한글명</th>
                  <th>한글약어</th>
                  <th>영문약어</th>
                  <th>영문명</th>
                </tr>
              </thead>
              <tbody>
                {!selected ? (
                  <tr>
                    <td colSpan={5}>왼쪽에서 통계부호를 선택하세요.</td>
                  </tr>
                ) : details.length === 0 ? (
                  <tr>
                    <td colSpan={5}>조회된 부호가 없습니다.</td>
                  </tr>
                ) : (
                  details.map((row) => (
                    <tr key={row.code}>
                      <td className="code">{row.code}</td>
                      <td>{row.nameKr}</td>
                      <td>{row.abbrKr}</td>
                      <td>{row.abbrEn}</td>
                      <td>{row.nameEn}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <Pager page={detPage} pages={detPages} onPage={setDetPage} />
          </section>
        </div>
      </div>
    </div>
  );
}

function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="case-pager">
      <Button type="button" action="prev" size="small" disabled={page <= 1} onClick={() => onPage(page - 1)} />
      <span>
        {page} / {pages}
      </span>
      <Button type="button" action="next" size="small" disabled={page >= pages} onClick={() => onPage(page + 1)} />
    </div>
  );
}
