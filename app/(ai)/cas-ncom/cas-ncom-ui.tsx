import type { ReactNode } from "react";
import { todayYmdLocal } from "@/app/lib/date-input-utils";
import {
  SlIconBatch,
  SlIconClose,
  SlIconDownload,
  SlIconExcel,
  SlIconImport,
  SlIconPlus,
  SlIconPlay,
  SlIconRefresh,
  SlIconReset,
  SlIconSave,
  SlIconSearch,
  SlIconTrash,
} from "@/app/components/sl-icons";
import {
  cellBorder,
  slTableClass,
  slTableWrapClass,
  stickyThClass,
  tdClass,
  thClass,
} from "@/app/lib/sl-table-styles";

export {
  cellBorder,
  slTableClass,
  slTableWrapClass,
  stickyThClass,
  tdClass,
  thClass,
} from "@/app/lib/sl-table-styles";

export const casInputClass =
  "h-8 w-full rounded-md border border-[#d8dee6] bg-white px-2.5 text-[12px] text-[#333] shadow-sm transition-colors placeholder:text-[#94a3b8] focus:border-[#1e2f4f] focus:outline-none focus:ring-2 focus:ring-[#1e2f4f]/18";

export const casLabelClass = "mb-1 block text-[11px] font-medium text-[#666]";

export const casSelectClass =
  "h-8 rounded-md border border-[#d8dee6] bg-white px-2 text-[12px] text-[#333] shadow-sm focus:border-[#1e2f4f] focus:outline-none focus:ring-1 focus:ring-[#1e2f4f]/18";

export function CasPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full min-w-0 flex-col gap-3 bg-[#f4f7f9] p-4 text-[#333]">
      {children}
    </div>
  );
}

/** 메뉴 페이지 타이틀 바 (네이비 · 흰색 제목) */
export const casMenuTitleBarClass =
  "flex shrink-0 items-center justify-between gap-3 rounded-md bg-[#1e2f4f] px-4 py-3 shadow-sm";

export const casMenuTitleTextClass =
  "min-w-0 text-[17px] font-bold leading-snug tracking-tight text-white sm:text-[18px]";

export function CasPageHeader({
  title,
  action,
  className = "",
}: {
  title: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header className={`${casMenuTitleBarClass} ${className}`.trim()}>
      <h1 className={casMenuTitleTextClass}>{title}</h1>
      {action ? <div className="min-w-0 shrink-0">{action}</div> : null}
    </header>
  );
}

