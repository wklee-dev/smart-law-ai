import type { ReactNode } from "react";
import {
  slTableClass,
  stickyThClass,
  tdClass,
} from "@/app/lib/sl-table-styles";

export { stickyThClass, tdClass };

/** CasNcom 수출실적조회 그리드와 동일 — sl-table-styles 기반 */
const clipGridThClass = `${stickyThClass} whitespace-normal break-keep leading-snug`;
const clipGridTdClass = `${tdClass} align-middle`;

export const clipGridRowHoverClass = "transition-colors hover:bg-slate-50/80";
export const clipGridSeqClass = "text-center text-slate-500";
export const clipGridMonoClass = "font-mono text-[11px]";

export const clipGridLinkClass =
  "text-left font-medium text-[#1e2f4f] underline-offset-2 hover:underline";

/**
 * ClipGrid 열 설계 (화면별 colgroup 합 100%)
 * - 품명·설명·제목: ClipGridLinkCell (말줄임 + 클릭)
 * - 날짜(시행일·회신일 등): ClipGridDateCell — 말줄임 없음, col ~12%
 * - 짧은 고정 라벨(별표구분·법종류 등): ClipGridLabelCell
 * - 그 외 텍스트: ClipGridTruncateCell — 넘치면 … + title 툴팁
 */
export const clipGridFlexColClass = "max-w-0 overflow-hidden";

export const clipGridNowrapClass = "whitespace-nowrap";

export const clipGridTextClass = "text-[12px] leading-normal text-[#333]";

export const clipGridTruncateClass = `block w-full truncate ${clipGridTextClass}`;

export function ClipGridTable({
  children,
  minWidth,
  fixedLayout = true,
}: {
  children: ReactNode;
  /** fixedLayout=false 일 때만 사용 (레거시 가로 스크롤) */
  minWidth?: string;
  /** true: 100% 너비 고정 + colgroup 권장, 가로 스크롤 없음 */
  fixedLayout?: boolean;
}) {
  const resolvedMinWidth =
    minWidth ?? (fixedLayout ? undefined : "980px");
  const wrapClass = fixedLayout
    ? "min-h-0 w-full max-w-full min-w-0 overflow-hidden"
    : "min-h-0 w-full max-w-full min-w-0 overflow-x-auto";
  return (
    <div className={`${wrapClass} rounded-lg border border-slate-100 bg-white`}>
      <table
        className={`${slTableClass} w-full max-w-full${fixedLayout ? " table-fixed" : ""}`}
        style={resolvedMinWidth ? { minWidth: resolvedMinWidth } : undefined}
      >
        {children}
      </table>
    </div>
  );
}

export function ClipGridTh({
  children,
  className = "",
  style,
  colSpan,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  colSpan?: number;
}) {
  return (
    <th
      colSpan={colSpan}
      className={`${clipGridThClass} ${className}`}
      style={style}
    >
      {children}
    </th>
  );
}

export function ClipGridTd({
  children,
  className = "",
  align,
  title,
}: {
  children: ReactNode;
  className?: string;
  align?: "left" | "center" | "right";
  title?: string;
}) {
  const alignCls =
    align === "center"
      ? " text-center"
      : align === "right"
        ? " text-right tabular-nums"
        : "";
  return (
    <td
      title={title}
      className={`${clipGridTdClass}${alignCls} ${className}`}
    >
      {children}
    </td>
  );
}

/** YYYY-MM-DD 등 날짜 — 말줄임 없이 전체 표시 */
export function ClipGridDateCell({
  children,
  title,
  align = "center",
  className = "",
}: {
  children: ReactNode;
  title?: string;
  align?: "left" | "center" | "right";
  className?: string;
}) {
  return (
    <ClipGridTd
      align={align}
      title={title}
      className={`${clipGridNowrapClass} ${className}`}
    >
      <span className={`${clipGridTextClass} tabular-nums`}>{children}</span>
    </ClipGridTd>
  );
}

