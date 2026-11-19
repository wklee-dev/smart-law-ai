"use client";

const HTML_CLASS =
  "clip-ntx-content text-[13px] leading-relaxed text-[#333] [&_h2:not(.floatLeft)]:mb-2 [&_h2:not(.floatLeft)]:mt-4 [&_h2]:border-l-4 [&_h2]:border-[#1e2f4f] [&_h2]:pl-2 [&_h2]:text-[14px] [&_h2]:font-semibold [&_h2]:text-[#1e2f4f] [&_a]:text-[#1e2f4f] [&_a]:underline [&_ul]:list-none [&_ul]:pl-0";

export function ClipPortalHtmlPanel({
  html,
  text,
  loading,
  emptyMessage,
}: {
  html?: string;
  text?: string;
  loading?: boolean;
  emptyMessage?: string;
}) {
  if (loading) {
    return <p className="text-[12px] text-[#666]">불러오는 중…</p>;
  }
  const contentHtml = html?.trim();
  if (contentHtml) {
    return (
      <div
        className={HTML_CLASS}
        dangerouslySetInnerHTML={{ __html: contentHtml }}
      />
    );
  }
  const contentText = text?.trim();
  if (contentText) {
    return (
      <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[#333]">
        {contentText}
      </p>
    );
  }
  return (
    <p className="text-[12px] leading-relaxed text-[#666]">
      {emptyMessage ?? "종합정보 본문이 없습니다."}
    </p>
  );
}
