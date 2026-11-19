/** Enterprise SaaS 공통 그리드 스타일 (참조 UI — 12px) */
export const slCellBorder = "border border-[#e5e9ef]";

export const slThClass = `${slCellBorder} bg-[#f8fafc] px-2 py-2 text-center text-[12px] font-semibold leading-snug text-[#666] whitespace-nowrap align-middle`;

export const slStickyThClass = `${slThClass} sticky top-0 z-20 shadow-[inset_0_-1px_0_#e5e9ef]`;

export const slTdClass = `${slCellBorder} bg-white px-2 py-1.5 text-[12px] leading-normal text-[#333] align-top`;

export const slTableWrapClass =
  "min-h-0 overflow-auto rounded-md border border-[#e5e9ef] bg-white";

export const slTableClass =
  "w-full border-separate border-spacing-0 text-left text-[12px]";

/** cas-ncom-ui 호환 별칭 */
export const cellBorder = slCellBorder;
export const thClass = slThClass;
export const stickyThClass = slStickyThClass;
export const tdClass = slTdClass;
