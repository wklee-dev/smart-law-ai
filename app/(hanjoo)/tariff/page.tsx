"use client";

import { AppShellClient } from "@/hanjoo/components/app-shell-client";
import { TariffSteps } from "@/hanjoo/components/tariff-steps";
import { CHAPTER_SHORT } from "@/hanjoo/lib/chapter-short";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

type Chapter = {
  section_code: string;
  section_name: string;
  chapter_code: string;
  chapter_name: string;
  chapter_name_en: string;
};

const TARIFF_YEARS = [
  2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015, 2014, 2013,
  2012, 2011, 2010, 2009, 2008, 2007, 2006, 2005, 2004, 2003, 2002,
];

function TariffIndexInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const year = Number(sp.get("year") ?? "2026");
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(`/api/tariff/chapters?year=${year}&country=KR`);
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          chapters?: Chapter[];
        };
        if (!res.ok || !data.ok) throw new Error(data.error || res.statusText);
        if (!cancelled) setChapters(data.chapters ?? []);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "조회 실패");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [year]);

  const bySection = useMemo(() => {
    const m = new Map<string, Chapter[]>();
    for (const c of chapters) {
      const arr = m.get(c.section_code) ?? [];
      arr.push(c);
      m.set(c.section_code, arr);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [chapters]);

  return (
    <AppShellClient>
      <div className="tariff-ui">
      <div className="crumb">
        <Link href="/">HOME</Link> › 관세율표 › {year}년 속견표
      </div>
      <TariffSteps step={1} year={year} />
      <div className="tariff-index">
        <aside className="year-side">
          <div className="year-side-hd">대한민국</div>
          {TARIFF_YEARS.map((y) => (
            <Link
              key={y}
              href={`/tariff?year=${y}`}
              className={y === year ? "on" : ""}
            >
              {y}년 관세율표
            </Link>
          ))}
        </aside>
        <div>
          <div className="panel" style={{ marginBottom: 12 }}>
            <div className="panel-hd">속견표</div>
            <div className="panel-bd">
              {err ? <div className="err-box">{err}</div> : null}
              {loading ? <p className="muted">불러오는 중…</p> : null}
              <div className="chapter-grid">
                {Array.from({ length: 97 }, (_, i) => {
                  const code = String(i + 1).padStart(2, "0");
                  const hit = chapters.find((c) => c.chapter_code === code);
                  if (!hit) {
                    return <div key={code} className="chapter-cell empty" />;
                  }
                  return (
                    <button
                      key={code}
                      type="button"
                      className={`chapter-cell s${hit.section_code}`}
                      title={hit.chapter_name}
                      onClick={() => router.push(`/tariff/chapter?hs=${code}&year=${year}`)}
                    >
                      {Number(code)}
                      <small>{CHAPTER_SHORT[code] || hit.chapter_name}</small>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-hd">부 · 류</div>
            <div className="panel-bd">
          <table className="detail-table">
            <thead>
              <tr>
                <th style={{ width: "10%" }}>부</th>
                <th style={{ width: "30%" }}>부 명칭</th>
                <th style={{ width: "10%" }}>류</th>
                <th>류 명칭</th>
              </tr>
            </thead>
            <tbody>
              {bySection.map(([sec, rows]) =>
                rows.map((r, idx) => (
                  <tr key={`${r.section_code}-${r.chapter_code}`}>
                    {idx === 0 ? (
                      <>
                        <td rowSpan={rows.length} style={{ textAlign: "center" }}>
                          {r.section_code}
                        </td>
                        <td rowSpan={rows.length}>{r.section_name}</td>
                      </>
                    ) : null}
                    <td style={{ textAlign: "center" }}>
                      <Link href={`/tariff/chapter?hs=${r.chapter_code}&year=${year}`}>
                        {r.chapter_code}
                      </Link>
                    </td>
                    <td>{r.chapter_name}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
            </div>
          </div>
        </div>
      </div>
      </div>
    </AppShellClient>
  );
}

export default function TariffPage() {
  return (
    <Suspense fallback={<div className="site-main muted">불러오는 중…</div>}>
      <TariffIndexInner />
    </Suspense>
  );
}
