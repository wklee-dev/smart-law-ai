"use client";

import { AppShellClient } from "@/hanjoo/components/app-shell-client";
import { Button } from "@/hanjoo/components/ui/Button";
import { SearchToolbar } from "@/hanjoo/components/ui/SearchToolbar";
import { GENERAL_LAW_MENUS } from "@/hanjoo/lib/general-law-catalog";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

type LawNode = {
  id: string;
  name: string;
  badge: string;
  meta: string;
  href?: string;
  tab?: "admrul";
  children: LawNode[];
};

export default function GeneralLawsPage() {
  return (
    <AppShellClient>
      <GeneralLaws />
    </AppShellClient>
  );
}

function filterTree(nodes: LawNode[], q: string): LawNode[] {
  const query = q.trim().toLowerCase();
  if (!query) return nodes;
  const walk = (node: LawNode): LawNode | null => {
    const children = node.children.map(walk).filter((c): c is LawNode => c !== null);
    const hit = node.name.toLowerCase().includes(query) || node.badge.toLowerCase().includes(query);
    if (hit || children.length) return { ...node, children };
    return null;
  };
  return nodes.map(walk).filter((n): n is LawNode => n !== null);
}

function GeneralLaws() {
  const params = useParams();
  const slug = typeof params.category === "string" ? params.category : "";
  const menu = GENERAL_LAW_MENUS.find((m) => m.slug === slug);
  const [nodes, setNodes] = useState<LawNode[]>([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!menu) return;
    let cancel = false;
    setLoading(true);
    setErr(null);
    setQ("");
    setOpen(new Set());
    void fetch(`/api/laws/general?category=${encodeURIComponent(menu.slug)}`)
      .then(async (res) => {
        const data = (await res.json()) as { ok?: boolean; error?: string; nodes?: LawNode[] };
        if (cancel) return;
        if (!data.ok) throw new Error(data.error || "조회에 실패했습니다.");
        setNodes(data.nodes ?? []);
      })
      .catch((e: unknown) => {
        if (!cancel) setErr(e instanceof Error ? e.message : "조회에 실패했습니다.");
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [menu]);

  const shown = useMemo(() => filterTree(nodes, q), [nodes, q]);
  const searching = q.trim().length > 0;

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onSearchSubmit(e: FormEvent) {
    e.preventDefault();
    // 클라이언트 트리 필터만 적용 — API 재조회 없음 (입력 onChange와 동일 상태)
  }

  function resetSearch() {
    setQ("");
  }

  if (!menu) {
    return (
      <div className="panel">
        <div className="panel-hd">일반법령</div>
        <div className="panel-bd">
          <p className="case-err">법령 분류가 없습니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-hd">{menu.label}</div>
      <div className="panel-bd case-page">
        <div className="case-tabs">
          {GENERAL_LAW_MENUS.map((item) => (
            <Link
              key={item.slug}
              href={`/laws/general/${item.slug}`}
              className={item.slug === menu.slug ? "on" : ""}
            >
              {item.label}
            </Link>
          ))}
        </div>
        <SearchToolbar variant="panel" onSubmit={onSearchSubmit}>
          <label>
            법령목록검색
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="법령명"
            />
          </label>
          <Button type="submit" action="search" />
          <Button type="button" action="reset" onClick={resetSearch} />
        </SearchToolbar>
        {err ? <p className="case-err">{err}</p> : null}
        {loading ? <p className="muted">조회 중…</p> : null}
        {!loading && shown.length === 0 ? (
          <p className="muted">{searching ? "검색 결과가 없습니다." : "등록된 법령이 없습니다."}</p>
        ) : null}
        {shown.length > 0 ? (
          <div className="law-tree">
            {shown.map((node) => (
              <LawBranch
                key={node.id}
                node={node}
                depth={0}
                category={menu.slug}
                open={open}
                forceOpen={searching}
                onToggle={toggle}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function LawBranch({
  node,
  depth,
  category,
  open,
  forceOpen,
  onToggle,
}: {
  node: LawNode;
  depth: number;
  category: string;
  open: Set<string>;
  forceOpen: boolean;
  onToggle: (id: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  const expanded = hasChildren && (forceOpen || open.has(node.id));
  return (
    <div className="law-branch">
      <div className="law-row" style={{ paddingLeft: 8 + depth * 18 }}>
        {hasChildren ? (
          <button
            type="button"
            className="law-toggle"
            aria-expanded={expanded}
            aria-label={expanded ? "접기" : "펼치기"}
            onClick={() => onToggle(node.id)}
          >
            {expanded ? "▼" : "▶"}
          </button>
        ) : (
          <span className="law-toggle law-toggle-blank" />
        )}
        <span className="law-badge" data-badge={node.badge}>
          {node.badge}
        </span>
        <Link
          className="law-name"
          href={
            node.href ??
            `/laws/general/${category}/read?name=${encodeURIComponent(node.name)}${
              node.tab ? `&tab=${node.tab}` : ""
            }`
          }
        >
          {node.name}
        </Link>
        {node.meta ? <span className="law-meta">{node.meta}</span> : null}
      </div>
      {expanded
        ? node.children.map((child) => (
            <LawBranch
              key={child.id}
              node={child}
              depth={depth + 1}
              category={category}
              open={open}
              forceOpen={forceOpen}
              onToggle={onToggle}
            />
          ))
        : null}
    </div>
  );
}