/** 별표구분·법종류 등 짧은 고정 라벨 */
export function ClipGridLabelCell({
  children,
  title,
  align = "center",
  className = "",
}: {
  children: ReactNode;
  title?: string;
  align?: "left" | "center" | "right";
  className?: string;
}) {
  return (
    <ClipGridTd
      align={align}
      title={title}
      className={`${clipGridNowrapClass} ${className}`}
    >
      <span className={clipGridTextClass}>{children}</span>
    </ClipGridTd>
  );
}

/** 긴 텍스트 — 말줄임 + title 툴팁 */
export function ClipGridTruncateCell({
  children,
  title,
  align,
  className = "",
}: {
  children: ReactNode;
  title?: string;
  align?: "left" | "center" | "right";
  className?: string;
}) {
  return (
    <ClipGridTd
      align={align}
      title={title}
      className={`${clipGridFlexColClass} ${className}`}
    >
      <span className={clipGridTruncateClass}>{children}</span>
    </ClipGridTd>
  );
}

/** 링크 + 말줄임 (참조번호·사건번호 등) */
export function ClipGridLinkTruncateCell({
  label,
  onClick,
  title,
  disabled,
  align = "left",
  className = "",
}: {
  label: string;
  onClick: () => void;
  title?: string;
  disabled?: boolean;
  align?: "left" | "center";
  className?: string;
}) {
  const t = title ?? label;
  return (
    <ClipGridTd
      align={align}
      className={`${clipGridFlexColClass} ${className}`}
      title={t}
    >
      <button
        type="button"
        title={t}
        disabled={disabled}
        className={`${clipGridTruncateClass} ${
          align === "center" ? "text-center" : "text-left"
        } ${
          disabled
            ? "cursor-not-allowed text-[#94a3b8]"
            : clipGridLinkClass
        } disabled:no-underline`}
        onClick={onClick}
      >
        {label}
      </button>
    </ClipGridTd>
  );
}

/** 제목·링크 열 — 품명·설명·조약명 등 */
export function ClipGridLinkCell({
  label,
  onClick,
  title,
  disabled,
}: {
  label: string;
  onClick: () => void;
  title?: string;
  disabled?: boolean;
}) {
  const t = title ?? label;
  return (
    <ClipGridTd className={clipGridFlexColClass} title={t}>
      <button
        type="button"
        title={t}
        disabled={disabled}
        className={`${clipGridLinkClass} ${clipGridTruncateClass} text-left disabled:cursor-not-allowed disabled:text-[#94a3b8] disabled:no-underline`}
        onClick={onClick}
      >
        {label}
      </button>
    </ClipGridTd>
  );
}

