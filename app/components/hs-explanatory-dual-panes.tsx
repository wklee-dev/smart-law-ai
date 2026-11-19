"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  bodyWithoutTitleDuplicate,
  decodeHsManualEntities,
  extractHsManualPopCode,
  splitChapterGeneralSection,
  splitSectionPaneHeader,
} from "@/app/lib/hs-explanatory-html";
import {
  parseTongchimPaneBodies,
  tongchimRuleHasContent,
  type TongchimSection,
} from "@/app/lib/hs-tongchim-split";

type Pane = {
  titleKo: string;
  titleEn: string;
  bodyKo: string;
  bodyEn: string;
  other: string;
};

type Lang = "ko" | "en" | "other";

type MainTab = "tongchim" | "section" | "chapter" | "heading";

const HS_OTHER_REFERENCE_LINKS: readonly { label: string; href: string }[] = [
  {
    label: "HS해설서(프랑스어) 제공 사이트",
    href: "https://www.bazg.admin.ch/bazg/fr/home/dokumentation/richtlinien/d6-erlaeuterungen-zum-zolltarif.html",
  },
  {
    label: "HS해설서(일본어) 제공 사이트",
    href: "https://www.customs.go.jp/tariff/kaisetu/index.htm",
  },
  {
    label: "HS해설서(중국어) 제공 사이트",
    href: "http://www.customs.gov.cn/customs/302427/302442/jckszspjpmzscx/index.html",
  },
];

function HsOtherLanguageLinks() {
  return (
    <ul className="list-none space-y-4">
      {HS_OTHER_REFERENCE_LINKS.map((item) => (
        <li key={item.href}>
          <span className="block text-slate-800">○ {item.label}</span>
          <a
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block break-all text-blue-700 underline hover:text-blue-900"
          >
            {item.href}
          </a>
        </li>
      ))}
    </ul>
  );
}

function paneBody(p: Pane | null | undefined, lang: Lang): string {
  if (!p) return "이 레벨의 해설 데이터가 없습니다.";
  if (lang === "ko") return p.bodyKo || p.titleKo;
  if (lang === "en") return p.bodyEn || p.titleEn;
  return p.other || "(내용 없음)";
}

/** HS DB 원문 HTML의 `<a>` → 안전한 링크 (관세 포털 `f_retrieveManlInfoPop` 지원) */
function renderTextWithSafeAnchorTags(
  raw: string,
  onHsLinkClick?: (hsCode: string) => void,
): ReactNode {
  const decoded = decodeHsManualEntities(raw);
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  const out: ReactNode[] = [];

  let last = 0;
  let key = 0;

  for (let m = re.exec(decoded); m; m = re.exec(decoded)) {
    const before = decoded.slice(last, m.index);
    if (before) out.push(before);

    const attrs = m[1] ?? "";
    const innerRaw = m[2] ?? "";
    const innerDecoded = decodeHsManualEntities(innerRaw).trim();
    const popCode = extractHsManualPopCode(attrs);
    const label =
      innerDecoded || (popCode ? `제${popCode.replace(/\D/g, "")}호` : "");

    if (popCode && onHsLinkClick) {
      out.push(
        <button
          // eslint-disable-next-line react/no-array-index-key
          key={`hs-a-${key++}`}
          type="button"
          onClick={() => onHsLinkClick(popCode)}
          className="cursor-pointer font-inherit text-blue-700 underline decoration-slate-400 underline-offset-2 hover:text-blue-900"
        >
          {label || `제${popCode}호`}
        </button>,
      );
    } else {
      const hrefMatch = /href\s*=\s*["']([^"']*)["']/i.exec(attrs);
      let href = hrefMatch?.[1]?.trim() ?? "#";
      if (href.toLowerCase().startsWith("javascript:")) href = "#";

      out.push(
        <a
          // eslint-disable-next-line react/no-array-index-key
          key={`hs-a-${key++}`}
          href={href || "#"}
          className="underline decoration-slate-400 underline-offset-2 text-blue-700 hover:text-blue-900"
        >
          {label || href}
        </a>,
      );
    }

    last = re.lastIndex;
  }

  const rest = decoded.slice(last);
  if (rest) out.push(rest);

  return <>{out}</>;
}

