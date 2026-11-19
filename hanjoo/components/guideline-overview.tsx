"use client";

import { useEffect, useState } from "react";

type Section = { title: string; html: string; text: string };
type View = { title: string; sections: Section[] };

export function GuidelineOverview({ code, fallbackTitle }: { code: string; fallbackTitle: string }) {
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/guidelines/overview?code=${encodeURIComponent(code)}`)
      .then(async (res) => {
        const data = (await res.json()) as { ok?: boolean; error?: string } & View;
        if (!data.ok) throw new Error(data.error || "내용을 불러오지 못했습니다.");
        if (!cancelled) setView(data);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <div className="panel">
      <div className="panel-hd">{view?.title || fallbackTitle}</div>
      <div className="panel-bd guideline-overview">
        {error ? <p className="case-err">{error}</p> : null}
        {!view && !error ? <p className="muted">내용을 불러오는 중…</p> : null}
        {view?.sections.length === 0 ? <p className="muted">DB 내 설명 본문이 없습니다.</p> : null}
        {view?.sections.map((section, index) => (
          <section key={`${section.title}-${index}`} className="guideline-section">
            {section.title ? <h3>{section.title}</h3> : null}
            {section.html ? (
              <div className="guideline-html" dangerouslySetInnerHTML={{ __html: section.html }} />
            ) : (
              <div className="guideline-text">{section.text}</div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
