"use client";

import { CasResetButton } from "@/app/components/search-action-buttons";
import { AdminRulesArticleContent, resolveArticleHeading } from "@/app/components/admin-rules-article-content";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type AdminRulesSource = {
  gubun?: string;
  param: string;
  table_name: string;
  description: string;
  url: string;
  note?: string;
  category?: string;
  /** `admin` = admin_rule*, `law` = raw_rule* */
  source_family?: "admin" | "law";
  unified_main_table?: string;
  /** 통합 테이블(본문·부칙·별표) 중 표시 가능한 행 존재 여부 */
  table_in_db?: boolean;
  /** 통합 테이블 내 부칙·별표·첨부 행 유무 */
  table_presence?: {
    addendum: boolean;
    annex: boolean;
    attachment: boolean;
  } | null;
  catalog_param?: string | null;
  catalog_description?: string | null;
  catalog_law_url?: string | null;
  crawl_target_only?: boolean;
  crawl_document_type?: string | null;
  crawl_target_flag?: string | null;
  crawl_portal_law_id?: string | null;
  satellite_annex_host_param?: string | null;
  satellite_annex_host_description?: string | null;
  satellite_matched_annex_count?: number | null;
};

type AdminRulesCrawlTargetsMeta = {
  excelPath: string | null;
  sheet: string;
  totalRows: number;
  allowedRows: number;
  excludedLawStatuteRows: number;
  loadedAt: string;
};

type AdminRulesArticleRow = {
  id: number;
  section_type: string;
  article_no: string;
  article_title: string;
  article_content: string;
};

type AdminRulesChapterOut = {
  id: string;
  title: string;
  articles: AdminRulesArticleRow[];
};

type AdminRulesAddendumGroupOut = {
  key: string;
  header: string;
  rows: { article_no: string; article_content: string }[];
};

type AdminRulesAnnexFileOut = {
  attachmentId: number;
  flSeq: string;
  fileName: string;
  fileType: string;
  kind: "han" | "pdf" | "image";
  role: string;
  availableLocally: boolean;
  downloadUrl: string;
};

type AdminRulesAnnexOut = {
  id: number;
  bylSeq: string;
  title: string;
  annexContent: string;
  files: AdminRulesAnnexFileOut[];
};

type AdminRulesArticleImageOut = {
  id: number;
  article_no: string;
  fl_seq: string;
  img_order: number;
  mime_type: string;
  file_ext: string;
  display_src: string;
};

type AdminRulesDocumentOut = {
  tableName: string;
  lawName: string;
  promulgationNo: string;
  promulgationDate: string;
  seqId: string;
  lawUrl: string;
  chapters: AdminRulesChapterOut[];
  looseArticles: AdminRulesArticleRow[];
  addendumGroups: AdminRulesAddendumGroupOut[];
  annexes: AdminRulesAnnexOut[];
  articleImages?: AdminRulesArticleImageOut[];
  tablePresence: {
    body: boolean;
    addendum: boolean;
    annex: boolean;
    attachment: boolean;
    article_image?: boolean;
  };
  fileContentParam?: string;
  satelliteAnnexHost?: {
    param: string;
    description: string;
    matchedAnnexCount: number;
  };
};

type MainTab = "body" | "addendum" | "annex";

/** 본문 탭 왼쪽 목차 상단 「본문 검색」 — 필요 시 `true` 로 전환 */
const ADMIN_RULES_SHOW_ARTICLE_NAV_SEARCH = false;

function fileApiUrl(
  apiBase: string,
  ruleParam: string,
  flSeq: string,
  disposition?: string,
) {
  const p = new URLSearchParams({ param: ruleParam, flSeq });
  if (disposition) p.set("disposition", disposition);
  return `${apiBase}/file?${p.toString()}`;
}

/** attachment ID 기반 안전 파일 URL (local_path 미노출) */
function attachmentIdApiUrl(
  apiBase: string,
  attachmentId: number,
  disposition?: string,
) {
  const p = new URLSearchParams({ id: String(attachmentId) });
  if (disposition) p.set("disposition", disposition);
  return `${apiBase}/attachment?${p.toString()}`;
}

function annexFileHref(
  apiBase: string,
  ruleParam: string,
  file: AdminRulesAnnexFileOut,
  disposition?: string,
): string {
  if (file.availableLocally && file.attachmentId > 0) {
    return attachmentIdApiUrl(apiBase, file.attachmentId, disposition);
  }
  if (file.flSeq.trim()) {
    return fileApiUrl(apiBase, ruleParam, file.flSeq, disposition);
  }
  if (file.downloadUrl.trim()) return file.downloadUrl.trim();
  return "#";
}

/** iframe 미리보기 — law.go.kr 등 외부 URL은 넣지 않음(자동 다운로드 방지) */
function annexInlinePreviewHref(
  apiBase: string,
  ruleParam: string,
  file: AdminRulesAnnexFileOut,
): string | null {
  if (file.kind !== "pdf") return null;
  if (file.availableLocally && file.attachmentId > 0) {
    return attachmentIdApiUrl(apiBase, file.attachmentId, "inline");
  }
  if (file.flSeq.trim()) {
    return fileApiUrl(apiBase, ruleParam, file.flSeq, "inline");
  }
  return null;
}

/** rule_config에 동일 param 중복 행이 있을 때 목록·React key 충돌 방지 */
function dedupeSourcesByParam(list: AdminRulesSource[]): AdminRulesSource[] {
  const byParam = new Map<string, AdminRulesSource>();
  for (const s of list) {
    const prev = byParam.get(s.param);
    if (!prev) {
      byParam.set(s.param, s);
      continue;
    }
    if (prev.table_in_db !== true && s.table_in_db === true) {
      byParam.set(s.param, s);
      continue;
    }
    const score = (x: AdminRulesSource) =>
      (x.table_presence?.annex ? 2 : 0) +
      (x.table_presence?.attachment ? 1 : 0) +
      (x.description?.trim() ? 1 : 0);
    if (score(s) > score(prev)) byParam.set(s.param, s);
  }
  return Array.from(byParam.values());
}

function sourceListKey(item: AdminRulesSource, index: number): string {
  return `${item.param}|${item.table_name}|${item.gubun ?? ""}|${index}`;
}

/** 제목 내 HTML 엔티티 복원 (`삭제 &lt;날짜&gt;` → `삭제 <날짜>`) */
function decodeAnnexTitleEntities(raw: string): string {
  return raw
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&");
}

/**
 * law.go.kr 별표·서식 목록과 같이:
 * - 정상: 전체 제목
 * - 삭제: `[별지 …]`는 유지, `삭제 <날짜>`는 회색
 */
