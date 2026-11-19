"use client";

import type { NtxPageContent } from "@/app/lib/clip-ntx-content-server";

const HTML_CLASS =
  "clip-ntx-content text-[13px] leading-relaxed text-[#333] [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:border-l-4 [&_h2]:border-[#1e2f4f] [&_h2]:pl-2 [&_h2]:text-[14px] [&_h2]:font-semibold [&_h2]:text-[#1e2f4f] [&_table]:mb-4 [&_td]:border [&_td]:border-slate-200 [&_td]:px-2 [&_td]:py-1.5 [&_th]:border [&_th]:border-slate-200 [&_th]:bg-slate-50 [&_th]:px-2 [&_th]:py-1.5 [&_ul]:mb-3 [&_ul]:list-none [&_ul]:pl-0";

export function NtxHtmlPanel({
  content,
  loading,
  emptyMessage,
}: {
  content: NtxPageContent | null;
  loading?: boolean;
  emptyMessage?: string;
}) {
  if (loading) {
    return <p className="text-[12px] text-[#666]">불러오는 중…</p>;
  }
  if (!content?.content_html?.trim()) {
    return (
      <p className="text-[12px] leading-relaxed text-[#666]">
        {emptyMessage ??
          "종합정보 본문이 없습니다. 크롤러(`clip_tax_refund_crawler.py --section content`) 수집 후 ntx_page에 표시됩니다."}
      </p>
    );
  }
  return (
    <div
      className={HTML_CLASS}
      dangerouslySetInnerHTML={{ __html: content.content_html }}
    />
  );
}