/** 하위 기능 탭 — 참조 UI 카드형 네비 */
export function CasSubNavTabs<T extends string>({
  tabs,
  activeKey,
  onChange,
}: {
  tabs: readonly { key: T; label: string }[];
  activeKey: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((tab) => {
        const active = activeKey === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            className={
              active
                ? "rounded-md bg-[#1e2f4f] px-4 py-2 text-[12px] font-medium text-white shadow-sm transition-colors"
                : "rounded-md border border-[#e5e9ef] bg-white px-4 py-2 text-[12px] font-medium text-[#666] transition-colors hover:bg-[#f8fafc] hover:text-[#333]"
            }
            onClick={() => onChange(tab.key)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export function CasSearchFormActions({
  children,
  inline,
}: {
  children: ReactNode;
  inline?: boolean;
}) {
  if (inline) {
    return (
      <div className="ml-auto flex shrink-0 items-end gap-2 pb-0.5">{children}</div>
    );
  }
  return (
    <div className="mt-3 flex items-center justify-end gap-2 border-t border-[#e5e9ef] pt-3">
      {children}
    </div>
  );
}

export function CasCard({
  title,
  description,
  action,
  children,
  className = "",
  bodyClassName = "",
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={`overflow-hidden rounded-lg border border-[#e5e9ef] bg-white shadow-sm ${className}`}
    >
      {title ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e5e9ef] bg-[#fafbfc] px-4 py-2.5">
          <div>
            <h2 className="text-[12px] font-semibold text-[#333]">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-[11px] text-[#666]">{description}</p>
            ) : null}
          </div>
          {action}
        </div>
      ) : null}
      <div className={`min-w-0 px-4 py-3.5 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

export function CasInlineField({
  label,
  className = "",
  aligned,
  stacked,
  children,
}: {
  label: string;
  className?: string;
  /** 조회 폼 — 라벨 너비 고정·열 정렬 (가로) */
  aligned?: boolean;
  /** 조회 폼 — 라벨 상단 (참조 UI) */
  stacked?: boolean;
  children: ReactNode;
}) {
  if (stacked) {
    return (
      <label className={`flex min-w-0 flex-col gap-1 ${className}`}>
        <span className="text-[12px] font-medium text-[#666]">{label}</span>
        <span className="min-w-0">{children}</span>
      </label>
    );
  }

  return (
    <label
      className={`flex min-w-0 items-center gap-2 text-[13px] ${className}`}
    >
      <span
        className={
          aligned
            ? "w-[4.5rem] shrink-0 text-right font-medium text-[#666]"
            : "shrink-0 font-medium text-[#666]"
        }
      >
        {label}
      </span>
      <span className="inline-flex min-w-0 shrink-0 items-center">{children}</span>
    </label>
  );
}

/** 라벨 상단 — 조회 폼 등 */
export function CasFormField({
  label,
  hint,
  className = "",
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`min-w-0 space-y-1 ${className}`}>
      <div className="flex items-baseline gap-2">
        <span className="text-[12px] font-medium text-[#666]">{label}</span>
        {hint ? (
          <span className="text-[11px] text-[#94a3b8]">{hint}</span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

/** Mode A/B/C 등 조회 조건 구역 */
export function CasSearchSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-md border border-[#e5e9ef] bg-[#f8fafc] px-3.5 py-3">
      <div className="mb-2.5 border-b border-[#e5e9ef] pb-2">
        <h3 className="text-[12px] font-semibold text-[#333]">{title}</h3>
        {description ? (
          <p className="mt-0.5 text-[11px] leading-4 text-[#666]">
            {description}
          </p>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {children}
      </div>
    </div>
  );
}

export function CasCompactInput({
  className = "",
  type,
  value,
  onChange,
  onFocus,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      value={value}
      className={`h-8 w-full rounded-md border border-[#d8dee6] bg-white px-2.5 text-[12px] text-[#333] shadow-sm placeholder:text-[#94a3b8] focus:border-[#1e2f4f] focus:outline-none focus:ring-1 focus:ring-[#1e2f4f]/18 ${className}`}
      onChange={onChange}
      onFocus={(e) => {
        if (
          type === "date" &&
          onChange &&
          !String(value ?? "").trim()
        ) {
          const today = todayYmdLocal();
          onChange({
            ...e,
            target: { ...e.target, value: today },
            currentTarget: { ...e.currentTarget, value: today },
          } as React.ChangeEvent<HTMLInputElement>);
        }
        onFocus?.(e);
      }}
      {...props}
    />
  );
}

export function CasSearchIconButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[#666] transition-colors hover:bg-[#f4f7f9] hover:text-[#333]"
      aria-label={label}
      onClick={onClick}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="h-4 w-4"
        aria-hidden
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
    </button>
  );
}

const actionBtnBase =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md px-4 text-[12px] font-medium shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60";

/** 저장 버튼과 동일한 Cas 네이비 액션 색 */
export const casActionFillClass =
  "bg-[#1e2f4f] font-semibold text-white hover:bg-[#162438]";

export function CasPrimaryButton({
  children,
  disabled,
  type = "button",
  onClick,
  icon,
}: {
  children: ReactNode;
  disabled?: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
  icon?: "save" | "plus" | "search" | "play";
}) {
  const Icon =
    icon === "save"
      ? SlIconSave
      : icon === "plus"
        ? SlIconPlus
        : icon === "play"
          ? SlIconPlay
          : icon === "search"
            ? SlIconSearch
            : null;
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`${actionBtnBase} ${casActionFillClass} px-5`}
    >
      {Icon ? <Icon /> : null}
      {children}
    </button>
  );
}

export function CasSecondaryButton({
  children,
  disabled,
  type = "button",
  onClick,
  icon,
  title,
  className = "",
}: {
  children: ReactNode;
  disabled?: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
  icon?: "download" | "excel" | "close" | "refresh";
  title?: string;
  className?: string;
}) {
  const Icon =
    icon === "excel"
      ? SlIconExcel
      : icon === "download"
        ? SlIconDownload
        : icon === "close"
          ? SlIconClose
          : icon === "refresh"
            ? SlIconRefresh
            : null;
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={`${actionBtnBase} ${casActionFillClass} ${className}`}
    >
      {Icon ? <Icon /> : null}
      {children}
    </button>
  );
}

/** 조회 폼 — 초기화 */
export function CasResetButton({
  disabled,
  type = "button",
  onClick,
  className = "",
}: {
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`${actionBtnBase} ${casActionFillClass} ${className}`}
    >
      <SlIconReset />
      초기화
    </button>
  );
}