function AnnexTitleLabel({
  title,
  className,
}: {
  title: string;
  className?: string;
}) {
  const decoded = decodeAnnexTitleEntities(title).trim();
  const m = decoded.match(/^(.*?)(\s*삭제\s*[<＜][^>＞]*[>＞]\s*)$/);
  if (m) {
    const head = (m[1] ?? "").trimEnd();
    const deleted = (m[2] ?? "").trim();
    return (
      <span className={className}>
        {head ? <span className="text-sky-700">{head}</span> : null}
        {head && deleted ? " " : null}
        <span className="font-normal text-slate-400">{deleted}</span>
      </span>
    );
  }
  return <span className={className}>{decoded}</span>;
}

function HanBadge({
  href,
  title,
}: {
  href: string;
  title: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={title}
      className="inline-flex h-7 w-7 items-center justify-center rounded border border-[#1e2f4f]/30 bg-[#1e2f4f] text-[10px] font-bold text-white shadow-sm hover:bg-[#162438]"
    >
      H
    </a>
  );
}

function PdfBadge({ href, title }: { href: string; title: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={title}
      className="inline-flex h-7 w-7 items-center justify-center rounded border border-[#1e2f4f]/30 bg-[#1e2f4f] text-[9px] font-bold text-white shadow-sm hover:bg-[#162438]"
    >
      PDF
    </a>
  );
}

export type AdminRulesInquiryViewProps = {
  /** 예: `/api/admin-rules` 또는 `/api/admin-rules-sqlite` */
  apiBase?: string;
  /** SQLite 화면에서는 크롤러가 Supabase만 쓰므로 기본 false 가능 */
  enableCrawl?: boolean;
  /** 벡터화(단건·일괄) — SQLite 조회 화면에서는 false */
  enableVectorize?: boolean;
  /** Excel 크롤링 대상(법률 제외) 병합 목록 — SQLite 조회 */
  crawlTargetCatalog?: boolean;
};

