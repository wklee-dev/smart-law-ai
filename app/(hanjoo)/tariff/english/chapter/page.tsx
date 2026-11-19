"use client";

import { AppShellClient } from "@/hanjoo/components/app-shell-client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

type ChapterRow = {
  chapter_code: string;
  chapter_name_en: string;
  section_code: string;
  section_name: string;
};

type ChapterDetail = ChapterRow & {
  section_note: string;
  chapter_note: string;
};

type Heading = {
  heading_code: string;
  heading_name_en: string;
  note: string;
};

type NoteTab = "section" | "chapter" | "heading";

function EnglishChapterInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const hs = (sp.get("hs") ?? "01").replace(/\D/g, "").slice(0, 2).padStart(2, "0");
  const [sourceLabel, setSourceLabel] = useState("");
  const [chapter, setChapter] = useState<ChapterDetail | null>(null);
  const [chapters, setChapters] = useState<ChapterRow[]>([]);
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [selectedHeading, setSelectedHeading] = useState<string | null>(null);
  const [tab, setTab] = useState<NoteTab>("chapter");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      setSelectedHeading(null);
      setTab("chapter");
      try {
        const res = await fetch(`/api/tariff/english?hs=${hs}`);
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          sourceLabel?: string;
          chapter?: ChapterDetail | null;
          chapters?: ChapterRow[];
          headings?: Heading[];
        };
        if (!res.ok || !data.ok) throw new Error(data.error || res.statusText);
        if (!cancelled) {
          setSourceLabel(data.sourceLabel ?? "");
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
  }, [hs]);

  const idx = chapters.findIndex((c) => c.chapter_code === hs);
  const prev = idx > 0 ? chapters[idx - 1] : null;
  const next = idx >= 0 && idx < chapters.length - 1 ? chapters[idx + 1] : null;

  const activeHeading = useMemo(() => {
    if (!selectedHeading) return null;
    return headings.find((h) => h.heading_code === selectedHeading) ?? null;
  }, [headings, selectedHeading]);

  const noteBody = useMemo(() => {
    if (tab === "section") return chapter?.section_note || "(No English section note)";
    if (tab === "heading") {
      return activeHeading?.note || "(Select a heading above to view the English heading note)";
    }
    return chapter?.chapter_note || "(No English chapter note)";
  }, [tab, chapter, activeHeading]);

  return (
    <AppShellClient>
      <div className="crumb">
        <Link href="/">HOME</Link> › <Link href="/tariff">관세율표</Link> ›{" "}
        <Link href="/tariff/english">English HSK</Link> › Chapter {hs}
      </div>
      {err ? <div className="err-box">{err}</div> : null}
      <div className="tariff-layout en-hsk">
        <aside className="panel">
          <div className="panel-hd">Chapter</div>
          <div className="panel-bd tree-list">
            {chapters.map((c) => (
              <button
                key={c.chapter_code}
                type="button"
                className={`tree-item ${c.chapter_code === hs ? "on" : ""}`}
                onClick={() => router.push(`/tariff/english/chapter?hs=${c.chapter_code}`)}
              >
                <span className="mono">{c.chapter_code}</span> {c.chapter_name_en}
              </button>
            ))}
          </div>
        </aside>
        <section>
          <div className="detail-title">
            {chapter?.section_code ? (
              <>
                Section {chapter.section_code} {chapter.section_name}
                {" › "}
              </>
            ) : null}
            Chapter {hs} {chapter?.chapter_name_en || ""}
            {sourceLabel ? (
              <span className="en-source">자료출처 : {sourceLabel}</span>
            ) : null}
          </div>
          {loading ? <p className="muted">불러오는 중…</p> : null}
          <table className="detail-table hs-sheet">
            <thead>
              <tr>
                <th style={{ width: 72 }}>HS</th>
                <th>Title / Description (English)</th>
              </tr>
            </thead>
            <tbody>
              {headings.map((h) => (
                <tr
                  key={h.heading_code}
                  className={selectedHeading === h.heading_code ? "on" : "can"}
                  onClick={() => {
                    setSelectedHeading(h.heading_code);
                    setTab("heading");
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <td className="mono">{h.heading_code}</td>
                  <td className="en-name">{h.heading_name_en}</td>
                </tr>
              ))}
              {!loading && headings.length === 0 ? (
                <tr>
                  <td colSpan={2} className="muted">
                    No headings for this chapter in the WCO English notes.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <div className="en-chapter-nav">
            {prev ? (
              <Link href={`/tariff/english/chapter?hs=${prev.chapter_code}`}>
                ‹ Chapter {prev.chapter_code}
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link href={`/tariff/english/chapter?hs=${next.chapter_code}`}>
                Chapter {next.chapter_code} ›
              </Link>
            ) : null}
          </div>

          <div className="en-notes panel" style={{ marginTop: 12 }}>
            <div className="en-notes-tabs">
              <button
                type="button"
                className={tab === "section" ? "on" : ""}
                onClick={() => setTab("section")}
              >
                Section Note
              </button>
              <button
                type="button"
                className={tab === "chapter" ? "on" : ""}
                onClick={() => setTab("chapter")}
              >
                Chapter Note
              </button>
              <button
                type="button"
                className={tab === "heading" ? "on" : ""}
                onClick={() => setTab("heading")}
                disabled={!selectedHeading}
              >
                Heading Note
                {selectedHeading ? ` (${selectedHeading})` : ""}
              </button>
            </div>
            <div className="en-notes-body">
              {tab === "chapter" && chapter?.chapter_name_en ? (
                <h3 className="en-notes-hd">
                  Chapter {hs} : {chapter.chapter_name_en}
                </h3>
              ) : null}
              {tab === "heading" && activeHeading ? (
                <h3 className="en-notes-hd">
                  {activeHeading.heading_code} {activeHeading.heading_name_en}
                </h3>
              ) : null}
              <pre className="en-notes-pre">{noteBody}</pre>
            </div>
          </div>
        </section>
      </div>
    </AppShellClient>
  );
}

export default function EnglishChapterPage() {
  return (
    <Suspense fallback={<div className="site-main muted">불러오는 중…</div>}>
      <EnglishChapterInner />
    </Suspense>
  );
}
