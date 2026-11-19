"use client";

import { useMemo, type ReactNode } from "react";

type NumberedItem = {
  no: string;
  label: string;
  body: string;
};

type SubBlock = {
  kind: "lead" | "sub";
  marker?: string;
  text: string;
};

type ParagraphBlock = {
  marker?: string;
  intro: string;
  amendments: string[];
  items: NumberedItem[];
};

const ARTICLE_HEADING_RE = /^제\d+조(?:의\d+)?(?:\([^)]+\))?/;
const AMENDMENT_RE = /<개정[^>]*>/g;
const SUB_ITEM_RE = /(?:^|\s)([가-힣])\.\s+/g;
const INLINE_LINK_RE =
  /(영\s*별표\s*\d+(?:-\d+)?(?:의\d+)?)|(별지\s*제\d+호(?:의\d+)?서식)|(별표\s*\d+(?:-\d+)?(?:의\d+)?)|([「『][^」』]+[」』])|((?:법|영)\s*제\d+조(?:의\d+)?(?:제\d+호)?)/g;

/** 본문 첫 줄·article_title에서 표시용 조문 제목(예: 제79조의4(…))을 결정 */
export function resolveArticleHeading(
  content: string,
  articleNo: string,
  articleTitle: string,
): string {
  const firstLine = content.trim().split(/\n/)[0]?.trim() ?? "";
  const fromContent = firstLine.match(ARTICLE_HEADING_RE);
  if (fromContent) return fromContent[0];
  if (articleTitle.trim()) return articleTitle.trim();
  return articleNo.trim() || "—";
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripLeadingTitle(
  content: string,
  articleNo: string,
  articleTitle: string,
): string {
  let text = content.trim();
  const firstLine = text.split(/\n/)[0]?.trim() ?? "";
  const fromContent = firstLine.match(ARTICLE_HEADING_RE);
  if (fromContent && text.startsWith(fromContent[0])) {
    text = text.slice(fromContent[0].length).trim();
  }
  const candidates = [articleTitle.trim(), articleNo.trim()].filter(
    (s) => s.length > 0,
  );
  for (const c of candidates) {
    if (text.startsWith(c)) {
      text = text.slice(c.length).trim();
      break;
    }
  }
  const paren = articleNo.trim()
    ? new RegExp(`^${escapeRegExp(articleNo.trim())}\\([^)]+\\)\\s*`)
    : null;
  if (paren?.test(text)) {
    text = text.replace(paren, "").trim();
  }
  return text;
}

function splitAmendment(text: string): { main: string; amendments: string[] } {
  const amendments: string[] = [];
  const main = text
    .replace(AMENDMENT_RE, (m) => {
      amendments.push(m);
      return "\0";
    })
    .replace(/\s*\0\s*/g, " ")
    .trim();
  return { main, amendments };
}

function parseParagraphs(text: string): { marker?: string; body: string }[] {
  const markers: { marker: string; start: number }[] = [];
  let m: RegExpExecArray | null;
  const re = /[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]/g;
  while ((m = re.exec(text)) !== null) {
    markers.push({ marker: m[0], start: m.index + m[0].length });
  }
  if (markers.length === 0) {
    return text.trim() ? [{ body: text.trim() }] : [];
  }
  const out: { marker?: string; body: string }[] = [];
  const lead = text.slice(0, markers[0].start - markers[0].marker.length).trim();
  if (lead) out.push({ body: lead });
  for (let i = 0; i < markers.length; i++) {
    const end =
      i + 1 < markers.length
        ? markers[i + 1].start - markers[i + 1].marker.length
        : text.length;
    out.push({
      marker: markers[i].marker,
      body: text.slice(markers[i].start, end).trim(),
    });
  }
  return out;
}

function parseNumberedItems(text: string): {
  intro: string;
  items: NumberedItem[];
} {
  const first = text.search(/(?:^|\s)1\.\s+(?:\(|[가-힣「『])/);
  if (first < 0) {
    const alt = text.search(/(?:^|\s)1\.\s+/);
    if (alt < 0) return { intro: text, items: [] };
    return splitNumbered(text.slice(0, alt).trim(), text.slice(alt).trim());
  }
  return splitNumbered(text.slice(0, first).trim(), text.slice(first).trim());
}

function splitNumbered(
  intro: string,
  block: string,
): { intro: string; items: NumberedItem[] } {
  const items: NumberedItem[] = [];
  const re = /(?:^|\s)(\d+)\.\s+(?:\(([^)]+)\)\s*)?/g;
  const hits: { no: string; label: string; index: number; headerLen: number }[] =
    [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    hits.push({
      no: m[1],
      label: (m[2] ?? "").trim(),
      index: m.index,
      headerLen: m[0].length,
    });
  }
  if (hits.length === 0) return { intro: intro || block, items: [] };
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    const bodyStart = h.index + h.headerLen;
    const bodyEnd = i + 1 < hits.length ? hits[i + 1].index : block.length;
    items.push({
      no: h.no,
      label: h.label,
      body: block.slice(bodyStart, bodyEnd).trim(),
    });
  }
  return { intro, items };
}

