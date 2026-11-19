"use client";

import { AppShellClient } from "@/hanjoo/components/app-shell-client";
import { GENERAL_LAW_MENUS } from "@/hanjoo/lib/general-law-catalog";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

type Article = { heading: string; content: string; oldContent?: string; newContent?: string };

const TABS = [
  { id: "efyd", label: "시행일" },
  { id: "nw", label: "공포일" },
  { id: "admrul", label: "행정규칙" },
  { id: "oldnew", label: "신구법" },
] as const;

function ReadInner() {
  const params = useParams();
  const sp = useSearchParams();
  const slug = typeof params.category === "string" ? params.category : "";
  const menu = GENERAL_LAW_MENUS.find((item) => item.slug === slug);
  const name = (sp.get("name") ?? "").trim();
  const tab = TABS.some((item) => item.id === sp.get("tab")) ? (sp.get("tab") as string) : "efyd";
  const key = (sp.get("k") ?? "").trim();
  const [articles, setArticles] = useState<Article[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!name) return;
    let cancel = false;
    setLoading(true);
    setErr(null);
    const q = new URLSearchParams({ name, tab });
    if (key) q.set("k", key);
    void fetch(`/api/laws/text?${q.toString()}`)
      .then(async (res) => {
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          articles?: Article[];
        };
        if (cancel) return;
        if (!data.ok) throw new Error(data.error || "조회에 실패했습니다.");
        setArticles(data.articles ?? []);
      })
      .catch((e: unknown) => {
        if (!cancel) {
          setArticles([]);
          setErr(e instanceof Error ? e.message : "조회에 실패했습니다.");
        }
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [name, tab, key]);

  const compare = tab === "oldnew";

  return (
    <AppShellClient>
      <div className="crumb">
        <Link href="/">HOME</Link> ›{" "}
        <Link href={menu ? `/laws/general/${menu.slug}` : "/laws/general/customs"}>
          {menu?.label ?? "일반법령"}
        </Link>{" "}
        › {name || "본문"}
      </div>
      <div className="panel">
        <div className="panel-hd">{name || "법령"}</div>
        <div className="panel-bd ciel-law-page">
          {err ? <p className="case-err">{err}</p> : null}
          {loading ? <p className="muted">조회 중…</p> : null}
          {!loading && !err ? (
            articles.length ? (
              <div className="ciel-law-reader">
                <aside className="ciel-law-toc">
                  <div className="ciel-law-toc-title">{name}</div>
                  <nav aria-label="조문 목차">
                    {articles.map((article, index) => (
                      <a key={`${article.heading}-${index}`} href={`#law-article-${index}`}>
                        {article.heading || `조문 ${index + 1}`}
                      </a>
                    ))}
                  </nav>
                </aside>
                <div className="ciel-law-body">
                  <h2>{name}</h2>
                {articles.map((article, index) =>
                  compare ? (
                    <article
                      id={`law-article-${index}`}
                      key={`${article.heading}-${index}`}
                      className="ciel-law-article"
                    >
                      <h4>{article.heading}</h4>
                      <div className="law-oldnew">
                        <div>
                          <p className="law-old-label">구</p>
                          <p>{article.oldContent || "—"}</p>
                        </div>
                        <div>
                          <p className="law-new-label">신</p>
                          <p>{article.newContent || "—"}</p>
                        </div>
                      </div>
                    </article>
                  ) : (
                    <article
                      id={`law-article-${index}`}
                      key={`${article.heading}-${index}`}
                      className="ciel-law-article"
                    >
                      <h4>{article.heading}</h4>
                      <p>{article.content || "—"}</p>
                    </article>
                  ),
                )}
                </div>
              </div>
            ) : (
              <p className="muted">등록된 조문 데이터가 없습니다.</p>
            )
          ) : null}
        </div>
      </div>
    </AppShellClient>
  );
}

export default function LawReadPage() {
  return (
    <Suspense fallback={<div className="site-main muted">조회 중…</div>}>
      <ReadInner />
    </Suspense>
  );
}