function paneBodyForDisplay(
  p: Pane | null | undefined,
  lang: Lang,
  mainTab: MainTab,
  showPaneTitle: boolean,
): string {
  const raw = paneBody(p, lang);
  if (!p || !showPaneTitle || mainTab === "chapter" || mainTab === "section")
    return raw;
  return bodyWithoutTitleDuplicate(paneTitle(p, lang), raw);
}

function HsSectionPaneContent({
  body,
  onHsLinkClick,
}: {
  body: string;
  onHsLinkClick?: (hsCode: string) => void;
}) {
  const split = useMemo(() => splitSectionPaneHeader(body), [body]);

  if (!split) {
    return (
      <div className="whitespace-pre-wrap font-sans">
        {renderTextWithSafeAnchorTags(body, onHsLinkClick)}
      </div>
    );
  }

  return (
    <div className="font-sans">
      <h4 className="text-center text-base font-bold tracking-wide text-slate-900">
        {split.title}
      </h4>
      {split.subtitle ? (
        <p className="mt-1 text-center text-sm font-medium text-slate-800">
          {split.subtitle}
        </p>
      ) : null}
      {split.body ? (
        <div className="mt-4 whitespace-pre-wrap text-slate-800">
          {renderTextWithSafeAnchorTags(split.body, onHsLinkClick)}
        </div>
      ) : null}
    </div>
  );
}

function HsChapterPaneContent({
  body,
  lang,
  side,
  onHsLinkClick,
}: {
  body: string;
  lang: "ko" | "en";
  side: "left" | "right";
  onHsLinkClick?: (hsCode: string) => void;
}) {
  const split = useMemo(
    () => splitChapterGeneralSection(body, lang),
    [body, lang],
  );

  if (!split) {
    return (
      <div className="whitespace-pre-wrap font-sans">
        {renderTextWithSafeAnchorTags(body, onHsLinkClick)}
      </div>
    );
  }

  return (
    <div className="font-sans">
      {split.preamble ? (
        <div className="mb-6 whitespace-pre-wrap text-slate-800">
          {renderTextWithSafeAnchorTags(split.preamble, onHsLinkClick)}
        </div>
      ) : null}
      <section
        id={`hs-chapter-general-${side}`}
        className="scroll-mt-4 border-t border-slate-100 pt-4"
      >
        <h4 className="mb-3 text-center text-base font-bold tracking-wide text-slate-900">
          {split.generalTitle}
        </h4>
        <div className="whitespace-pre-wrap text-slate-800">
          {renderTextWithSafeAnchorTags(split.general, onHsLinkClick)}
        </div>
      </section>
    </div>
  );
}

function paneTitle(p: Pane | null | undefined, lang: Lang): string {
  if (!p) return "";
  if (lang === "ko") return p.titleKo;
  if (lang === "en") return p.titleEn;
  return "기타";
}

function HsTongchimRuleNav({
  sections,
  activeRule,
  onSelect,
}: {
  sections: TongchimSection[];
  activeRule: number | null;
  onSelect: (n: number) => void;
}) {
  const available = useMemo(() => {
    const set = new Set<number>();
    for (const s of sections) {
      if (tongchimRuleHasContent(s)) set.add(s.ruleNo);
    }
    return set;
  }, [sections]);
  const maxRuleNo = useMemo(() => {
    let max = 0;
    for (const s of sections) {
      if (Number.isFinite(s.ruleNo)) max = Math.max(max, s.ruleNo);
    }
    return Math.max(1, max);
  }, [sections]);

  return (
    <div
      className="flex min-w-0 flex-1 flex-wrap items-center gap-1 rounded-md border border-amber-200/90 bg-amber-50/95 px-2 py-1.5"
      role="tablist"
      aria-label="HS 통칙 호 선택"
    >
      {Array.from({ length: maxRuleNo }, (_, i) => i + 1).map((n) => {
        const has = available.has(n);
        const active = activeRule === n;
        return (
          <button
            key={n}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={!has}
            onClick={() => has && onSelect(n)}
            className={`min-h-8 min-w-9 rounded-md px-2 text-xs font-bold tabular-nums transition-colors ${
              active
                ? "bg-amber-500 text-white shadow-sm"
                : has
                  ? "bg-white text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50"
                  : "cursor-not-allowed bg-slate-100 text-slate-400"
            }`}
          >
            통{n}
          </button>
        );
      })}
    </div>
  );
}

