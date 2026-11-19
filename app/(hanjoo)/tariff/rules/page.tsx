"use client";

import { AppShellClient } from "@/hanjoo/components/app-shell-client";
import { Button } from "@/hanjoo/components/ui/Button";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

type Rule = {
  no: string;
  kicker: string;
  marked: boolean;
  body: string;
  note: string;
  foot: string;
};

function ruleJumpLabel(no: string): string {
  if (no === "7") return "부칙";
  return `제${no}통칙`;
}

function RulesInner() {
  const sp = useSearchParams();
  const yearQuery = sp.get("year") ?? "";
  const [years, setYears] = useState<string[]>([]);
  const [year, setYear] = useState(yearQuery);
  const [intro, setIntro] = useState("");
  const [rules, setRules] = useState<Rule[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(`/api/tariff/rules?year=${encodeURIComponent(yearQuery)}`);
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          years?: string[];
          year?: string;
          intro?: string;
          rules?: Rule[];
        };
        if (cancelled) return;
        if (!res.ok || data.ok === false) throw new Error(data.error ?? "조회 실패");
        setYears(data.years ?? []);
        setYear(data.year ?? "");
        setIntro(data.intro ?? "");
        setRules(data.rules ?? []);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "조회 실패");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [yearQuery]);

  const jumpItems = useMemo(() => {
    const items: { id: string; label: string }[] = [];
    if (intro.trim()) items.push({ id: "rule-intro", label: "전문" });
    for (const rule of rules) {
      items.push({ id: `rule-${rule.no}`, label: ruleJumpLabel(rule.no) });
    }
    return items;
  }, [intro, rules]);

  return (
    <AppShellClient>
      <div className="tariff-rules-ui">
        <div className="tariff-rules-layout">
          <aside className="tariff-rules-years" aria-label="연도 선택">
            <div className="tariff-rules-years-hd">연도 선택</div>
            {years.map((y) => (
              <Link key={y} href={`/tariff/rules?year=${y}`} className={y === year ? "on" : ""}>
                {y}년
              </Link>
            ))}
            {!loading && years.length === 0 ? (
              <p className="muted" style={{ padding: "10px 14px", margin: 0 }}>
                연도 없음
              </p>
            ) : null}
          </aside>

          <section className="tariff-rules-doc">
            <div className="tariff-rules-doc-hd">
              <div className="tariff-rules-doc-hd-main">
                {year ? <span className="tariff-rules-year-badge">{year}년</span> : null}
                <h2>관세율표의 해석에 관한 통칙</h2>
              </div>
              <Button
                type="button"
                action="print"
                className="tariff-rules-print"
                onClick={() => window.print()}
              />
            </div>

            {jumpItems.length > 0 ? (
              <nav className="tariff-rules-jump" aria-label="통칙 바로가기">
                {jumpItems.map((item) => (
                  <a key={item.id} href={`#${item.id}`}>
                    {item.label}
                  </a>
                ))}
              </nav>
            ) : null}

            <div className="tariff-rules-body hs-rules">
              <p className="hs-rules-src">
                품목분류 적용기준에 관한 고시 제3조 · 「관세법」 별표 관세율표 · [별표 1] HS해설서(국문)
                {year ? ` · ${year}년` : ""}
              </p>

              {err ? <div className="err-box">{err}</div> : null}
              {loading ? <p className="muted">불러오는 중…</p> : null}

              {intro ? (
                <div id="rule-intro">
                  <h3 className="hs-rules-intro-title">전문</h3>
                  <p className="hs-rules-intro">{intro}</p>
                </div>
              ) : null}

              {!loading && !err && rules.length === 0 ? (
                <p className="muted">저장된 통칙이 없습니다.</p>
              ) : null}

              {rules.map((rule) => (
                <article key={rule.no} id={`rule-${rule.no}`} className="hs-rule">
                  {rule.kicker ? <p className="hs-rule-kicker">{rule.kicker}</p> : null}
                  <h3>
                    통칙 제{rule.no}호{rule.marked ? "(*)" : ""}
                  </h3>
                  <p>{rule.body}</p>
                  {rule.note ? (
                    <div className="hs-rule-note">
                      <h4>해설</h4>
                      <p>{rule.note}</p>
                    </div>
                  ) : null}
                  {rule.foot ? (
                    <div className="hs-rule-foot">
                      <h4>각주</h4>
                      <p>{rule.foot}</p>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
    </AppShellClient>
  );
}

export default function TariffRulesPage() {
  return (
    <Suspense fallback={<div className="site-main muted">불러오는 중…</div>}>
      <RulesInner />
    </Suspense>
  );
}
