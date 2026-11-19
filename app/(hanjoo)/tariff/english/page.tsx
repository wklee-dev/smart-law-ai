"use client";

import { AppShellClient } from "@/hanjoo/components/app-shell-client";
import { ENGLISH_CHAPTER_SHORT } from "@/hanjoo/lib/english-hsk-labels";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

type Chapter = {
  section_code: string;
  section_name: string;
  chapter_code: string;
  chapter_name: string;
  chapter_name_en: string;
};

function EnglishHskInner() {
  const router = useRouter();
  const [sourceLabel, setSourceLabel] = useState("");
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        // Latest WCO English notes year — no country/year sidebar
        const res = await fetch("/api/tariff/english");
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          sourceLabel?: string;
          chapters?: Chapter[];
        };
        if (!res.ok || !data.ok) throw new Error(data.error || res.statusText);
        if (!cancelled) {
          setSourceLabel(data.sourceLabel ?? "");
          setChapters(data.chapters ?? []);
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "조회 실패");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const bySection = useMemo(() => {
    const m = new Map<string, Chapter[]>();
    for (const c of chapters) {
      const key = c.section_code || "_";
      const arr = m.get(key) ?? [];
      arr.push(c);
      m.set(key, arr);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [chapters]);

  const chapterHref = (code: string) => `/tariff/english/chapter?hs=${code}`;

  return (
    <AppShellClient>
      <div className="crumb">
        <Link href="/">HOME</Link> › <Link href="/tariff">관세율표</Link> › English HSK
      </div>
      <div className="en-hsk-index">
        <div className="panel" style={{ marginBottom: 12 }}>
          <div className="panel-hd">
            Quick Search Table
            {sourceLabel ? (
              <span className="panel-hd-src">자료출처 : {sourceLabel}</span>
            ) : null}
          </div>
          <div className="panel-bd">
            {err ? <div className="err-box">{err}</div> : null}
            {loading ? <p className="muted">불러오는 중…</p> : null}
            <div className="chapter-grid">
              {Array.from({ length: 97 }, (_, i) => {
                const code = String(i + 1).padStart(2, "0");
                const hit = chapters.find((c) => c.chapter_code === code);
                const label =
                  ENGLISH_CHAPTER_SHORT[code] ||
                  hit?.chapter_name_en ||
                  (code === "77" ? "Reserved" : "");
                if (!hit && code !== "77") {
                  return <div key={code} className="chapter-cell empty" />;
                }
                if (!hit) {
                  return (
                    <div key={code} className="chapter-cell reserved" title="Reserved">
                      {Number(code)}
                      <small>{label}</small>
                    </div>
                  );
                }
                return (
                  <button
                    key={code}
                    type="button"
                    className={`chapter-cell en s${hit.section_code || "00"}`}
                    title={hit.chapter_name_en || hit.chapter_name}
                    onClick={() => router.push(chapterHref(code))}
                  >
                    {Number(code)}
                    <small>{label}</small>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-hd">Section · Chapter</div>
          <div className="panel-bd">
            <table className="detail-table">
              <thead>
                <tr>
                  <th style={{ width: "8%" }}>Section</th>
                  <th style={{ width: "28%" }}>Section name</th>
                  <th style={{ width: "8%" }}>Chapter</th>
                  <th>Description (English)</th>
                </tr>
              </thead>
              <tbody>
                {bySection.map(([sec, rows]) =>
                  rows.map((r, idx) => (
                    <tr key={`${r.section_code}-${r.chapter_code}`}>
                      {idx === 0 ? (
                        <>
                          <td rowSpan={rows.length} style={{ textAlign: "center" }}>
                            {sec === "_" ? "—" : r.section_code}
                          </td>
                          <td rowSpan={rows.length}>{r.section_name || "—"}</td>
                        </>
                      ) : null}
                      <td style={{ textAlign: "center" }}>
                        <Link href={chapterHref(r.chapter_code)}>{r.chapter_code}</Link>
                      </td>
                      <td>{r.chapter_name_en || r.chapter_name}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShellClient>
  );
}

export default function EnglishHskPage() {
  return (
    <Suspense fallback={<div className="site-main muted">불러오는 중…</div>}>
      <EnglishHskInner />
    </Suspense>
  );
}