export default function AdminRulesInquiryView({
  apiBase = "/api/admin-rules",
  enableCrawl = true,
  enableVectorize = true,
  crawlTargetCatalog = false,
}: AdminRulesInquiryViewProps) {
  const [sources, setSources] = useState<AdminRulesSource[]>([]);
  const [selectedParam, setSelectedParam] = useState<string | null>(null);
  const [ruleDocument, setRuleDocument] = useState<AdminRulesDocumentOut | null>(
    null,
  );
  const [articleNavKeyword, setArticleNavKeyword] = useState("");
  const [mainTab, setMainTab] = useState<MainTab>("body");
  const [loadingSources, setLoadingSources] = useState(false);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [vectorizing, setVectorizing] = useState(false);
  const [crawling, setCrawling] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"info" | "success" | "error">(
    "info",
  );
  const [sourcesDiagnostic, setSourcesDiagnostic] = useState<{
    rule_config_table_exists: boolean;
    rule_config_row_count: number;
    meta_table_name?: string | null;
  } | null>(null);
  const [sourcesDbPath, setSourcesDbPath] = useState<string | null>(null);
  const [crawlTargetsMeta, setCrawlTargetsMeta] =
    useState<AdminRulesCrawlTargetsMeta | null>(null);
  const [listKeyword, setListKeyword] = useState("");
  const [listFamilyFilter, setListFamilyFilter] = useState<
    "all" | "admin" | "law"
  >("all");
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(
    () => new Set(),
  );
  const [tocOpen, setTocOpen] = useState(true);
  const [tocArticlesOpen, setTocArticlesOpen] = useState(true);
  const [tocAddendumOpen, setTocAddendumOpen] = useState(true);
  const [tocAnnexOpen, setTocAnnexOpen] = useState(true);
  const [expandedAnnex, setExpandedAnnex] = useState<Set<number>>(
    () => new Set(),
  );
  /** 별표 목록 클릭만으로 PDF iframe을 열지 않음 — 사용자가 「PDF 미리보기」 선택 시만 */
  const [pdfPreviewAnnexIds, setPdfPreviewAnnexIds] = useState<Set<number>>(
    () => new Set(),
  );
  const mainScrollRef = useRef<HTMLElement | null>(null);

  const scrollToFullSection = useCallback((tab: MainTab) => {
    const id =
      tab === "body"
        ? "adm-doc-top"
        : tab === "addendum"
          ? "adm-section-addendum"
          : "adm-section-annex";
    setTimeout(() => {
      globalThis.document.getElementById(id)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 0);
  }, []);

  useEffect(() => {
    const run = async () => {
      try {
        setLoadingSources(true);
        setMessage("");
        const res = await fetch(`${apiBase}/sources`, { cache: "no-store" });
        const text = await res.text();
        const data = JSON.parse(text) as {
          ok: boolean;
          sources?: AdminRulesSource[];
          db_path?: string;
          diagnostics?: {
            rule_config_table_exists: boolean;
            rule_config_row_count: number;
            meta_table_name?: string | null;
          };
          crawl_targets?: AdminRulesCrawlTargetsMeta | null;
          error?: string;
        };
        if (!data.ok) throw new Error(data.error || "목록 로드 실패");
        const list = dedupeSourcesByParam(data.sources ?? []);
        setSources(list);
        setSourcesDiagnostic(data.diagnostics ?? null);
        setSourcesDbPath(data.db_path?.trim() || null);
        setCrawlTargetsMeta(
          crawlTargetCatalog ? (data.crawl_targets ?? null) : null,
        );
        setSelectedParam((prev) => {
          if (prev !== null) return prev;
          if (!list.length) return null;
          const firstReady = list.find((s) => s.table_in_db === true);
          return (firstReady ?? list[0]).param;
        });
      } catch (e) {
        setSources([]);
        setSourcesDiagnostic(null);
        setSourcesDbPath(null);
        setCrawlTargetsMeta(null);
        setMessage(
          e instanceof Error ? e.message : "행정규칙 설정을 불러오지 못했습니다.",
        );
      } finally {
        setLoadingSources(false);
      }
    };
    run();
  }, [apiBase, crawlTargetCatalog]);

  useEffect(() => {
    if (!selectedParam) {
      setRuleDocument(null);
      return;
    }
    const src = sources.find((s) => s.param === selectedParam);
    if (sources.length > 0 && src && src.table_in_db === false) {
      setRuleDocument(null);
      setLoadingDoc(false);
      setMessage(
        `「${src.description}」은(는) 규칙 목록에는 있으나 본문·부칙·별표에 해당 키의 행이 없습니다. 적재·ADMIN_RULES_ROW_KEY_* 설정을 확인하세요.`,
      );
      return;
    }
    if (sources.length > 0 && !src) {
      return;
    }

    const ac = new AbortController();
    const run = async () => {
      try {
        setLoadingDoc(true);
        setMessage("");
        const res = await fetch(
          `${apiBase}/document?param=${encodeURIComponent(selectedParam)}`,
          { cache: "no-store", signal: ac.signal },
        );
        const text = await res.text();
        const data = JSON.parse(text) as {
          ok: boolean;
          document?: AdminRulesDocumentOut;
          error?: string;
        };
        if (!data.ok) throw new Error(data.error || "문서 로드 실패");
        const doc = data.document ?? null;
        setRuleDocument(doc);
        setExpandedAnnex(new Set());
        if (doc) {
          let tab: MainTab = "body";
          if (doc.tablePresence.body) {
            tab = "body";
          } else if (doc.addendumGroups.length > 0) {
            tab = "addendum";
          } else if (doc.annexes.length > 0) {
            tab = "annex";
          }
          setMainTab(tab);
          setTimeout(() => scrollToFullSection(tab), 0);
        } else {
          setMainTab("body");
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setRuleDocument(null);
        setMessage(
          e instanceof Error ? e.message : "행정규칙 본문을 불러오지 못했습니다.",
        );
      } finally {
        setLoadingDoc(false);
      }
    };
    void run();
    return () => ac.abort();
  }, [apiBase, selectedParam, sources, scrollToFullSection]);

  useEffect(() => {
    if (!ruleDocument) return;
    mainScrollRef.current?.scrollTo({ top: 0 });
  }, [ruleDocument]);

  const flatArticles = useMemo(() => {
    if (!ruleDocument) return [];
    const out: AdminRulesArticleRow[] = [];
    for (const a of ruleDocument.looseArticles) out.push(a);
    for (const ch of ruleDocument.chapters) {
      for (const a of ch.articles) out.push(a);
    }
    return out;
  }, [ruleDocument]);

  const filteredSources = useMemo(() => {
    const q = listKeyword.trim().toLowerCase();
    return sources.filter((item) => {
      if (listFamilyFilter === "admin" && item.source_family === "law") {
        return false;
      }
      if (listFamilyFilter === "law" && item.source_family !== "law") {
        return false;
      }
      if (!q) return true;
      const blob = [
        item.description,
        item.param,
        item.table_name,
        item.gubun ?? "",
        item.category ?? "",
        item.note ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }, [sources, listKeyword, listFamilyFilter]);

  const listFilterActive =
    listKeyword.trim().length > 0 || listFamilyFilter !== "all";

  const navArticles = useMemo(() => {
    const q = articleNavKeyword.trim().toLowerCase();
    if (!q) return flatArticles;
    return flatArticles.filter((a) => {
      const blob = `${a.article_no} ${a.article_title} ${a.article_content}`.toLowerCase();
      return blob.includes(q);
    });
  }, [flatArticles, articleNavKeyword]);

  const articleImagesByNo = useMemo(() => {
    const map = new Map<string, AdminRulesArticleImageOut[]>();
    for (const im of ruleDocument?.articleImages ?? []) {
      const no = im.article_no.trim();
      if (!no) continue;
      const list = map.get(no) ?? [];
      list.push(im);
      map.set(no, list);
    }
    return map;
  }, [ruleDocument?.articleImages]);

  useEffect(() => {
    if (!ruleDocument) return;
    setExpandedChapters(new Set(ruleDocument.chapters.map((c) => c.id)));
  }, [ruleDocument]);

  const scrollToArticle = useCallback((id: number) => {
    const el = globalThis.document.getElementById(`adm-article-${id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const goArticle = useCallback(
    (id: number) => {
      setMainTab("body");
      setTimeout(() => scrollToArticle(id), 0);
    },
    [scrollToArticle],
  );

  const goAddendumSection = useCallback((index: number) => {
    setMainTab("addendum");
    setTimeout(() => {
      globalThis.document
        .getElementById(`adm-addendum-${index}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }, []);

  const goAnnexItem = useCallback((annexId: number) => {
    setMainTab("annex");
    setExpandedAnnex((prev) => {
      const n = new Set(prev);
      n.add(annexId);
      return n;
    });
    setPdfPreviewAnnexIds(new Set());
    setTimeout(() => {
      globalThis.document
        .getElementById(`adm-annex-${annexId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }, []);

  const annexIdByTitleFragment = useMemo(() => {
    const map = new Map<string, number>();
    for (const ax of ruleDocument?.annexes ?? []) {
      const t = ax.title.replace(/\s+/g, "");
      map.set(t, ax.id);
      const m = ax.title.match(/별표\s*\d+(?:-\d+)?(?:의\d+)?/);
      if (m) map.set(m[0].replace(/\s+/g, ""), ax.id);
    }
    return map;
  }, [ruleDocument?.annexes]);

  const goAnnexByTitleFragment = useCallback(
    (fragment: string) => {
      const key = fragment.replace(/\s+/g, "");
      const direct = annexIdByTitleFragment.get(key);
      if (direct != null) {
        goAnnexItem(direct);
        return;
      }
      const annexes = ruleDocument?.annexes ?? [];
      if (/별표/.test(key)) {
        const num = key.match(/\d+/)?.[0];
        if (num) {
          const found = annexes.find(
            (ax) => ax.title.includes("별표") && ax.title.includes(num),
          );
          if (found) {
            goAnnexItem(found.id);
            return;
          }
        }
      }
      if (/별지/.test(key)) {
        const found = annexes.find((ax) => {
          const t = ax.title.replace(/\s+/g, "");
          return t.includes(key) || key.includes(t.slice(0, 8));
        });
        if (found) goAnnexItem(found.id);
      }
    },
    [annexIdByTitleFragment, goAnnexItem, ruleDocument?.annexes],
  );

  const toggleChapter = (id: string) => {
    setExpandedChapters((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const toggleAnnex = (id: number) => {
    setExpandedAnnex((prev) => {
      const n = new Set(prev);
      if (n.has(id)) {
        n.delete(id);
        setPdfPreviewAnnexIds((p) => {
          const next = new Set(p);
          next.delete(id);
          return next;
        });
      } else {
        n.add(id);
        setPdfPreviewAnnexIds((p) => {
          const next = new Set(p);
          next.delete(id);
          return next;
        });
      }
      return n;
    });
  };

  const openPdfPreview = (annexId: number) => {
    setPdfPreviewAnnexIds((prev) => {
      const n = new Set(prev);
      n.add(annexId);
      return n;
    });
  };

  const pickPreviewFile = (annex: AdminRulesAnnexOut) => {
    const pdf = annex.files.find(
      (f) => f.kind === "pdf" && (f.availableLocally || f.downloadUrl),
    );
    if (pdf) return pdf;
    return null;
  };

  const annexImageFiles = (annex: AdminRulesAnnexOut) =>
    annex.files.filter((f) => f.kind === "image");

  const annexDownloadFiles = (annex: AdminRulesAnnexOut) =>
    annex.files.filter((f) => f.kind === "han" || f.kind === "pdf");

  const selectedSource = sources.find((s) => s.param === selectedParam);
  const annexFileParam =
    ruleDocument?.fileContentParam?.trim() ||
    selectedSource?.satellite_annex_host_param?.trim() ||
    selectedSource?.param ||
    "";

  const runCrawl = useCallback(
    async (param: string, label: string) => {
      if (crawling || vectorizing) return;
      if (
        !globalThis.confirm(
          `「${label}」을(를) law.go.kr에서 재크롤링합니다.\n· 기존 Supabase 데이터 삭제 후 수집 (--force)\n· 결과는 Supabase(admin_rule*)에 직접 저장\n계속할까요?`,
        )
      ) {
        return;
      }
      setCrawling(true);
      setMessage("");
      setMessageTone("info");
      setMessage(`「${label}」 크롤링 중… (수 분 소요될 수 있습니다)`);
      try {
        const res = await fetch(`${apiBase}/crawl`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ param, force: true }),
        });
        const data = (await res.json()) as {
          ok: boolean;
          error?: string;
          sync?: { counts?: Record<string, number> };
        };
        if (!res.ok || !data.ok) {
          throw new Error(data.error || "크롤링 실패");
        }
        const c = data.sync?.counts ?? {};
        setMessageTone("success");
        setMessage(
          `「${label}」 크롤링 완료 — 본문 ${c.admin_rule ?? 0} · 부칙 ${c.admin_rule_addendum ?? 0} · 별표 ${c.admin_rule_annex ?? 0}`,
        );
        // 문서 다시 로드
        setSelectedParam(null);
        setTimeout(() => setSelectedParam(param), 0);
      } catch (e) {
        setMessageTone("error");
        setMessage(
          e instanceof Error ? e.message : "크롤링 중 오류가 발생했습니다.",
        );
      } finally {
        setCrawling(false);
      }
    },
    [apiBase, crawling, vectorizing],
  );

  const runVectorize = useCallback(async (param: string, label: string) => {
    if (vectorizing || crawling) return;
    setVectorizing(true);
    setMessage("");
    setMessageTone("info");
    try {
      const res = await fetch(`${apiBase}/vectorize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ param, embed: true, replace: true }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        chunkCount?: number;
        embeddedCount?: number;
        chunksTable?: string;
        tablePrefix?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "벡터화 실패");
      }
      setMessageTone("success");
      setMessage(
        `「${label}」 벡터화 완료 — 청크 ${data.chunkCount ?? 0}건, 임베딩 ${data.embeddedCount ?? 0}건 → ${data.chunksTable ?? data.tablePrefix ?? "admin_rule/raw_rule"}_chunks`,
      );
    } catch (e) {
      setMessageTone("error");
      setMessage(
        e instanceof Error ? e.message : "벡터화 중 오류가 발생했습니다.",
      );
    } finally {
      setVectorizing(false);
    }
  }, [apiBase, vectorizing, crawling]);

  const runVectorizeAll = useCallback(async () => {
    if (vectorizing || crawling) return;
    const ready = sources.filter((s) => s.table_in_db !== false);
    if (ready.length === 0) {
      setMessageTone("error");
      setMessage("벡터화할 규칙이 없습니다.");
      return;
    }
    if (
      !globalThis.confirm(
        `본문이 있는 규칙 ${ready.length}건을 Supabase에서 읽어 벡터화합니다. 기존 벡터는 교체됩니다. 계속할까요?`,
      )
    ) {
      return;
    }
    setVectorizing(true);
    setMessage("");
    setMessageTone("info");
    try {
      const res = await fetch(`${apiBase}/vectorize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true, embed: true, replace: true }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        processed?: number;
        chunkCount?: number;
        embeddedCount?: number;
        errors?: { param: string; description: string; error: string }[];
        results?: {
          chunksTable: string;
          tablePrefix: string;
          chunkCount: number;
          embeddedCount: number;
        }[];
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "일괄 벡터화 실패");
      }
      const adminN =
        data.results?.filter((r) => r.tablePrefix === "admin_rule").length ?? 0;
      const rawN =
        data.results?.filter((r) => r.tablePrefix === "raw_rule").length ?? 0;
      const errLines =
        data.errors?.map((x) => `· ${x.description}: ${x.error}`).join("\n") ??
        "";
      setMessageTone(data.errors?.length ? "error" : "success");
      setMessage(
        [
          `일괄 벡터화 완료 — ${data.processed ?? 0}건 (admin_rule ${adminN} · raw_rule ${rawN}), 청크 ${data.chunkCount ?? 0}건, 임베딩 ${data.embeddedCount ?? 0}건`,
          errLines ? `실패:\n${errLines}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    } catch (e) {
      setMessageTone("error");
      setMessage(
        e instanceof Error ? e.message : "일괄 벡터화 중 오류가 발생했습니다.",
      );
    } finally {
      setVectorizing(false);
    }
  }, [apiBase, sources, vectorizing, crawling]);

  return (
    <div className="min-h-screen bg-slate-100 p-3 md:p-5">
      <div className="mx-auto flex max-w-[1800px] flex-col gap-3">
        {message ? (
          <div
            className={`rounded-lg border px-4 py-3 text-sm whitespace-pre-line shadow-sm ${
              messageTone === "success"
                ? "border-emerald-200/90 bg-emerald-50 text-emerald-900"
                : messageTone === "error"
                  ? "border-amber-200/90 bg-amber-50 text-amber-900"
                  : "border-blue-200/90 bg-blue-50 text-blue-800"
            }`}
          >
            {message}
          </div>
        ) : null}

        <div className="flex h-[calc(100vh-5.5rem)] max-h-[calc(100vh-5.5rem)] flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-md lg:h-[calc(100vh-6rem)] lg:max-h-[calc(100vh-6rem)] lg:flex-row">
          <aside
            className="flex max-h-[min(40vh,16rem)] shrink-0 flex-col overflow-hidden border-b border-slate-200 bg-slate-50/95 lg:max-h-none lg:h-full lg:w-[min(100%,24rem)] xl:w-[min(100%,26rem)] lg:shrink-0 lg:border-b-0 lg:border-r lg:border-slate-200"
            aria-label="행정규칙 목록"
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 px-3 py-2.5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                규칙 목록
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={
                    !enableVectorize ||
                    vectorizing ||
                    crawling ||
                    sources.length === 0
                  }
                  onClick={() => void runVectorizeAll()}
                  className="rounded-md bg-[#1e2f4f] px-2 py-1 text-[11px] font-medium text-white hover:bg-[#162438] disabled:cursor-not-allowed disabled:opacity-50"
                  title={
                    enableVectorize
                      ? "Supabase admin_rule* → admin_rule_chunks / raw_rule_chunks"
                      : "SQLite 조회 화면에서는 벡터화를 사용할 수 없습니다"
                  }
                >
                  {vectorizing ? "벡터화 중…" : "전체 벡터화"}
                </button>
                <span className="tabular-nums text-xs font-medium text-slate-400">
                  {listFilterActive
                    ? `${filteredSources.length}/${sources.length}건`
                    : `${sources.length}건`}
                </span>
              </div>
            </div>

            <div className="shrink-0 space-y-2 border-b border-slate-200/80 bg-white px-3 py-2.5">
              {crawlTargetCatalog && crawlTargetsMeta ? (
                <p
                  className="text-[11px] leading-relaxed text-slate-500"
                  title={crawlTargetsMeta.excelPath ?? undefined}
                >
                  크롤링 대상 {crawlTargetsMeta.allowedRows}건 (법률{" "}
                  {crawlTargetsMeta.excludedLawStatuteRows}건 제외)
                </p>
              ) : null}
              <p className="text-[11px] font-medium text-slate-500">조회 조건</p>
              <label className="block">
                <span className="sr-only">규칙명·param 검색</span>
                <input
                  type="search"
                  value={listKeyword}
                  onChange={(e) => setListKeyword(e.target.value)}
                  placeholder="규칙명, param, 구분 검색…"
                  className="w-full rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-sky-300 focus:bg-white focus:ring-1 focus:ring-sky-200"
                />
              </label>
              <div className="flex items-center gap-2">
                <label className="min-w-0 flex-1">
                  <span className="sr-only">자료 구분</span>
                  <select
                    value={listFamilyFilter}
                    onChange={(e) =>
                      setListFamilyFilter(
                        e.target.value as "all" | "admin" | "law",
                      )
                    }
                    className="w-full rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm text-slate-800 outline-none focus:border-sky-300 focus:bg-white focus:ring-1 focus:ring-sky-200"
                  >
                    <option value="all">
                      {crawlTargetCatalog
                        ? "전체 (법률 제외)"
                        : "전체 (행정규칙·법령)"}
                    </option>
                    <option value="admin">행정규칙 (admin_rule)</option>
                    <option value="law">
                      {crawlTargetCatalog
                        ? "시행령·규칙 등 (raw_rule)"
                        : "법령 (raw_rule)"}
                    </option>
                  </select>
                </label>
                {listFilterActive ? (
                  <CasResetButton
                    type="button"
                    onClick={() => {
                      setListKeyword("");
                      setListFamilyFilter("all");
                    }}
                  />
                ) : null}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
              {loadingSources ? (
                <p className="px-3 py-6 text-center text-sm text-slate-500">
                  불러오는 중…
                </p>
              ) : sources.length === 0 ? (
                <div className="space-y-2 px-3 py-6 text-center text-sm leading-relaxed text-slate-500">
                  <p>
                    {sourcesDiagnostic &&
                    !sourcesDiagnostic.rule_config_table_exists
                      ? "연결한 Supabase에 rule_master 테이블이 없습니다."
                      : sourcesDiagnostic &&
                          sourcesDiagnostic.rule_config_row_count === 0
                        ? `${sourcesDiagnostic.meta_table_name ?? "규칙 메타"} 테이블은 있으나 행이 없습니다. 크롤링을 실행하세요.`
                        : "목록을 불러오지 못했거나 규칙 메타 테이블이 비어 있습니다."}
                  </p>
                  {sourcesDbPath ? (
                    <p className="break-all font-mono text-xs text-slate-400">
                      {sourcesDbPath}
                    </p>
                  ) : null}
                  <p className="text-xs text-slate-400">
                    .env.local 수정 후에는 개발 서버를 다시 띄우세요.
                  </p>
                </div>
              ) : filteredSources.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-slate-500">
                  조회 조건에 맞는 규칙이 없습니다.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {filteredSources.map((item, index) => {
                    const sel = item.param === selectedParam;
                    const inDb = item.table_in_db !== false;
                    const tp = item.table_presence;
                    const mainTbl =
                      item.unified_main_table ??
                      (item.source_family === "law" ? "raw_rule" : "admin_rule");
                    const prefix =
                      mainTbl === "raw_rule" ? "raw_rule" : "admin_rule";
                    const crawlHint = item.crawl_target_only
                      ? `크롤링 대상 (미적재)\n문서구분: ${item.crawl_document_type ?? "—"} · 대상: ${item.crawl_target_flag ?? "—"} · 포털번호: ${item.crawl_portal_law_id ?? "—"}\n`
                      : "";
                    const tableHint = tp
                      ? `${crawlHint}gubun=${item.gubun ?? "—"} | param=${item.param}, table_name=${item.table_name}\n통합: ${mainTbl}, ${prefix}_addendum/annex/attachment (${item.source_family === "law" ? "법령→raw" : "행정규칙→admin"})\n부칙 (${tp.addendum ? "있음" : "없음"}) · 별표 (${tp.annex ? "있음" : "없음"}) · 첨부 (${tp.attachment ? "있음" : "없음"})`
                      : `${crawlHint}gubun=${item.gubun ?? "—"} · ${mainTbl}`;
                    return (
                      <li key={sourceListKey(item, index)}>
                        <button
                          type="button"
                          title={
                            inDb
                              ? tableHint
                              : `${item.description} — 통합 본문에 해당 키 없음\n${tableHint}`
                          }
                          onClick={() => {
                            setSelectedParam(item.param);
                            setMessage("");
                          }}
                          className={`w-full px-3.5 py-2.5 text-left text-sm leading-normal transition ${
                            sel
                              ? "border-l-[3px] border-l-sky-600 bg-sky-50/90 text-slate-900"
                              : inDb
                                ? "border-l-[3px] border-l-transparent text-slate-700 hover:bg-white"
                                : "border-l-[3px] border-l-amber-400/80 bg-amber-50/40 text-slate-600 hover:bg-amber-50/70"
                          }`}
                        >
                          {item.description}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </aside>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
            {loadingDoc && selectedParam ? (
              <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
                본문을 불러오는 중…
              </div>
            ) : selectedSource && ruleDocument ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-medium text-slate-800">
                  {ruleDocument.lawName}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {ruleDocument.promulgationNo
                    ? `${ruleDocument.promulgationNo} · 시행 ${ruleDocument.promulgationDate || "—"}`
                    : ruleDocument.promulgationDate || ""}
                  {ruleDocument.seqId
                    ? ` · seq_id ${ruleDocument.seqId}`
                    : ""}
                </p>
                {selectedSource.url ? (
                  <a
                    href={selectedSource.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block text-xs text-sky-700 hover:underline"
                  >
                    국가법령정보센터에서 보기
                  </a>
                ) : null}
                {ruleDocument?.satelliteAnnexHost ? (
                  <p className="mt-2 max-w-2xl text-xs leading-relaxed text-amber-900/90">
                    본문·부칙은 없습니다. 아래 별표·서식은 「
                    {ruleDocument.satelliteAnnexHost.description}」(
                    {ruleDocument.satelliteAnnexHost.param})에 포함된 항목 중
                    이 규칙명과 연관된 {ruleDocument.satelliteAnnexHost.matchedAnnexCount}
                    건을 표시합니다.
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {enableCrawl ? (
                <button
                  type="button"
                  disabled={crawling || vectorizing || !selectedParam}
                  onClick={() => {
                    if (!selectedParam || !selectedSource) return;
                    void runCrawl(selectedParam, selectedSource.description);
                  }}
                  className="rounded-md bg-[#1e2f4f] px-3 py-1.5 text-xs font-medium text-white shadow hover:bg-[#162438] disabled:cursor-not-allowed disabled:opacity-50"
                  title="law.go.kr 수집 → Supabase 직접 저장"
                >
                  {crawling ? "크롤링 중…" : "크롤링"}
                </button>
                ) : null}
                <button
                  type="button"
                  disabled={
                    !enableVectorize ||
                    vectorizing ||
                    crawling ||
                    !selectedParam
                  }
                  onClick={() => {
                    if (!selectedParam || !selectedSource) return;
                    void runVectorize(
                      selectedParam,
                      selectedSource.description,
                    );
                  }}
                  className="rounded-md bg-[#1e2f4f] px-3 py-1.5 text-xs font-medium text-white shadow hover:bg-[#162438] disabled:cursor-not-allowed disabled:opacity-50"
                  title={
                    enableVectorize
                      ? "본문 → admin_rule_chunks 또는 raw_rule_chunks"
                      : "SQLite 조회 화면에서는 벡터화를 사용할 수 없습니다"
                  }
                >
                  {vectorizing ? "벡터화 중…" : "벡터화"}
                </button>
                <div className="flex flex-wrap gap-1 rounded-lg bg-white p-1 ring-1 ring-slate-200">
                {(
                  [
                    ["body", "본문"],
                    ["addendum", `부칙 (${ruleDocument.addendumGroups.length})`],
                    ["annex", `별표·서식 (${ruleDocument.annexes.length})`],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setMainTab(id);
                      scrollToFullSection(id);
                    }}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                      mainTab === id
                        ? "bg-sky-600 text-white shadow"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
              <aside className="flex w-full max-h-[min(52vh,22rem)] shrink-0 flex-col border-b border-slate-200 bg-slate-50 lg:max-h-none lg:w-[min(100%,26rem)] lg:max-w-[28rem] lg:border-b-0 lg:border-r">
                {ADMIN_RULES_SHOW_ARTICLE_NAV_SEARCH ? (
                  <div className="border-b border-slate-200 p-3">
                    <label
                      htmlFor="adm-article-search"
                      className="text-xs font-medium text-slate-700"
                    >
                      본문 검색
                    </label>
                    <input
                      id="adm-article-search"
                      type="search"
                      value={articleNavKeyword}
                      onChange={(e) => setArticleNavKeyword(e.target.value)}
                      placeholder="조문번호·제목·본문"
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-2 text-sm outline-none focus:border-sky-500"
                    />
                  </div>
                ) : null}
                <nav
                  className="min-h-0 flex-1 overflow-y-auto p-3 text-sm"
                  aria-label="행정규칙 목차"
                >
                  <div className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
                    <button
                      type="button"
                      onClick={() => setTocOpen((o) => !o)}
                      className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left hover:bg-slate-50"
                    >
                      <span className="inline-flex h-6 min-w-[1.5rem] shrink-0 items-center justify-center rounded border border-slate-400 bg-white text-xs font-bold text-slate-600">
                        {tocOpen ? "−" : "+"}
                      </span>
                      <span className="flex-1 text-[15px] font-bold leading-tight text-slate-900">
                        {ruleDocument.lawName}
                      </span>
                    </button>
                  </div>
                  {tocOpen ? (
                    <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50/80 p-2">
                      <div>
                        <button
                          type="button"
                          onClick={() => setTocArticlesOpen((o) => !o)}
                          className="flex w-full items-center gap-2 rounded-md bg-slate-100 px-2 py-2 text-left shadow-sm ring-1 ring-slate-200/80"
                        >
                          <span className="inline-flex h-6 min-w-[1.5rem] shrink-0 items-center justify-center rounded border border-slate-400 bg-white text-xs font-bold text-slate-600">
                            {tocArticlesOpen ? "−" : "+"}
                          </span>
                          <span className="text-sm font-bold text-slate-900">
                            본문
                          </span>
                        </button>
                        {tocArticlesOpen ? (
                          <div className="relative mt-2 space-y-1 bg-white px-1 py-2 pl-3 shadow-inner">
                            {ruleDocument.looseArticles.length ? (
                              <div className="mb-2 text-xs font-semibold text-slate-500">
                                앞부 본문
                              </div>
                            ) : null}
                            {ruleDocument.looseArticles.map((a) => (
                              <TocArt key={`toc-loose-${a.id}`} a={a} onPick={goArticle} />
                            ))}
                            {ruleDocument.chapters.map((ch) => {
                              const open = expandedChapters.has(ch.id);
                              return (
                                <div key={`toc-${ch.id}`} className="mt-2">
                                  <div className="overflow-hidden rounded-md border border-rose-200 bg-rose-50/95 shadow-sm ring-1 ring-rose-100/80">
                                    <div className="flex items-start gap-1.5 px-2 py-1.5">
                                      <button
                                        type="button"
                                        onClick={() => toggleChapter(ch.id)}
                                        className="mt-0.5 w-6 shrink-0 text-center text-[11px] font-medium text-rose-800/80"
                                        aria-expanded={open}
                                      >
                                        {open ? "▼" : "▶"}
                                      </button>
                                      <span className="min-w-0 flex-1 text-left text-[13px] font-bold leading-snug text-rose-950">
                                        {ch.title}
                                      </span>
                                    </div>
                                  </div>
                                  {open
                                    ? ch.articles
                                        .filter((a) =>
                                          navArticles.some((x) => x.id === a.id),
                                        )
                                        .map((a) => (
                                          <TocArt
                                            key={`toc-ch-art-${ch.id}-${a.id}`}
                                            a={a}
                                            onPick={goArticle}
                                            indent
                                          />
                                        ))
                                    : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                      <div>
                        <button
                          type="button"
                          onClick={() => setTocAddendumOpen((o) => !o)}
                          className="flex w-full items-center gap-2 rounded-md bg-slate-100 px-2 py-2 text-left shadow-sm ring-1 ring-slate-200/80"
                        >
                          <span className="inline-flex h-6 min-w-[1.5rem] shrink-0 items-center justify-center rounded border border-slate-400 bg-white text-xs font-bold text-slate-600">
                            {tocAddendumOpen ? "−" : "+"}
                          </span>
                          <span className="text-sm font-bold text-slate-900">
                            부칙 ({ruleDocument.addendumGroups.length})
                          </span>
                        </button>
                        {tocAddendumOpen ? (
                          <div className="mt-2 border-t border-slate-200/80 pt-2">
                            {ruleDocument.addendumGroups.length === 0 ? (
                              <p className="px-1 text-xs text-slate-500">
                                {ruleDocument.tablePresence.addendum
                                  ? `${ruleDocument.tableName}_addendum 테이블에 부칙 행이 없습니다.`
                                  : `${ruleDocument.tableName}_addendum 테이블이 없습니다.`}
                              </p>
                            ) : (
                              <ul className="max-h-80 space-y-0.5 overflow-y-auto pl-1">
                                {ruleDocument.addendumGroups.map((g, i) => (
                                  <li key={`adm-byl-n-${i}-${g.key}`}>
                                    <button
                                      type="button"
                                      onClick={() => goAddendumSection(i)}
                                      className="w-full rounded-md px-1.5 py-1.5 text-left text-[13px] leading-snug text-slate-700 hover:bg-sky-50"
                                    >
                                      <span className="break-words">
                                        {g.header.trim() || "부칙"}
                                      </span>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        ) : null}
                      </div>
                      <div>
                        <button
                          type="button"
                          onClick={() => setTocAnnexOpen((o) => !o)}
                          className="flex w-full items-center gap-2 rounded-md bg-slate-100 px-2 py-2 text-left shadow-sm ring-1 ring-slate-200/80"
                        >
                          <span className="inline-flex h-6 min-w-[1.5rem] shrink-0 items-center justify-center rounded border border-slate-400 bg-white text-xs font-bold text-slate-600">
                            {tocAnnexOpen ? "−" : "+"}
                          </span>
                          <span className="text-sm font-bold text-slate-900">
                            별표·서식 ({ruleDocument.annexes.length})
                          </span>
                        </button>
                        {tocAnnexOpen ? (
                          <div className="mt-2 border-t border-slate-200/80 pt-2">
                            {ruleDocument.annexes.length === 0 ? (
                              <p className="px-1 text-xs text-slate-500">
                                {ruleDocument.tablePresence.annex
                                  ? `${ruleDocument.tableName}_annex 테이블에 별표·서식 행이 없습니다.`
                                  : `${ruleDocument.tableName}_annex 테이블이 없습니다.`}{" "}
                                {!ruleDocument.tablePresence.attachment
                                  ? `첨부(${ruleDocument.tableName}_attachment) 테이블이 없으면 파일 경로를 연결할 수 없습니다.`
                                  : ""}
                              </p>
                            ) : (
                              <ul className="max-h-96 space-y-0.5 overflow-y-auto pl-1">
                                {ruleDocument.annexes.map((ax) => (
                                  <li key={`toc-ann-${ax.id}`}>
                                    <button
                                      type="button"
                                      onClick={() => goAnnexItem(ax.id)}
                                      className="w-full rounded-md px-1.5 py-1.5 text-left text-[13px] leading-snug text-slate-700 hover:bg-sky-50"
                                    >
                                      <span className="min-w-0 flex-1 break-words">
                                        <AnnexTitleLabel title={ax.title} />
                                      </span>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </nav>
              </aside>

              <main
                ref={mainScrollRef}
                tabIndex={-1}
                className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-white outline-none"
              >
                <div className="px-6 py-8">
                  <header
                    id="adm-doc-top"
                    className="scroll-mt-4 border-b border-slate-200 pb-6 text-center"
                  >
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
                      {ruleDocument.lawName}
                    </h2>
                    <p className="mt-3 text-sm text-slate-600">
                      {ruleDocument.promulgationNo
                        ? `[${ruleDocument.promulgationNo}]`
                        : ""}{" "}
                      {ruleDocument.promulgationDate
                        ? `시행 ${ruleDocument.promulgationDate}`
                        : ""}
                    </p>
                  </header>

                  <section
                    id="adm-section-body"
                    className="scroll-mt-4 border-t border-slate-200 pt-10"
                  >
                    <h3 className="mb-6 text-lg font-bold text-slate-900 md:text-xl">
                      본문
                    </h3>
                    <div className="mx-auto max-w-4xl">
                      {loadingDoc ? (
                        <p className="text-center text-slate-500">로딩 중...</p>
                      ) : navArticles.length === 0 ? (
                        <p className="text-sm text-slate-500">
                          표시할 본문 조항이 없습니다.
                          {ruleDocument.addendumGroups.length > 0 ||
                          ruleDocument.annexes.length > 0
                            ? " 부칙·별표·서식 탭에서 내용을 확인할 수 있습니다."
                            : ""}
                        </p>
                      ) : (
                        <div className="divide-y divide-slate-200 border-y border-slate-200">
                          {navArticles.map((article) => {
                            const articleNo = article.article_no.trim();
                            const imgs = articleImagesByNo.get(articleNo) ?? [];
                            const heading = resolveArticleHeading(
                              article.article_content ?? "",
                              articleNo,
                              article.article_title?.trim() || articleNo || "—",
                            );
                            return (
                              <article
                                key={article.id}
                                id={`adm-article-${article.id}`}
                                className="scroll-mt-4 py-8 first:pt-6"
                              >
                                {heading !== "—" ? (
                                  <h4 className="mb-5 text-lg font-bold text-emerald-900 md:text-xl">
                                    {heading}
                                  </h4>
                                ) : null}
                                <AdminRulesArticleContent
                                  articleNo={articleNo}
                                  articleTitle={heading}
                                  content={article.article_content ?? ""}
                                  images={imgs}
                                  onAnnexTitle={goAnnexByTitleFragment}
                                />
                              </article>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </section>

                  <section
                    id="adm-section-addendum"
                    className="scroll-mt-4 border-t border-slate-200 pt-14"
                  >
                    <h3 className="mb-6 text-lg font-bold text-slate-900 md:text-xl">
                      부칙
                    </h3>
                    {ruleDocument.addendumGroups.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        {ruleDocument.tablePresence.addendum
                          ? `${ruleDocument.tableName}_addendum 테이블에 부칙 행이 없습니다.`
                          : `부칙 데이터를 불러올 테이블(${ruleDocument.tableName}_addendum)이 없습니다.`}
                      </p>
                    ) : (
                      <div className="space-y-10">
                        {ruleDocument.addendumGroups.map((g, i) => (
                          <section
                            key={`adm-byl-${i}-${g.key}`}
                            id={`adm-addendum-${i}`}
                            className="scroll-mt-4"
                          >
                            <h4 className="mb-4 border-b border-slate-200 pb-2 text-base font-bold text-slate-900">
                              부 칙{" "}
                              <span className="font-semibold text-sky-700">
                                {g.header.trim() || ""}
                              </span>
                            </h4>
                            <div className="space-y-4">
                              {g.rows.map((r, idx) => (
                                <div key={`adm-byl-${i}-r-${idx}`}>
                                  {r.article_no?.trim() ? (
                                    <p className="text-sm font-semibold text-sky-900">
                                      {r.article_no}
                                    </p>
                                  ) : null}
                                  <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap text-slate-800">
                                    {r.article_content}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </section>
                        ))}
                      </div>
                    )}
                  </section>

                  <section
                    id="adm-section-annex"
                    className="scroll-mt-4 border-t border-slate-200 pt-14 pb-10"
                  >
                    <h3 className="mb-6 text-lg font-bold text-slate-900 md:text-xl">
                      별표·서식
                    </h3>
                    {ruleDocument.annexes.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        {ruleDocument.tablePresence.annex
                          ? `${ruleDocument.tableName}_annex 테이블에 별표·서식 행이 없습니다.`
                          : `별표·서식 테이블(${ruleDocument.tableName}_annex)이 없습니다.`}{" "}
                        {!ruleDocument.tablePresence.attachment
                          ? `첨부(${ruleDocument.tableName}_attachment)가 없으면 다운로드용 파일 메타를 매칭할 수 없습니다.`
                          : ""}
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {ruleDocument.annexes.map((ax) => {
                          const open = expandedAnnex.has(ax.id);
                          const preview = pickPreviewFile(ax);
                          const images = annexImageFiles(ax);
                          const downloads = annexDownloadFiles(ax);
                          return (
                            <li
                              key={ax.id}
                              id={`adm-annex-${ax.id}`}
                              className="scroll-mt-4 rounded-lg border border-slate-200 bg-white shadow-sm"
                            >
                              <div className="flex items-start gap-2 px-3 py-2">
                                <button
                                  type="button"
                                  onClick={() => toggleAnnex(ax.id)}
                                  className="mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-slate-400 bg-slate-50 text-sm font-bold text-slate-600"
                                  aria-expanded={open}
                                >
                                  {open ? "−" : "+"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleAnnex(ax.id)}
                                  className="min-w-0 flex-1 text-left text-sm font-medium text-slate-900 hover:text-sky-800"
                                >
                                  <AnnexTitleLabel title={ax.title} />
                                </button>
                                <span className="flex shrink-0 gap-1 pt-0.5">
                                  {downloads.map((f) => {
                                    const down = annexFileHref(
                                      apiBase,
                                      annexFileParam,
                                      f,
                                      "attachment",
                                    );
                                    if (f.kind === "han") {
                                      return (
                                        <HanBadge
                                          key={`${f.attachmentId}-${f.flSeq}-h`}
                                          href={down}
                                          title={
                                            f.availableLocally
                                              ? `한글 다운로드: ${f.fileName}`
                                              : `원본 한글 링크: ${f.fileName}`
                                          }
                                        />
                                      );
                                    }
                                    return (
                                      <PdfBadge
                                        key={`${f.attachmentId}-${f.flSeq}-p`}
                                        href={down}
                                        title={
                                          f.availableLocally
                                            ? `PDF 다운로드: ${f.fileName}`
                                            : `원본 PDF 링크: ${f.fileName}`
                                        }
                                      />
                                    );
                                  })}
                                </span>
                              </div>
                              {open && ax.annexContent?.trim() ? (
                                <div className="border-t border-slate-100 px-4 py-3 text-sm whitespace-pre-wrap text-slate-700">
                                  {ax.annexContent}
                                </div>
                              ) : null}
                              {open && images.length > 0 ? (
                                <div className="border-t border-slate-200 bg-slate-100 p-3">
                                  <p className="mb-2 text-xs text-slate-500">
                                    이미지 미리보기 ({images.length})
                                  </p>
                                  <div className="flex flex-col gap-3">
                                    {images.map((img) => {
                                      const src = annexFileHref(
                                        apiBase,
                                        annexFileParam,
                                        img,
                                        "inline",
                                      );
                                      return (
                                        <figure
                                          key={`${img.attachmentId}-${img.flSeq}-img`}
                                          className="overflow-hidden rounded border border-slate-300 bg-white p-2"
                                        >
                                          <figcaption className="mb-1 truncate text-[11px] text-slate-500">
                                            {img.fileName}
                                            {!img.availableLocally &&
                                            img.downloadUrl ? (
                                              <a
                                                className="ml-2 text-sky-700 underline"
                                                href={img.downloadUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                              >
                                                원본 다운로드
                                              </a>
                                            ) : null}
                                          </figcaption>
                                          {/* eslint-disable-next-line @next/next/no-img-element */}
                                          <img
                                            src={src}
                                            alt={img.fileName}
                                            className="max-h-[70vh] w-auto max-w-full"
                                          />
                                        </figure>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : null}
                              {open && preview ? (
                                <div className="border-t border-slate-200 bg-slate-100 p-3">
                                  {(() => {
                                    const inlineSrc = annexInlinePreviewHref(
                                      apiBase,
                                      annexFileParam,
                                      preview,
                                    );
                                    const showIframe =
                                      pdfPreviewAnnexIds.has(ax.id) && inlineSrc;
                                    return (
                                      <>
                                        <p className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                                          <span className="text-slate-500">
                                            PDF: {preview.fileName}
                                          </span>
                                          {inlineSrc && !showIframe ? (
                                            <button
                                              type="button"
                                              onClick={() => openPdfPreview(ax.id)}
                                              className="font-medium text-sky-700 hover:underline"
                                            >
                                              PDF 미리보기
                                            </button>
                                          ) : null}
                                          <a
                                            className="text-sky-700 underline"
                                            href={annexFileHref(
                                              apiBase,
                                              annexFileParam,
                                              preview,
                                              "attachment",
                                            )}
                                          >
                                            다운로드
                                          </a>
                                        </p>
                                        {showIframe ? (
                                          <iframe
                                            title={preview.fileName}
                                            src={inlineSrc}
                                            className="w-full rounded border border-slate-300 bg-white"
                                            style={{
                                              height: "70vh",
                                              minHeight: 420,
                                            }}
                                          />
                                        ) : !inlineSrc ? (
                                          <p className="text-xs text-slate-500">
                                            로컬 PDF가 없어 화면 미리보기를 할 수
                                            없습니다. 다운로드 링크 또는 상단 PDF
                                            아이콘을 이용하세요.
                                          </p>
                                        ) : null}
                                      </>
                                    );
                                  })()}
                                </div>
                              ) : null}
                              {open &&
                              ax.files.length > 0 &&
                              images.length === 0 &&
                              !preview ? (
                                <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
                                  한글(HWP/HWPX) 등은 브라우저 미리보기를 지원하지
                                  않습니다. 아이콘을 눌러 내려받으세요.
                                </div>
                              ) : null}
                              {open && ax.files.length === 0 ? (
                                <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
                                  연결된 첨부가 없습니다.
                                </div>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                </div>
              </main>
            </div>
          </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center px-6 text-center text-sm leading-relaxed text-slate-500">
                {selectedParam
                  ? "이 규칙의 본문을 표시할 수 없습니다."
                  : "왼쪽 목록에서 규칙을 선택하세요."}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TocArt({
  a,
  onPick,
  indent,
}: {
  a: AdminRulesArticleRow;
  onPick: (id: number) => void;
  indent?: boolean;
}) {
  const label = resolveArticleHeading(
    a.article_content ?? "",
    a.article_no,
    a.article_title,
  );
  return (
    <div className={indent ? "ml-2 border-l border-slate-200 pl-2" : ""}>
      <button
        type="button"
        onClick={() => onPick(a.id)}
        className="group flex w-full items-start gap-2 rounded py-1.5 text-left text-[13px] leading-snug text-slate-700 hover:bg-sky-50"
      >
        <span className="mt-1 shrink-0 text-[9px] text-slate-400 group-hover:text-sky-600">
          ▶
        </span>
        <span className="min-w-0 flex-1 break-words">{label}</span>
      </button>
    </div>
  );
}
