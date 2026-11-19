"use client";

import { AppShellClient } from "@/hanjoo/components/app-shell-client";
import { Button } from "@/hanjoo/components/ui/Button";
import { SearchToolbar } from "@/hanjoo/components/ui/SearchToolbar";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";

type Node = {
  hs_code: string;
  suffix: string;
  depth: number;
  item_name: string;
  basic_rate: string;
  leaf: boolean;
};

type SideData = {
  year: number;
  hs: string;
  headingName: string;
  nodes: Node[];
};

const YEARS = [
  2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015, 2014, 2013,
  2012, 2011, 2010, 2009, 2008, 2007, 2006, 2005, 2004, 2003, 2002,
];

function formatCompareCode(suffix: string): string {
  if (suffix.length <= 2) return suffix;
  return suffix.replace(/(.{2})(?=.)/g, "$1.");
}

function ComparePane({
  label,
  year,
  draft,
  onYear,
  onDraft,
  onConfirm,
  data,
  other,
  loading,
  error,
}: {
  label: string;
  year: number;
  draft: string;
  onYear: (year: number) => void;
  onDraft: (value: string) => void;
  onConfirm: () => void;
  data: SideData | null;
  other: SideData | null;
  loading: boolean;
  error: string | null;
}) {
  const otherRates = useMemo(() => {
    const map = new Map<string, string>();
    if (!other || !data) return map;
    if (other.hs.slice(0, 4) !== data.hs.slice(0, 4)) return map;
    for (const node of other.nodes) map.set(node.hs_code, node.basic_rate);
    return map;
  }, [data, other]);
  const comparable = otherRates.size > 0;

  function submit(e: FormEvent) {
    e.preventDefault();
    onConfirm();
  }

  return (
    <section className="compare-pane">
      <SearchToolbar variant="compact" className="compare-hd" onSubmit={submit}>
        <label>
          <select
            value={year}
            aria-label={`${label} 연도`}
            onChange={(e) => onYear(Number(e.target.value))}
          >
            {YEARS.map((y) => (
              <option key={y} value={y}>
                HSK {y}년
              </option>
            ))}
          </select>
        </label>
        <input
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          placeholder="HS 4자리"
          aria-label={`${label} HS`}
          inputMode="numeric"
        />
        {/* draft HS → URL 반영 → heading API 로드 = 조건 조회 */}
        <Button type="submit" action="lookup" size="small" />
      </SearchToolbar>
      <div className="compare-body">
        {error ? <div className="err-box">{error}</div> : null}
        {loading ? <p className="muted">불러오는 중…</p> : null}
        {data ? (
          <div className="compare-tree">
            {data.nodes.map((node) => {
              const otherRate = otherRates.get(node.hs_code);
              const missing = comparable && otherRate === undefined;
              const changed = comparable && otherRate !== undefined && otherRate !== node.basic_rate;
              const cls = missing ? "only" : changed ? "diff" : "";
              return (
                <div key={node.hs_code} className={`compare-row ${cls}`} style={{ paddingLeft: 8 + node.depth * 14 }}>
                  <span className="mono">{formatCompareCode(node.suffix)}</span>
                  <span>{node.item_name}</span>
                  <span className="rate">{node.basic_rate}</span>
                </div>
              );
            })}
            {data.nodes.length === 0 ? <p className="muted">세번이 없습니다.</p> : null}
          </div>
        ) : !loading ? (
          <p className="muted">HS를 입력한 뒤 조회를 누르세요.</p>
        ) : null}
      </div>
    </section>
  );
}

function CompareInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const leftYear = Number(sp.get("ly") ?? "2025");
  const rightYear = Number(sp.get("ry") ?? "2026");
  const leftHs = (sp.get("lhs") ?? "0101").replace(/\D/g, "").slice(0, 10);
  const rightHs = (sp.get("rhs") ?? "0101").replace(/\D/g, "").slice(0, 10);
  const [leftDraft, setLeftDraft] = useState(leftHs);
  const [rightDraft, setRightDraft] = useState(rightHs);
  const [left, setLeft] = useState<SideData | null>(null);
  const [right, setRight] = useState<SideData | null>(null);
  const [leftErr, setLeftErr] = useState<string | null>(null);
  const [rightErr, setRightErr] = useState<string | null>(null);
  const [leftLoading, setLeftLoading] = useState(false);
  const [rightLoading, setRightLoading] = useState(false);

  useEffect(() => {
    setLeftDraft(leftHs);
  }, [leftHs]);
  useEffect(() => {
    setRightDraft(rightHs);
  }, [rightHs]);

  useEffect(() => {
    if (leftHs.length < 4) {
      setLeft(null);
      setLeftErr(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLeftLoading(true);
      setLeftErr(null);
      try {
        const res = await fetch(
          `/api/tariff/heading?hs=${leftHs.slice(0, 4)}&year=${leftYear}&country=KR`,
        );
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          heading?: { heading_name?: string };
          nodes?: Node[];
        };
        if (!res.ok || !data.ok) throw new Error(data.error || res.statusText);
        if (!cancelled) {
          setLeft({
            year: leftYear,
            hs: leftHs.slice(0, 4),
            headingName: data.heading?.heading_name ?? "",
            nodes: data.nodes ?? [],
          });
        }
      } catch (e) {
        if (!cancelled) {
          setLeft(null);
          setLeftErr(e instanceof Error ? e.message : "조회 실패");
        }
      } finally {
        if (!cancelled) setLeftLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leftHs, leftYear]);

  useEffect(() => {
    if (rightHs.length < 4) {
      setRight(null);
      setRightErr(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setRightLoading(true);
      setRightErr(null);
      try {
        const res = await fetch(
          `/api/tariff/heading?hs=${rightHs.slice(0, 4)}&year=${rightYear}&country=KR`,
        );
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          heading?: { heading_name?: string };
          nodes?: Node[];
        };
        if (!res.ok || !data.ok) throw new Error(data.error || res.statusText);
        if (!cancelled) {
          setRight({
            year: rightYear,
            hs: rightHs.slice(0, 4),
            headingName: data.heading?.heading_name ?? "",
            nodes: data.nodes ?? [],
          });
        }
      } catch (e) {
        if (!cancelled) {
          setRight(null);
          setRightErr(e instanceof Error ? e.message : "조회 실패");
        }
      } finally {
        if (!cancelled) setRightLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rightHs, rightYear]);

  function push(next: { ly?: number; ry?: number; lhs?: string; rhs?: string }) {
    const params = new URLSearchParams();
    params.set("ly", String(next.ly ?? leftYear));
    params.set("ry", String(next.ry ?? rightYear));
    const lhs = next.lhs ?? leftHs;
    const rhs = next.rhs ?? rightHs;
    if (lhs) params.set("lhs", lhs);
    if (rhs) params.set("rhs", rhs);
    router.replace(`/tariff/compare?${params.toString()}`);
  }

  function confirmSide(side: "left" | "right") {
    const raw = (side === "left" ? leftDraft : rightDraft).replace(/\D/g, "").slice(0, 10);
    if (raw.length < 4) {
      if (side === "left") setLeftErr("HS 4자리 이상을 입력하세요.");
      else setRightErr("HS 4자리 이상을 입력하세요.");
      return;
    }
    push(side === "left" ? { lhs: raw.slice(0, 4) } : { rhs: raw.slice(0, 4) });
  }

  return (
    <AppShellClient>
      <div className="crumb">
        <Link href="/">HOME</Link> › <Link href="/tariff">관세율표</Link> › HS비교
      </div>
      <p className="muted compare-note">
        국내 관세율표를 연도별로 나란히 봅니다. 같은 호에서 없거나 기본세율이 다른 세번은 표시됩니다.
      </p>
      <div className="hs-compare">
        <ComparePane
          label="왼쪽"
          year={Number.isFinite(leftYear) ? leftYear : 2025}
          draft={leftDraft}
          onYear={(year) => push({ ly: year })}
          onDraft={setLeftDraft}
          onConfirm={() => confirmSide("left")}
          data={left}
          other={right}
          loading={leftLoading}
          error={leftErr}
        />
        <ComparePane
          label="오른쪽"
          year={Number.isFinite(rightYear) ? rightYear : 2026}
          draft={rightDraft}
          onYear={(year) => push({ ry: year })}
          onDraft={setRightDraft}
          onConfirm={() => confirmSide("right")}
          data={right}
          other={left}
          loading={rightLoading}
          error={rightErr}
        />
      </div>
    </AppShellClient>
  );
}

export default function TariffComparePage() {
  return (
    <Suspense fallback={<div className="site-main muted">불러오는 중…</div>}>
      <CompareInner />
    </Suspense>
  );
}