export function ClipSortThButton({
  label,
  active,
  sortDir,
  onClick,
  className = "",
  align = "center",
}: {
  label: string;
  active: boolean;
  sortDir: "asc" | "desc";
  onClick: () => void;
  className?: string;
  align?: "left" | "center";
}) {
  return (
    <button
      type="button"
      className={`inline-flex w-full min-w-0 flex-wrap items-center gap-x-0.5 gap-y-0 text-[12px] leading-snug ${
        align === "left" ? "justify-start text-left" : "justify-center text-center"
      } ${
        active ? "font-semibold text-[#1e2f4f]" : "font-semibold text-[#666] hover:text-[#333]"
      } ${className}`}
      onClick={onClick}
    >
      <span className="min-w-0 break-keep">{label}</span>
      <span className="shrink-0 font-normal text-[10px] text-[#94a3b8]">
        {active ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
      </span>
    </button>
  );
}

export function ClipGridStatsBar({
  total,
  pageSize,
  onPageSizeChange,
  loading,
  showTotal = true,
  showPageSize = true,
}: {
  total: number;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  loading?: boolean;
  showTotal?: boolean;
  showPageSize?: boolean;
}) {
  if (!showTotal && !showPageSize) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      {showTotal ? (
        <span className="inline-flex items-center rounded-full bg-[#1e2f4f]/10 px-2.5 py-1 text-[12px] font-medium text-[#1e2f4f]">
          전체 {total.toLocaleString()}건
        </span>
      ) : (
        <span />
      )}
      {showPageSize ? (
        <label className="ml-auto flex items-center gap-2 text-[12px] text-[#666]">
          페이지당
          <select
            className="h-8 rounded-md border border-[#d8dee6] bg-white px-2 text-[12px] text-[#333] shadow-sm focus:border-[#1e2f4f] focus:outline-none focus:ring-1 focus:ring-[#1e2f4f]/18"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value) || 10)}
            disabled={loading}
          >
            {[10, 20, 30, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}

export function ClipGridEmptyRow({
  colSpan,
  loading,
}: {
  colSpan: number;
  loading: boolean;
}) {
  if (loading) {
    return (
      <tr>
        <td colSpan={colSpan} className={`${tdClass} py-16 text-center`}>
          <div className="inline-flex items-center gap-2 text-[#666]">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#e5e9ef] border-t-[#1e2f4f]" />
            조회 중입니다…
          </div>
        </td>
      </tr>
    );
  }
  return (
    <tr>
      <td colSpan={colSpan} className={`${tdClass} py-16 text-center`}>
        <p className="text-[14px] font-medium text-[#666]">조회 결과가 없습니다</p>
        <p className="mt-1 text-[12px] text-[#94a3b8]">
          검색 조건을 변경한 뒤 다시 조회해 보세요.
        </p>
      </td>
    </tr>
  );
}

export function ClipPaginationBar({
  curPageSafe,
  totalPg,
  loading,
  block,
  onPage,
}: {
  curPageSafe: number;
  totalPg: number;
  loading: boolean;
  block: number[];
  onPage: (p: number) => void;
}) {
  if (totalPg <= 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-1 border-t border-[#e5e9ef] pt-3">
      <ClipPageBtn
        label="«"
        ariaLabel="첫 페이지"
        disabled={curPageSafe <= 1 || loading}
        onClick={() => onPage(1)}
      />
      <ClipPageBtn
        label="‹"
        ariaLabel="이전 페이지"
        disabled={curPageSafe <= 1 || loading}
        onClick={() => onPage(Math.max(1, curPageSafe - 1))}
      />
      {block.map((p) => {
        const sel = p === curPageSafe;
        return (
          <ClipPageBtn
            key={p}
            label={String(p)}
            ariaLabel={`${p}페이지`}
            ariaCurrent={sel}
            disabled={loading}
            selected={sel}
            onClick={() => onPage(p)}
          />
        );
      })}
      <ClipPageBtn
        label="›"
        ariaLabel="다음 페이지"
        disabled={curPageSafe >= totalPg || loading}
        onClick={() => onPage(Math.min(totalPg, curPageSafe + 1))}
      />
      <ClipPageBtn
        label="»"
        ariaLabel="마지막 페이지"
        disabled={curPageSafe >= totalPg || loading}
        onClick={() => onPage(totalPg)}
      />
    </div>
  );
}

function ClipPageBtn({
  label,
  ariaLabel,
  ariaCurrent,
  disabled,
  selected,
  onClick,
}: {
  label: string;
  ariaLabel: string;
  ariaCurrent?: boolean;
  disabled?: boolean;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-current={ariaCurrent ? "page" : undefined}
      disabled={disabled}
      onClick={onClick}
      className={`min-w-[2rem] rounded-md border px-2 py-1 text-[12px] transition-colors disabled:opacity-40 ${
        selected
          ? "border-[#1e2f4f] bg-[#1e2f4f]/10 font-semibold text-[#1e2f4f]"
          : "border-[#d8dee6] bg-white text-[#666] hover:bg-[#f8fafc]"
      }`}
    >
      {label}
    </button>
  );
}