function parseSubBlocks(body: string): SubBlock[] {
  const markers: { marker: string; index: number; contentStart: number }[] = [];
  let m: RegExpExecArray | null;
  SUB_ITEM_RE.lastIndex = 0;
  while ((m = SUB_ITEM_RE.exec(body)) !== null) {
    const before = m.index > 0 ? body[m.index - 1] : " ";
    if (m.index > 0 && !/\s/.test(before)) continue;
    markers.push({
      marker: m[1],
      index: m.index,
      contentStart: m.index + m[0].length,
    });
  }
  if (markers.length === 0) {
    return body.trim() ? [{ kind: "lead", text: body.trim() }] : [];
  }
  const out: SubBlock[] = [];
  const lead = body.slice(0, markers[0].index).trim();
  if (lead) out.push({ kind: "lead", text: lead });
  for (let i = 0; i < markers.length; i++) {
    const end = i + 1 < markers.length ? markers[i + 1].index : body.length;
    out.push({
      kind: "sub",
      marker: markers[i].marker,
      text: body.slice(markers[i].contentStart, end).trim(),
    });
  }
  return out;
}

function parseArticleStructure(
  content: string,
  articleNo: string,
  articleTitle: string,
): { heading: string; paragraphs: ParagraphBlock[]; plain: string } {
  const heading = resolveArticleHeading(content, articleNo, articleTitle);
  const stripped = stripLeadingTitle(content, articleNo, articleTitle);
  const rawParagraphs = parseParagraphs(stripped);

  if (rawParagraphs.length === 0) {
    return { heading, paragraphs: [], plain: stripped };
  }

  const paragraphs: ParagraphBlock[] = rawParagraphs.map((p) => {
    const numbered = parseNumberedItems(p.body);
    const { main, amendments } = splitAmendment(numbered.intro);
    return {
      marker: p.marker,
      intro: main,
      amendments,
      items: numbered.items,
    };
  });

  return { heading, paragraphs, plain: stripped };
}

function renderInline(
  text: string,
  onAnnexTitle?: (fragment: string) => void,
): ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  INLINE_LINK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_LINK_RE.exec(text)) !== null) {
    const idx = m.index;
    if (idx > last) nodes.push(text.slice(last, idx));
    const matched = m[0];
    const isAnnex =
      matched.startsWith("별표") ||
      matched.startsWith("영") ||
      matched.startsWith("별지");
    if (isAnnex && onAnnexTitle) {
      nodes.push(
        <button
          key={`${idx}-${matched}`}
          type="button"
          onClick={() => onAnnexTitle(matched.replace(/\s+/g, ""))}
          className="text-blue-700 underline underline-offset-2 hover:text-blue-900"
        >
          {matched}
        </button>,
      );
    } else {
      nodes.push(
        <span key={`${idx}-${matched}`} className="text-blue-800">
          {matched}
        </span>,
      );
    }
    last = idx + matched.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes.length > 0 ? nodes : [text];
}

