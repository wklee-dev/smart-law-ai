"use client";

import { AppShellClient } from "@/hanjoo/components/app-shell-client";
import { TariffSteps } from "@/hanjoo/components/tariff-steps";
import { tariffCountry, tariffHref, tariffIndexHref } from "@/hanjoo/lib/tariff-links";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

type Heading = {
  heading_code: string;
  heading_name: string;
  heading_name_en: string;
};
type Chapter = {
  section_code: string;
  section_name: string;
  chapter_code: string;
  chapter_name: string;
};
type Node = {
  hs_code: string;
  suffix: string;
  depth: number;
  item_name: string;
  item_name_en: string;
  basic_rate: string;
  elastic_rate: string;
  leaf: boolean;
  has_import: boolean;
  has_export: boolean;
};

function HeadingInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const hs = (sp.get("hs") ?? "").replace(/\D/g, "").slice(0, 4);
  const year = Number(sp.get("year") ?? "2026");
  const country = tariffCountry(sp.get("country"));
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [heading, setHeading] = useState<Heading | null>(null);
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (hs.length < 4) {
      setErr("호(HS4)가 필요합니다.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(
          `/api/tariff/heading?hs=${hs}&year=${year}&country=${country}`,
        );
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          chapter?: Chapter;
          heading?: Heading;
          headings?: Heading[];
          nodes?: Node[];
        };
        if (!res.ok || !data.ok) throw new Error(data.error || res.statusText);
        if (!cancelled) {
          setChapter(data.chapter ?? null);
          setHeading(data.heading ?? null);
          setHeadings(data.headings ?? []);
          setNodes(data.nodes ?? []);
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

  const chapterCode = hs.slice(0, 2);

  return (
    <AppShellClient>
      <div className="tariff-ui">
      <div className="crumb">
        <Link href="/">HOME</Link> ›{" "}
        <Link href={tariffIndexHref(year, country)}>
          {country === "KR" ? "관세율표" : "해외관세율표"}
        </Link>{" "}
        ›{" "}
        <Link href={tariffHref("/tariff/chapter", year, country, { hs: chapterCode })}>
          제{chapterCode}류
        </Link>{" "}
        › {hs}
      </div>
      <TariffSteps step={3} year={year} chapter={chapterCode} heading={hs} country={country} />
      {err ? <div className="err-box">{err}</div> : null}
      <div className="tariff-layout">
        <aside className="panel">
          <div className="panel-hd">호</div>
          <div className="panel-bd tree-list">
            {headings.map((h) => (
              <button
                key={h.heading_code}
                type="button"
                className={`tree-item ${h.heading_code === hs ? "on heading" : ""}`}
                onClick={() =>
                  router.push(tariffHref("/tariff/heading", year, country, { hs: h.heading_code }))
                }
              >
                {h.heading_code} {h.heading_name}
              </button>
            ))}
          </div>
        </aside>
        <section>
          <div className="detail-title">
            관세율 (3/4) — 제{chapter?.chapter_code || chapterCode}류 {chapter?.chapter_name || ""}{" "}
            › 제{hs}호 {heading?.heading_name || ""}
          </div>
          {loading ? <p className="muted">불러오는 중…</p> : null}
          <div className="sheet-scroll">
            <table className="detail-table hs-sheet">
              <thead>
                <tr>
                  <th style={{ width: 88 }}>HSK</th>
                  <th>품명</th>
                  <th style={{ width: 72 }}>기본</th>
                  <th style={{ width: 140 }}>탄력/양허</th>
                  <th style={{ width: 96 }}>요건</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {nodes.map((n) => (
                  <tr
                    key={n.hs_code}
                    className={n.leaf ? "click-row" : "branch-row"}
                    onClick={() => {
                      if (!n.leaf && !n.basic_rate) return;
                      router.push(tariffHref("/tariff/item", year, country, { hs: n.hs_code }));
                    }}
                  >
                    <td className="mono" style={{ paddingLeft: 8 + n.depth * 14 }}>
                      {n.suffix}
                    </td>
                    <td>{n.item_name}</td>
                    <td className="rate">{n.basic_rate || ""}</td>
                    <td className="elastic">{n.elastic_rate || ""}</td>
                    <td className="req-cell">
                      {n.has_import ? (
                        <span
                          className="req-dot imp"
                          title="수입요건 상세보기"
                          aria-label="수입요건 상세보기"
                        >
                          수입
                        </span>
                      ) : null}
                      {n.has_export ? (
                        <span
                          className="req-dot exp"
                          title="수출요건 상세보기"
                          aria-label="수출요건 상세보기"
                        >
                          수출
                        </span>
                      ) : null}
                    </td>
                    <td className="en">{n.item_name_en}</td>
                  </tr>
                ))}
                {!loading && nodes.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="muted">
                      세번이 없습니다.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      </div>
    </AppShellClient>
  );
}

export default function TariffHeadingPage() {
  return (
    <Suspense fallback={<div className="site-main muted">불러오는 중…</div>}>
      <HeadingInner />
    </Suspense>
  );
}
