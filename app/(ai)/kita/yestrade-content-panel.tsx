"use client";

const HTML_CLASS =
  "ytg-content text-[13px] leading-relaxed text-[#333] " +
  "[&_h4]:mb-2 [&_h4]:mt-5 [&_h4]:border-l-4 [&_h4]:border-[#1e2f4f] [&_h4]:pl-2 " +
  "[&_h4]:text-[14px] [&_h4]:font-semibold [&_h4]:text-[#1e2f4f] " +
  "[&_h5]:mb-1.5 [&_h5]:mt-3 [&_h5]:text-[13px] [&_h5]:font-semibold [&_h5]:text-[#1e2f4f] " +
  "[&_p]:mb-2 [&_a]:text-[#1e2f4f] [&_a]:underline " +
  "[&_table]:mb-4 [&_table]:w-full [&_table]:border-collapse [&_table]:text-[12px] " +
  "[&_th]:border [&_th]:border-[#e5e9ef] [&_th]:bg-[#f8fafc] [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left " +
  "[&_td]:border [&_td]:border-[#e5e9ef] [&_td]:px-2 [&_td]:py-1.5 " +
  "[&_caption]:mb-1 [&_caption]:text-left [&_caption]:text-[12px] [&_caption]:font-semibold [&_caption]:text-[#475569]";

export function YestradeHtmlPanel({
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
      {emptyMessage ?? "본문이 없습니다."}
    </p>
  );
}

export function YestradeFileList({
  title,
  items,
}: {
  title: string;
  items: { key: string; label: string; href: string; meta?: string }[];
}) {
  if (!items.length) return null;
  return (
    <div className="mt-4 border-t border-[#e5e9ef] pt-3">
      <p className="mb-2 text-[12px] font-semibold text-[#1e2f4f]">{title}</p>
      <ul className="space-y-1">
        {items.map((it) => (
          <li key={it.key} className="text-[12px]">
            <a
              href={it.href}
              target="_blank"
              rel="noreferrer"
              className="text-[#1e2f4f] underline"
            >
              {it.label}
            </a>
            {it.meta ? (
              <span className="ml-2 text-[#666]">{it.meta}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function formatFileSize(n: number): string {
  if (!n || n < 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
