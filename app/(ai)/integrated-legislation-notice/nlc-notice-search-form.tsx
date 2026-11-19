"use client";

import type { ReactNode } from "react";
import {
  CasCompactInput,
  CasInlineField,
  CasPrimaryButton,
  CasResetButton,
  CasSearchButton,
} from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import { fillTodayIfEmpty } from "@/app/lib/date-input-utils";
import type {
  NlcNoticeKind,
  NlcNoticeSort,
  NlcNoticeStatusFilter,
} from "@/app/shared/nlc-notice-types";

export const nlcSelectClass =
  "min-h-[2rem] w-full min-w-0 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30";

export const nlcSearchBoxClass =
  "rounded-lg border border-sky-100 bg-sky-50/40 p-3";

/** 라벨·입력 한 줄 (그리드 셀 안에서 입력이 남는 너비 사용) */
function LegHorizField({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label
      className={`flex min-w-0 items-center gap-2 text-[13px] ${className ?? ""}`}
    >
      <span className="shrink-0 whitespace-nowrap font-medium text-[#666]">
        {label}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  );
}

function NoticeNumberInputs({
  kindPrefix,
  number,
  prefixOptions,
  onChange,
}: {
  kindPrefix: string;
  number: string;
  prefixOptions: { value: string; label: string }[];
  onChange: (patch: Partial<NlcSearchFormState>) => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-nowrap gap-1">
      <select
        className={`${nlcSelectClass} w-[5.5rem] shrink-0`}
        value={kindPrefix}
        onChange={(e) => onChange({ noticeNumberKind: e.target.value })}
      >
        {prefixOptions.map((o) => (
          <option key={o.value || "all"} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <CasCompactInput
        value={number}
        onChange={(e) => onChange({ noticeNumber: e.target.value })}
        placeholder="번호"
        className="min-h-[2rem] min-w-0 flex-1"
      />
    </div>
  );
}

function SearchActions({
  loading,
  onSearch,
  onReset,
}: {
  loading: boolean;
  onSearch: () => void;
  onReset?: () => void;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
      {onReset ? (
        <CasResetButton type="button" disabled={loading} onClick={onReset} />
      ) : null}
      <CasSearchButton type="button" disabled={loading} onClick={onSearch}>
        검색
      </CasSearchButton>
    </div>
  );
}

export type NlcSearchFormState = {
  dateFrom: string;
  dateTo: string;
  q: string;
  includeFinished: boolean;
  organizationOnly: boolean;
  department: string;
  lawType: string;
  lawField: string;
  ruleType: string;
  noticeStatus: NlcNoticeStatusFilter;
  institution: string;
  noticeNumber: string;
  noticeNumberKind: string;
  localGovernment: string;
  localRegion: string;
  sort: NlcNoticeSort;
};

export type NlcSearchFacets = {
  departments: string[];
  lawTypes: string[];
  lawFields: string[];
  institutions: string[];
  ruleTypes: string[];
  localGovernments: string[];
  localRegions: string[];
};

type Props = {
  kind: NlcNoticeKind;
  state: NlcSearchFormState;
  facets: NlcSearchFacets;
  loading: boolean;
  onChange: (patch: Partial<NlcSearchFormState>) => void;
  onSearch: () => void;
  onReset?: () => void;
};

export function NlcNoticeInfoBanner({ kind }: { kind: NlcNoticeKind }) {
  if (kind === "ministry-administrative") {
    return (
      <p className="mb-2 line-clamp-2 rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs leading-snug text-slate-600">
        (부처)행정예고는 관보(gwanbo.go.kr) 게재분 기준입니다. 미조회 시 해당
        기관 사이트를 확인해 주세요.
      </p>
    );
  }
  if (kind === "local-legislation") {
    return (
      <p className="mb-2 line-clamp-2 rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs leading-snug text-slate-600">
        (지방)입법예고는 elis.go.kr 연계 데이터입니다. 미수집 시 원본 사이트를
        확인해 주세요.
      </p>
    );
  }
  return null;
}

function DateRangeInputs({
  dateFrom,
  dateTo,
  onChange,
  fillCell,
}: {
  dateFrom: string;
  dateTo: string;
  onChange: (patch: Partial<NlcSearchFormState>) => void;
  /** 그리드 셀 안에서 가로 폭 채움 */
  fillCell?: boolean;
}) {
  const dateClass = fillCell
    ? `${nlcSelectClass} min-w-0 flex-1 basis-0`
    : `${nlcSelectClass} w-[10.25rem] shrink-0`;
  return (
    <div
      className={`flex flex-nowrap items-center gap-1 ${fillCell ? "w-full" : ""}`}
    >
      <input
        type="date"
        className={dateClass}
        value={dateFrom}
        onChange={(e) => onChange({ dateFrom: e.target.value })}
        onFocus={() =>
          fillTodayIfEmpty(dateFrom, (ymd) => onChange({ dateFrom: ymd }))
        }
      />
      <span className="shrink-0 text-slate-400">~</span>
      <input
        type="date"
        className={dateClass}
        value={dateTo}
        onChange={(e) => onChange({ dateTo: e.target.value })}
        onFocus={() =>
          fillTodayIfEmpty(dateTo, (ymd) => onChange({ dateTo: ymd }))
        }
      />
    </div>
  );
}

export function NlcNoticeSearchForm({
  kind,
  state,
  facets,
  loading,
  onChange,
  onSearch,
  onReset,
}: Props) {
  return (
    <div className={nlcSearchBoxClass}>
      <NlcNoticeInfoBanner kind={kind} />

      {kind === "ministry-legislation" ? (
        <div className="flex flex-col gap-3">
          {/* 1행: 소관부처 | 법령종류 | 법령분야 */}
          <div className="grid w-full grid-cols-3 items-center gap-4">
            <LegHorizField label="소관부처" className="w-full">
              <select
                className={nlcSelectClass}
                value={state.department}
                onChange={(e) => onChange({ department: e.target.value })}
              >
                <option value="">대상 선택</option>
                {facets.departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </LegHorizField>
            <LegHorizField label="법령종류" className="w-full">
              <select
                className={nlcSelectClass}
                value={state.lawType}
                onChange={(e) => onChange({ lawType: e.target.value })}
              >
                <option value="">대상 선택</option>
                {facets.lawTypes.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </LegHorizField>
            <LegHorizField label="법령분야" className="w-full">
              <select
                className={nlcSelectClass}
                value={state.lawField}
                onChange={(e) => onChange({ lawField: e.target.value })}
              >
                <option value="">대상 선택</option>
                {facets.lawFields.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </LegHorizField>
          </div>

          {/* 2행: 입법예고 시작일 | 법령 제명 (우측 넓은 칸) */}
          <div className="grid w-full grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-center gap-4">
            <LegHorizField label="입법예고 시작일" className="min-w-0 w-full">
              <DateRangeInputs
                dateFrom={state.dateFrom}
                dateTo={state.dateTo}
                onChange={onChange}
                fillCell
              />
            </LegHorizField>
            <LegHorizField label="법령 제명" className="min-w-0 w-full">
              <CasCompactInput
                value={state.q}
                onChange={(e) => onChange({ q: e.target.value })}
                placeholder="법령 제명"
                className="h-8 w-full text-sm"
              />
            </LegHorizField>
          </div>

          {/* 3행: 체크 | 초기화·검색 */}
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-700">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={state.organizationOnly}
                  onChange={(e) =>
                    onChange({ organizationOnly: e.target.checked })
                  }
                />
                직제
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={state.includeFinished}
                  onChange={(e) =>
                    onChange({ includeFinished: e.target.checked })
                  }
                />
                종료된 입법예고 포함
              </label>
            </div>
            <SearchActions
              loading={loading}
              onSearch={onSearch}
              onReset={onReset}
            />
          </div>
        </div>
      ) : null}

      {kind === "ministry-administrative" ? (
        <div className="flex flex-col gap-3">
          <div className="grid w-full grid-cols-3 items-center gap-4">
            <LegHorizField label="행정규칙" className="w-full">
              <select
                className={nlcSelectClass}
                value={state.ruleType}
                onChange={(e) => onChange({ ruleType: e.target.value })}
              >
                <option value="">대상 선택</option>
                {facets.ruleTypes.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </LegHorizField>
            <LegHorizField label="예고상태" className="w-full">
              <select
                className={nlcSelectClass}
                value={state.noticeStatus}
                onChange={(e) =>
                  onChange({
                    noticeStatus: e.target.value as NlcNoticeStatusFilter,
                  })
                }
              >
                <option value="all">대상 선택</option>
                <option value="open">진행</option>
                <option value="closed">종료</option>
              </select>
            </LegHorizField>
            <LegHorizField label="공고번호" className="w-full">
              <NoticeNumberInputs
                kindPrefix={state.noticeNumberKind}
                number={state.noticeNumber}
                prefixOptions={[
                  { value: "", label: "선택" },
                  { value: "제", label: "제" },
                  { value: "호", label: "호" },
                ]}
                onChange={onChange}
              />
            </LegHorizField>
          </div>

          <div className="grid w-full grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-center gap-4">
            <LegHorizField label="예고일자" className="min-w-0 w-full">
              <DateRangeInputs
                dateFrom={state.dateFrom}
                dateTo={state.dateTo}
                onChange={onChange}
                fillCell
              />
            </LegHorizField>
            <LegHorizField label="행정예고명" className="min-w-0 w-full">
              <CasCompactInput
                value={state.q}
                onChange={(e) => onChange({ q: e.target.value })}
                placeholder="행정예고명"
                className="h-8 w-full text-sm"
              />
            </LegHorizField>
          </div>

          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-4">
              <LegHorizField
                label="기관명"
                className="min-w-[14rem] max-w-xl flex-1"
              >
                <CasCompactInput
                  value={state.institution}
                  onChange={(e) => onChange({ institution: e.target.value })}
                  placeholder="기관명"
                  className="h-8 w-full text-sm"
                />
              </LegHorizField>
              <label className="flex shrink-0 items-center gap-1.5 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={state.includeFinished}
                  onChange={(e) =>
                    onChange({ includeFinished: e.target.checked })
                  }
                />
                종료된 예고 포함
              </label>
            </div>
            <SearchActions
              loading={loading}
              onSearch={onSearch}
              onReset={onReset}
            />
          </div>
        </div>
      ) : null}

      {kind === "local-legislation" ? (
        <div className="flex flex-col gap-3">
          <div className="grid w-full grid-cols-3 items-center gap-4">
            <LegHorizField label="자치단체" className="w-full">
              <select
                className={nlcSelectClass}
                value={state.localGovernment}
                onChange={(e) => onChange({ localGovernment: e.target.value })}
              >
                <option value="">대상 선택</option>
                {facets.localGovernments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </LegHorizField>
            <LegHorizField label="지역구" className="w-full">
              <select
                className={nlcSelectClass}
                value={state.localRegion}
                onChange={(e) => onChange({ localRegion: e.target.value })}
              >
                <option value="">대상 선택</option>
                {facets.localRegions.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </LegHorizField>
            <LegHorizField label="공고번호" className="w-full">
              <NoticeNumberInputs
                kindPrefix={state.noticeNumberKind}
                number={state.noticeNumber}
                prefixOptions={[
                  { value: "", label: "선택" },
                  { value: "제", label: "제" },
                ]}
                onChange={onChange}
              />
            </LegHorizField>
          </div>

          <div className="grid w-full grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-center gap-4">
            <LegHorizField label="공고일자" className="min-w-0 w-full">
              <DateRangeInputs
                dateFrom={state.dateFrom}
                dateTo={state.dateTo}
                onChange={onChange}
                fillCell
              />
            </LegHorizField>
            <LegHorizField label="입법예고명" className="min-w-0 w-full">
              <CasCompactInput
                value={state.q}
                onChange={(e) => onChange({ q: e.target.value })}
                placeholder="입법예고명"
                className="h-8 w-full text-sm"
              />
            </LegHorizField>
          </div>

          <div className="flex w-full flex-wrap items-center justify-end gap-3">
            <SearchActions
              loading={loading}
              onSearch={onSearch}
              onReset={onReset}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function NlcNoticeSortSelect({
  sort,
  disabled,
  onChange,
  onApply,
}: {
  sort: NlcNoticeSort;
  disabled?: boolean;
  onChange: (sort: NlcNoticeSort) => void;
  onApply: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <CasInlineField label="정렬방식">
        <select
          className={`${nlcSelectClass} w-[9.5rem]`}
          value={sort}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value as NlcNoticeSort)}
        >
          <option value="date_desc">최신 예고일순</option>
          <option value="date_asc">과거 예고일순</option>
          <option value="title_asc">제목순</option>
          <option value="views_desc">조회수순</option>
        </select>
      </CasInlineField>
      <CasPrimaryButton type="button" disabled={disabled} onClick={onApply}>
        조회
      </CasPrimaryButton>
    </div>
  );
}
