"use client";

import { AppShellClient } from "@/hanjoo/components/app-shell-client";
import { CHAPTER_SHORT } from "@/hanjoo/lib/chapter-short";
import { tariffHref } from "@/hanjoo/lib/tariff-links";
import { formatSchedulePeriodLabel } from "@/hanjoo/lib/tariff-period";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

type Country = { code: string; name: string; years: number[] };
type Chapter = {
  section_code: string;
  section_name: string;
  chapter_code: string;
  chapter_name: string;
  chapter_name_en: string;
};

function chapterLabel(code: string, name: string): string {
  const short = CHAPTER_SHORT[code];
  const bare = name.replace(/\s/g, "");
  const n = String(Number(code));
  if (short && (bare === `제${n}류` || bare === `제${code}류`)) return `제${n}류 ${short}`;
  return name || short || code;
}

function ForeignTariffInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const requested = (sp.get("country") ?? "US").toUpperCase();
  const requestedYear = sp.get("year");
  const [countries, setCountries] = useState<Country[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loadingCountries, setLoadingCountries] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingCountries(true);
      try {
        const res = await fetch("/api/tariff/countries");
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          countries?: Country[];
        };
        if (!res.ok || !data.ok) throw new Error(data.error || res.statusText);
        if (!cancelled) setCountries(data.countries ?? []);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "국가 목록을 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoadingCountries(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = useMemo(() => {
    if (!countries.length) return null;
    const hit =
      countries.find((c) => c.code === requested) ??
      countries.find((c) => c.code === "US") ??
      countries[0];
    const yearNum = Number(requestedYear);
    const year = hit.years.includes(yearNum) ? yearNum : hit.years[0];
    return { ...hit, year };
  }, [countries, requested, requestedYear]);

  useEffect(() => {
    if (!selected) return;
    if (requested !== selected.code || requestedYear !== String(selected.year)) {
      router.replace(`/tariff/foreign?country=${selected.code}&year=${selected.year}`);
    }
  }, [selected, requested, requestedYear, router]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(
          `/api/tariff/chapters?year=${selected.year}&country=${selected.code}`,
        );
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
  }, [selected]);

  const bySection = useMemo(() => {
    const m = new Map<string, Chapter[]>();
    for (const c of chapters) {
      const arr = m.get(c.section_code) ?? [];
      arr.push(c);
      m.set(c.section_code, arr);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [chapters]);

  const year = selected?.year ?? 2026;
  const country = selected?.code ?? requested;
  const period = formatSchedulePeriodLabel(year);

  return (
    <AppShellClient>
      <div className="crumb">
        <Link href="/">HOME</Link> › 해외관세율표
        {selected ? ` › ${selected.name} ${period}` : ""}
      </div>
      <div className="tariff-index foreign">
        <aside className="year-side">
          <div className="year-side-hd">국가 · 연도</div>
          {loadingCountries ? <p className="muted">불러오는 중…</p> : null}
          {countries.map((c) => {
            const open = c.code === country;
            return (
              <div key={c.code}>
                <button
                  type="button"
                  className={open ? "country-name on" : "country-name"}
                  onClick={() =>
                    router.push(`/tariff/foreign?country=${c.code}&year=${c.years[0]}`)
                  }
                >
                  {c.name}
                </button>
                {open
                  ? c.years.map((y) => (
                      <Link
                        key={y}
                        href={`/tariff/foreign?country=${c.code}&year=${y}`}
                        className={y === year ? "year-sub on" : "year-sub"}
                      >
                        {formatSchedulePeriodLabel(y)}
                      </Link>
                    ))
                  : null}
              </div>
            );
          })}
        </aside>
        <div>
          <div className="panel" style={{ marginBottom: 12 }}>
            <div className="panel-hd">
              {selected ? `${selected.name} · ${period}` : "해외관세율표"}
            </div>
            <div className="panel-bd">
              {err ? <div className="err-box">{err}</div> : null}
              {loading ? <p className="muted">불러오는 중…</p> : null}
              <div className="chapter-grid">
                {Array.from({ length: 97 }, (_, i) => {
                  const code = String(i + 1).padStart(2, "0");
                  const hit = chapters.find((c) => c.chapter_code === code);
                  if (!hit) return <div key={code} className="chapter-cell empty" />;
                  return (
                    <button
                      key={code}
                      type="button"
                      className={`chapter-cell s${hit.section_code}`}
                      title={chapterLabel(code, hit.chapter_name)}
                      onClick={() =>
                        router.push(tariffHref("/tariff/chapter", year, country, { hs: code }))
                      }
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
                    <th style={{ width: "8%" }}>부</th>
                    <th style={{ width: "34%" }}>부 명칭</th>
                    <th style={{ width: "8%" }}>류</th>
                    <th>류 명칭</th>
                  </tr>
                </thead>
                <tbody>
                  {bySection.map(([, rows]) =>
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
                          <Link
                            href={tariffHref("/tariff/chapter", year, country, {
                              hs: r.chapter_code,
                            })}
                          >
                            {r.chapter_code}
                          </Link>
                        </td>
                        <td>{chapterLabel(r.chapter_code, r.chapter_name)}</td>
                      </tr>
                    )),
                  )}
                  {!loading && chapters.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="muted">
                        이 국가·연도의 관세율표가 없습니다.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </AppShellClient>
  );
}

export default function ForeignTariffPage() {
  return (
    <Suspense fallback={<div className="site-main muted">불러오는 중…</div>}>
      <ForeignTariffInner />
    </Suspense>
  );
}
