import type { ReactNode } from "react";

/** 국내사례 조회 레퍼런스 스타일: 라벨(우측 정렬)·세로 구분선·입력 영역 */
export function ClassificationFormSplitField({
  label,
  children,
  compact,
  labelClassName = "",
}: {
  label: string;
  children: ReactNode;
  /** 시행일자 등 한 줄 컨트롤 — 행 높이·패딩을 줄여 다른 필드와 맞춤 */
  compact?: boolean;
  /** 긴 라벨(요건확인 서류명 등) 한 줄 표시 */
  labelClassName?: string;
}) {
  const labelWidthClass = labelClassName || "w-[6.65rem] sm:w-28";
  const labelBaseClass =
    "flex shrink-0 items-center justify-end border-r border-stone-300 bg-[#ebe8e0] px-2 text-[11px] font-semibold text-slate-800";
  const labelPadClass = compact ? "py-1.5" : "py-2";

  return (
    <div
      className={
        compact
          ? "flex min-h-[2.125rem] items-stretch bg-white"
          : "flex min-h-[2.75rem] items-stretch bg-white"
      }
    >
      <div className={`${labelBaseClass} ${labelWidthClass} ${labelPadClass}`}>
        {label}
      </div>
      <div
        className={
          compact
            ? "flex min-w-0 flex-1 items-center px-2 py-1"
            : "flex min-w-0 flex-1 items-center px-2 py-1.5"
        }
      >
        {children}
      </div>
    </div>
  );
}

export const CLASSIFICATION_FORM_INPUT_CLASS =
  "w-full rounded-md border border-stone-200 bg-white px-2 py-1.5 text-sm text-slate-900 shadow-inner placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200";
