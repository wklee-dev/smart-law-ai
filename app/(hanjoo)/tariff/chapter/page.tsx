"use client";

import { AppShellClient } from "@/hanjoo/components/app-shell-client";
import { TariffSteps } from "@/hanjoo/components/tariff-steps";
import { tariffCountry, tariffHref, tariffIndexHref } from "@/hanjoo/lib/tariff-links";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

type Chapter = {
  chapter_code: string;
  chapter_name: string;
  section_code: string;
  section_name: string;
};
type Heading = {
  heading_code: string;
  heading_name: string;
  heading_name_en: string;
};

function ChapterInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const hs = (sp.get("hs") ?? "01").replace(/\D/g, "").slice(0, 2).padStart(2, "0");
  const year = Number(sp.get("year") ?? "2026");
  const country = tariffCountry(sp.get("country"));
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(
          `/api/tariff/chapter?hs=${hs}&year=${year}&country=${country}`,
        );
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          chapter?: Chapter;
          chapters?: Chapter[];
          headings?: Heading[];
        };
        if (!res.ok || !data.ok) throw new Error(data.error || res.statusText);
        if (!cancelled) {
          setChapter(data.chapter ?? null);
          setChapters(data.chapters ?? []);
          setHeadings(data.headings ?? []);
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
  }, [hs, year, country]);

  return (
    <AppShellClient>
      <div className="tariff-ui">
      <div className="crumb">
        <Link href="/">HOME</Link> ›{" "}
        <Link href={tariffIndexHref(year, country)}>
          {country === "KR" ? "관세율표" : "해외관세율표"}
        </Link>{" "}
        › 제{hs}류
      </div>
      <TariffSteps step={2} year={year} chapter={hs} country={country} />
      {err ? <div className="err-box">{err}</div> : null}
      <div className="tariff-layout step2">
        <aside className="panel">
          <div className="panel-hd">류</div>
          <div className="panel-bd tree-list">
            {chapters.map((c) => (
              <button
                key={c.chapter_code}
                type="button"
                className={`tree-item ${c.chapter_code === hs ? "on" : ""}`}
                onClick={() =>
                  router.push(tariffHref("/tariff/chapter", year, country, { hs: c.chapter_code }))
                }
              >
                {c.chapter_code} {c.chapter_name}
              </button>
            ))}
          </div>
        </aside>
        <section>
          <div className="detail-title">
            관세율 (2/4) — 제{chapter?.section_code || ""}부 {chapter?.section_name || ""} › 제
            {hs}류 {chapter?.chapter_name || ""}
          </div>
          {loading ? <p className="muted">불러오는 중…</p> : null}
          <table className="detail-table hs-sheet">
            <thead>
              <tr>
                <th style={{ width: 72 }}>HS</th>
                <th>품명</th>
                <th>영문</th>
              </tr>
            </thead>
            <tbody>
              {headings.map((h) => (
                <tr
                  key={h.heading_code}
                  className="click-row"
                  onClick={() =>
                    router.push(
                      tariffHref("/tariff/heading", year, country, { hs: h.heading_code }),
                    )
                  }
                >
                  <td className="mono">{h.heading_code}</td>
                  <td>{h.heading_name}</td>
                  <td className="en">{h.heading_name_en}</td>
                </tr>
              ))}
              {!loading && headings.length === 0 ? (
                <tr>
                  <td colSpan={3} className="muted">
                    호가 없습니다.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      </div>
      </div>
    </AppShellClient>
  );
}

export default function TariffChapterPage() {
  return (
    <Suspense fallback={<div className="site-main muted">불러오는 중…</div>}>
      <ChapterInner />
    </Suspense>
  );
}
