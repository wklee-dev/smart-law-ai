"use client";

import type { ReactNode } from "react";
import { CasAuthBar, type UseCasNcomAuthResult } from "@/app/(ai)/cas-ncom/use-cas-ncom-auth";
import { CasInlineField } from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import {
  CasGatewaySwitch,
  type CasGatewayMode,
} from "@/app/(ai)/cas-ncom/cas-gateway-mode";

export function CasPageTopBar({
  auth,
  gatewayMode,
  onGatewayChange,
  onFieldSettings,
  fieldSettingsDisabled,
}: {
  auth: UseCasNcomAuthResult;
  gatewayMode: CasGatewayMode;
  onGatewayChange: (mode: CasGatewayMode) => void;
  onFieldSettings?: () => void;
  fieldSettingsDisabled?: boolean;
}) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <div className="inline-flex max-w-full items-center gap-2 whitespace-nowrap rounded-md border border-[#e5e9ef] bg-white px-2 py-0.5 shadow-sm">
        <CasGatewaySwitch mode={gatewayMode} onChange={onGatewayChange} />
        <span className="h-4 w-px shrink-0 bg-slate-200" aria-hidden />
        <CasAuthBar auth={auth} />
        {onFieldSettings ? (
          <>
            <span className="h-4 w-px shrink-0 bg-slate-200" aria-hidden />
            <button
              type="button"
              className="h-7 shrink-0 rounded-md border border-[#d8dee6] bg-white px-2.5 text-[12px] font-medium text-[#666] hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={fieldSettingsDisabled}
              onClick={onFieldSettings}
            >
              항목 설정
            </button>
          </>
        ) : null}
      </div>
      {auth.loginError ? (
        <p
          className="max-w-[min(520px,90vw)] text-right text-[10px] leading-4 text-red-600 line-clamp-3"
          title={auth.loginError}
        >
          {auth.loginError}
        </p>
      ) : null}
    </div>
  );
}

/** 조회 조건 — 필드 + 버튼 한 줄 */
export function CasSearchFormRow({
  fields,
  actions,
  compact,
  singleLine,
}: {
  fields: ReactNode;
  actions: ReactNode;
  /** 필드·버튼 간격 축소, actions를 필드 바로 옆에 배치 */
  compact?: boolean;
  /** 조회조건·버튼을 한 줄(좁으면 가로 스크롤) */
  singleLine?: boolean;
}) {
  const rowWrap = singleLine
    ? "flex-nowrap overflow-x-auto"
    : "flex-wrap";
  if (compact) {
    return (
      <div className={`flex ${rowWrap} items-center gap-x-2 gap-y-2`}>
        {fields}
        <div
          className={`flex shrink-0 items-center gap-2 ${singleLine ? "flex-nowrap" : "flex-wrap"}`}
        >
          {actions}
        </div>
      </div>
    );
  }
  return (
    <div
      className={`flex ${rowWrap} items-center ${singleLine ? "gap-x-2" : "justify-between gap-x-4 gap-y-2"}`}
    >
      <div
        className={`flex min-w-0 items-center ${singleLine ? "shrink-0 flex-nowrap gap-x-2" : "flex-wrap gap-x-4 gap-y-2"}`}
      >
        {fields}
      </div>
      <div className={`flex shrink-0 items-center gap-2 ${singleLine ? "flex-nowrap" : ""}`}>
        {actions}
      </div>
    </div>
  );
}

export function CasSearchFieldsRow({
  children,
  stacked,
  compact,
  singleLine,
}: {
  children: ReactNode;
  /** 참조 UI — 라벨 상단 그리드 */
  stacked?: boolean;
  compact?: boolean;
  singleLine?: boolean;
}) {
  if (stacked) {
    return (
      <div className="grid w-full grid-cols-2 items-end gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {children}
      </div>
    );
  }
  const wrap = singleLine ? "flex-nowrap shrink-0" : "flex-wrap w-full";
  return (
    <div
      className={`flex items-center ${wrap} ${
        compact ? "gap-x-2 gap-y-1.5" : "gap-x-4 gap-y-2"
      }`}
    >
      {children}
    </div>
  );
}

/** 1행 거래처 열과 동일 너비 — 2행 필드를 수리일자 열에 맞춤 */
export function CasSearchRowLeadSpacer() {
  return (
    <CasInlineField
      label="거래처"
      aligned
      className="pointer-events-none invisible hidden shrink-0 sm:flex"
      aria-hidden
    >
      <div className="w-[240px]" />
    </CasInlineField>
  );
}

export function CasSearchFieldsGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-x-5 gap-y-2.5 sm:grid-cols-2 xl:grid-cols-3">
      {children}
    </div>
  );
}