function findScrollableParent(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if (
      (overflowY === "auto" ||
        overflowY === "scroll" ||
        overflowY === "overlay") &&
      node.scrollHeight > node.clientHeight + 2
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

function scrollElementIntoScrollContainer(
  el: HTMLElement,
  preferredContainer: HTMLElement | null,
  stickyOffset = 56,
): void {
  const container =
    preferredContainer &&
    preferredContainer.scrollHeight > preferredContainer.clientHeight + 2
      ? preferredContainer
      : findScrollableParent(el);

  if (!container) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const cRect = container.getBoundingClientRect();
  const eRect = el.getBoundingClientRect();
  const top = container.scrollTop + (eRect.top - cRect.top) - stickyOffset;
  container.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

export function HsExplanatoryDualPanes({
  mainTab,
  pane,
  leftLang,
  rightLang,
  setLeftLang,
  setRightLang,
  gridClassName,
  paneClassName,
  innerScrollerClassName,
  onHsLinkClick,
}: {
  mainTab: MainTab;
  pane: Pane | null;
  leftLang: Lang;
  rightLang: Lang;
  setLeftLang: Dispatch<SetStateAction<Lang>>;
  setRightLang: Dispatch<SetStateAction<Lang>>;
  /** 예: md:grid-cols-2 */
  gridClassName: string;
  paneClassName?: string;
  innerScrollerClassName?: string;
  /** `f_retrieveManlInfoPop('4906')` 등 내부 호·류 해설 이동 */
  onHsLinkClick?: (hsCode: string) => void;
}) {
  const showPaneTitle =
    mainTab !== "heading" && mainTab !== "chapter" && mainTab !== "section";
  const useChapterGeneralLayout = mainTab === "chapter";
  const useSectionHeaderLayout = mainTab === "section";
  const tongchimSections = useMemo(() => {
    if (mainTab !== "tongchim" || !pane) return [];
    return parseTongchimPaneBodies(pane.bodyKo, pane.bodyEn);
  }, [mainTab, pane?.bodyKo, pane?.bodyEn]);

  const [activeTongchimRule, setActiveTongchimRule] = useState<number | null>(
    null,
  );
  const [activeTongchimRuleRight, setActiveTongchimRuleRight] = useState<
    number | null
  >(null);

  const scrollerRefs = useRef<{
    left: HTMLDivElement | null;
    right: HTMLDivElement | null;
  }>({ left: null, right: null });

  /** 통칙 탭·본문이 바뀌면 선택·스크롤 초기화 (클릭할 때만 이동) */
  useEffect(() => {
    setActiveTongchimRule(null);
    setActiveTongchimRuleRight(null);
    scrollerRefs.current.left?.scrollTo({ top: 0 });
    scrollerRefs.current.right?.scrollTo({ top: 0 });
  }, [mainTab, pane?.bodyKo, pane?.bodyEn]);

  /** 류 해설 탭: 원본처럼 총설/GENERAL 구간으로 스크롤 */
  useEffect(() => {
    if (mainTab !== "chapter" || !pane) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        for (const side of ["left", "right"] as const) {
          const el = document.getElementById(`hs-chapter-general-${side}`);
          if (!el) continue;
          scrollElementIntoScrollContainer(
            el,
            scrollerRefs.current[side],
            8,
          );
        }
      });
    });
  }, [mainTab, pane?.bodyKo, pane?.bodyEn]);

  const scrollToTongchimRule = useCallback(
    (side: "left" | "right", n: number) => {
      if (side === "left") setActiveTongchimRule(n);
      else setActiveTongchimRuleRight(n);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = document.getElementById(`hs-tongchim-${side}-${n}`);
          if (!el) return;
          scrollElementIntoScrollContainer(
            el,
            scrollerRefs.current[side],
            56,
          );
        });
      });
    },
    [],
  );

  const useTongchimSplit =
    mainTab === "tongchim" && tongchimSections.some(tongchimRuleHasContent);

  const activeRuleForSide = useCallback(
    (side: "left" | "right") =>
      side === "left" ? activeTongchimRule : activeTongchimRuleRight,
    [activeTongchimRule, activeTongchimRuleRight],
  );

  const onSelectRuleForSide = useCallback(
    (side: "left" | "right") => (n: number) => {
      scrollToTongchimRule(side, n);
    },
    [scrollToTongchimRule],
  );

  const paneHeaderClass =
    "sticky top-0 z-10 shrink-0 border-b border-slate-200 bg-white/95 p-2 backdrop-blur";

  return (
    <div className={gridClassName}>
      {(["left", "right"] as const).map((side) => {
        const lang = side === "left" ? leftLang : rightLang;
        const setLang = side === "left" ? setLeftLang : setRightLang;

        return (
          <div
            key={side}
            className={
              paneClassName ??
              "flex min-h-0 flex-col rounded border border-slate-200 bg-slate-50/90"
            }
          >
            <div className={paneHeaderClass}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                {useTongchimSplit && lang !== "other" ? (
                  <HsTongchimRuleNav
                    sections={tongchimSections}
                    activeRule={activeRuleForSide(side)}
                    onSelect={onSelectRuleForSide(side)}
                  />
                ) : (
                  <div className="min-w-0 flex-1" aria-hidden />
                )}
                <div className="flex shrink-0 flex-wrap justify-end gap-1">
                  {(
                    [
                      ["ko", "국문"],
                      ["en", "영문"],
                      ["other", "기타"],
                    ] as const
                  ).map(([k, lab]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setLang(k)}
                      className={`rounded px-2 py-1 text-xs font-medium ${
                        lang === k
                          ? "bg-slate-800 text-white"
                          : "bg-white text-slate-600 ring-1 ring-slate-200"
                      }`}
                    >
                      {lab}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div
              ref={(el) => {
                scrollerRefs.current[side] = el;
              }}
              className={
                innerScrollerClassName ??
                "min-h-[180px] flex-1 overflow-y-auto p-3 text-sm leading-relaxed text-slate-800"
              }
            >
              {showPaneTitle ? (
                <h3 className="mb-2 text-sm font-semibold text-slate-900">
                  {lang === "other" ? "기타" : paneTitle(pane, lang)}
                </h3>
              ) : null}
              {lang === "other" ? (
                <HsOtherLanguageLinks />
              ) : useTongchimSplit ? (
                <div className="space-y-6">
                  {tongchimSections.filter(tongchimRuleHasContent).map((sec) => (
                    <section
                      key={sec.ruleNo}
                      id={`hs-tongchim-${side}-${sec.ruleNo}`}
                      className="scroll-mt-16 border-b border-slate-100 pb-6 last:border-b-0 last:pb-0"
                    >
                      {lang === "ko" ? (
                        <>
                          <h4 className="mb-2 font-semibold text-slate-900">
                            통칙 제{sec.ruleNo}호
                          </h4>
                          <div className="whitespace-pre-wrap font-sans">
                            {renderTextWithSafeAnchorTags(
                              sec.ko.trim() || "(국문 내용 없음)",
                              onHsLinkClick,
                            )}
                          </div>
                        </>
                      ) : (
                        <>
                          <h4 className="mb-2 font-semibold text-slate-900">
                            RULE {sec.ruleNo}
                          </h4>
                          <div className="whitespace-pre-wrap font-sans">
                            {renderTextWithSafeAnchorTags(
                              sec.en.trim() || "(영문 내용 없음)",
                              onHsLinkClick,
                            )}
                          </div>
                        </>
                      )}
                    </section>
                  ))}
                </div>
              ) : useSectionHeaderLayout ? (
                <HsSectionPaneContent
                  body={paneBodyForDisplay(pane, lang, mainTab, showPaneTitle)}
                  onHsLinkClick={onHsLinkClick}
                />
              ) : useChapterGeneralLayout ? (
                <HsChapterPaneContent
                  body={paneBodyForDisplay(pane, lang, mainTab, showPaneTitle)}
                  lang={lang}
                  side={side}
                  onHsLinkClick={onHsLinkClick}
                />
              ) : (
                <div className="whitespace-pre-wrap font-sans">
                  {renderTextWithSafeAnchorTags(
                    paneBodyForDisplay(pane, lang, mainTab, showPaneTitle),
                    onHsLinkClick,
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