/** 조회 폼 — 조회/검색 */
export function CasSearchButton({
  children = "조회",
  disabled,
  type = "button",
  onClick,
  className = "",
}: {
  children?: ReactNode;
  disabled?: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`${actionBtnBase} ${casActionFillClass} ${className}`}
    >
      <SlIconSearch />
      {children}
    </button>
  );
}

/** 엑셀 다운로드 */
export function CasExcelButton({
  children = "엑셀다운",
  disabled,
  type = "button",
  onClick,
  className = "",
}: {
  children?: ReactNode;
  disabled?: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`${actionBtnBase} ${casActionFillClass} ${className}`}
    >
      <SlIconExcel />
      {children}
    </button>
  );
}

/** 삭제 등 위험 동작 */
export function CasDangerButton({
  children,
  disabled,
  type = "button",
  onClick,
  className = "",
}: {
  children: ReactNode;
  disabled?: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`${actionBtnBase} ${casActionFillClass} ${className}`}
    >
      <SlIconTrash />
      {children}
    </button>
  );
}

/** 보조 강조(법령ID 조회 등) */
export function CasAccentButton({
  children,
  disabled,
  type = "button",
  onClick,
  className = "",
  title,
  icon = "import",
}: {
  children: ReactNode;
  disabled?: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
  className?: string;
  title?: string;
  icon?: "import" | "batch";
}) {
  const Icon = icon === "batch" ? SlIconBatch : SlIconImport;
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={`${actionBtnBase} ${casActionFillClass} ${className}`}
    >
      <Icon />
      {children}
    </button>
  );
}

/** 저장 */
export function CasSaveButton({
  children = "저장",
  disabled,
  type = "button",
  onClick,
  className = "",
}: {
  children?: ReactNode;
  disabled?: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`${actionBtnBase} ${casActionFillClass} ${className}`}
    >
      <SlIconSave />
      {children}
    </button>
  );
}

/** 닫기 */
export function CasCloseButton({
  children = "닫기",
  disabled,
  type = "button",
  onClick,
  className = "",
}: {
  children?: ReactNode;
  disabled?: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`${actionBtnBase} ${casActionFillClass} ${className}`}
    >
      <SlIconClose />
      {children}
    </button>
  );
}

export function CasResultStats({
  total,
  tCnt,
}: {
  total: number;
  tCnt: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center rounded-full bg-[#1e2f4f]/10 px-2.5 py-1 text-[12px] font-medium text-[#1e2f4f]">
        표시 {total.toLocaleString()}건
      </span>
      {tCnt > 0 ? (
        <span className="inline-flex items-center rounded-full bg-[#f4f7f9] px-2.5 py-1 text-[12px] text-[#666]">
          Gateway tCnt {tCnt.toLocaleString()}건
          {total !== tCnt ? " · 필터 적용" : ""}
        </span>
      ) : null}
    </div>
  );
}

export function CasAlert({
  tone,
  children,
}: {
  tone: "error" | "info";
  children: ReactNode;
}) {
  const cls =
    tone === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-[#e5e9ef] bg-[#f8fafc] text-[#333]";
  return (
    <div className={`rounded-md border px-4 py-3 text-[13px] leading-6 ${cls}`}>
      {children}
    </div>
  );
}

export function CasTableEmpty({
  colSpan,
  loading,
  searched,
  hasItems,
}: {
  colSpan: number;
  loading: boolean;
  searched: boolean;
  hasItems: boolean;
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
  if (!searched) {
    return (
      <tr>
        <td colSpan={colSpan} className={`${tdClass} py-16 text-center`}>
          <p className="text-[14px] font-medium text-[#666]">조회 조건을 입력하세요</p>
          <p className="mt-1 text-[12px] text-[#94a3b8]">
            CAS 로그인 후 거래처·기간 또는 신고번호로 검색할 수 있습니다.
          </p>
        </td>
      </tr>
    );
  }
  if (!hasItems) {
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
  return null;
}