function AmendmentNotes({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null;
  return (
    <span className="ml-1 text-[13px] text-slate-500">
      {notes.map((n, i) => (
        <span key={`${i}-${n}`}>{n} </span>
      ))}
    </span>
  );
}

function ArticleSubBlocks({
  body,
  onAnnexTitle,
}: {
  body: string;
  onAnnexTitle?: (fragment: string) => void;
}) {
  const blocks = useMemo(() => parseSubBlocks(body), [body]);
  return (
    <div className="space-y-1.5">
      {blocks.map((b, i) =>
        b.kind === "lead" ? (
          <p
            key={`lead-${i}`}
            className="text-[15px] leading-[1.85] text-slate-900"
          >
            {renderInline(b.text, onAnnexTitle)}
          </p>
        ) : (
          <div key={`sub-${b.marker}-${i}`} className="flex gap-2 pl-6 sm:pl-10">
            <span className="w-5 shrink-0 text-[15px] text-slate-800">
              {b.marker}.
            </span>
            <p className="min-w-0 flex-1 text-[15px] leading-[1.85] text-slate-900">
              {renderInline(b.text, onAnnexTitle)}
            </p>
          </div>
        ),
      )}
    </div>
  );
}

function NumberedItemList({
  items,
  onAnnexTitle,
}: {
  items: NumberedItem[];
  onAnnexTitle?: (fragment: string) => void;
}) {
  return (
    <ol className="m-0 list-none space-y-3 p-0">
      {items.map((item, index) => (
        <li key={`${index}-${item.no}`} className="scroll-mt-4">
          <div className="flex gap-2">
            <span className="w-7 shrink-0 text-right text-[15px] font-medium text-slate-900 tabular-nums">
              {item.no}.
            </span>
            <div className="min-w-0 flex-1">
              {item.label ? (
                <span className="mr-1 text-[15px] font-medium text-slate-900">
                  ({item.label})
                </span>
              ) : null}
              <ArticleSubBlocks body={item.body} onAnnexTitle={onAnnexTitle} />
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function ParagraphBlockView({
  block,
  onAnnexTitle,
}: {
  block: ParagraphBlock;
  onAnnexTitle?: (fragment: string) => void;
}) {
  const hasItems = block.items.length > 0;
  const hasIntro = Boolean(block.intro || block.amendments.length > 0);

  return (
    <div className="space-y-3">
      {block.marker || hasIntro ? (
        <p className="text-[15px] leading-[1.85] text-slate-900">
          {block.marker ? (
            <span className="mr-1 font-medium">{block.marker}</span>
          ) : null}
          {block.intro ? renderInline(block.intro, onAnnexTitle) : null}
          <AmendmentNotes notes={block.amendments} />
        </p>
      ) : null}
      {hasItems ? (
        <NumberedItemList items={block.items} onAnnexTitle={onAnnexTitle} />
      ) : null}
    </div>
  );
}

export type AdminRulesArticleImage = {
  id: number;
  display_src: string;
  img_order: number;
};

export function AdminRulesArticleContent({
  articleNo,
  articleTitle,
  content,
  images = [],
  onAnnexTitle,
}: {
  articleNo: string;
  articleTitle: string;
  content: string;
  images?: AdminRulesArticleImage[];
  onAnnexTitle?: (fragment: string) => void;
}) {
  const parsed = useMemo(
    () => parseArticleStructure(content, articleNo, articleTitle),
    [content, articleNo, articleTitle],
  );

  if (!content.trim()) {
    return <p className="text-slate-500">—</p>;
  }

  const hasStructure =
    parsed.paragraphs.length > 0 &&
    parsed.paragraphs.some(
      (p) => p.marker || p.items.length > 0 || p.intro || p.amendments.length > 0,
    );

  if (!hasStructure) {
    return (
      <div className="space-y-4">
        <p className="text-[15px] leading-[1.85] text-slate-900 whitespace-pre-wrap">
          {renderInline(parsed.plain || content.trim(), onAnnexTitle)}
        </p>
        {images.length > 0 ? (
          <ArticleImageRow images={images} articleNo={articleNo} />
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {parsed.paragraphs.map((block, i) => (
        <ParagraphBlockView
          key={`para-${i}-${block.marker ?? "x"}`}
          block={block}
          onAnnexTitle={onAnnexTitle}
        />
      ))}
      {images.length > 0 ? (
        <ArticleImageRow images={images} articleNo={articleNo} />
      ) : null}
    </div>
  );
}

function ArticleImageRow({
  images,
  articleNo,
}: {
  images: AdminRulesArticleImage[];
  articleNo: string;
}) {
  return (
    <div
      className={`mt-4 grid gap-4 border-t border-slate-100 pt-4 ${
        images.length <= 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"
      }`}
    >
      {images.map((im) => (
        <figure
          key={im.id}
          className="overflow-hidden rounded border border-slate-200 bg-slate-50/50"
        >
          <div className="flex items-center justify-center p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={im.display_src}
              alt={`${articleNo} 이미지 ${im.img_order}`}
              className="mx-auto block h-auto max-w-full object-contain"
              loading="lazy"
              decoding="async"
            />
          </div>
        </figure>
      ))}
    </div>
  );
}
