"use client";

import {
  CasAlert,
  CasCard,
  CasPageHeader,
  CasPageShell,
  CasSecondaryButton,
  slTableWrapClass,
  stickyThClass,
  tdClass,
} from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import { ClipPaginationBar } from "@/app/(ai)/customs-law-portal/clip-portal-grid-ui";
import {
  defaultNlcDateRange,
  formatNlcDisplayDate,
  formatNlcPeriod,
  NLC_LIST_PAGE_SIZE,
  nlcRemainingDays,
  nlcVisiblePageBlock,
} from "@/app/(ai)/integrated-legislation-notice/nlc-notice-format";
import {
  NlcNoticeSearchForm,
  NlcNoticeSortSelect,
  type NlcSearchFacets,
  type NlcSearchFormState,
} from "@/app/(ai)/integrated-legislation-notice/nlc-notice-search-form";
import {
  NLC_NOTICE_TABS,
  nlcNoticePageTitle,
  type NlcListResponse,
  type NlcMinistryAdministrativeListItem,
  type NlcMinistryLegislationListItem,
  type NlcLocalLegislationListItem,
  type NlcNoticeDetail,
  type NlcNoticeKind,
} from "@/app/shared/nlc-notice-types";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const GRID_SCROLL =
  "max-h-[min(52vh,560px)] min-h-[200px] overflow-auto overscroll-contain";

type Props = { kind: NlcNoticeKind };

function buildNoticeNumberQuery(prefix: string, digits: string): string | undefined {
  const n = digits.trim();
  if (!n) return undefined;
  const p = prefix.trim();
  return p ? `${p}${n}` : n;
}

function initialSearchState(range: { from: string; to: string }): NlcSearchFormState {
  return {
    dateFrom: range.from,
    dateTo: range.to,
    q: "",
    includeFinished: false,
    organizationOnly: false,
    department: "",
    lawType: "",
    lawField: "",
    ruleType: "",
    noticeStatus: "all",
    institution: "",
    noticeNumber: "",
    noticeNumberKind: "",
    localGovernment: "",
    localRegion: "",
    sort: "date_desc",
  };
}

function str(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

export function NlcNoticeView({ kind }: Props) {
  const initialRange = useMemo(() => defaultNlcDateRange(), []);
  const tabMeta = NLC_NOTICE_TABS.find((t) => t.kind === kind)!;

  const [search, setSearch] = useState<NlcSearchFormState>(() =>
    initialSearchState(initialRange),
  );

  const [page, setPage] = useState(1);
  const pageSize = NLC_LIST_PAGE_SIZE;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [listPayload, setListPayload] = useState<NlcListResponse | null>(null);

  const [selectedSequence, setSelectedSequence] = useState<string | null>(null);
  const [detail, setDetail] = useState<NlcNoticeDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const buildListParams = useCallback((pageOverride?: number) => {
    const p = new URLSearchParams();
    p.set("kind", kind);
    p.set("page", String(pageOverride ?? page));
    p.set("pageSize", String(pageSize));
    p.set("sort", search.sort);
    if (search.q.trim()) p.set("q", search.q.trim());
    if (search.dateFrom) p.set("dateFrom", search.dateFrom);
    if (search.dateTo) p.set("dateTo", search.dateTo);
    if (search.includeFinished) p.set("includeFinished", "1");
    if (search.organizationOnly) p.set("organizationOnly", "1");
    if (search.noticeStatus !== "all") {
      p.set("noticeStatus", search.noticeStatus);
    }
    if (kind === "ministry-legislation") {
      if (search.department) p.set("department", search.department);
      if (search.lawType) p.set("lawType", search.lawType);
      if (search.lawField) p.set("lawField", search.lawField);
    }
    if (kind === "ministry-administrative") {
      if (search.institution.trim()) p.set("institution", search.institution.trim());
      if (search.ruleType) p.set("ruleType", search.ruleType);
      const nn = buildNoticeNumberQuery(
        search.noticeNumberKind,
        search.noticeNumber,
      );
      if (nn) p.set("noticeNumber", nn);
    }
    if (kind === "local-legislation") {
      if (search.localGovernment) {
        p.set("localGovernment", search.localGovernment);
      }
      if (search.localRegion) p.set("localRegion", search.localRegion);
      const nn = buildNoticeNumberQuery(
        search.noticeNumberKind,
        search.noticeNumber,
      );
      if (nn) p.set("noticeNumber", nn);
    }
    return p;
  }, [kind, page, pageSize, search]);

  const loadList = useCallback(async (pageOverride?: number) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/nlc-notices?${buildListParams(pageOverride).toString()}`,
      );
      const json = (await res.json()) as NlcListResponse & {
        ok?: boolean;
        message?: string;
      };
      if (!json.ok) {
        setError(json.message ?? "목록 조회에 실패했습니다.");
        setListPayload(null);
        return;
      }
      setListPayload(json);
    } catch {
      setError("목록을 불러오지 못했습니다.");
      setListPayload(null);
    } finally {
      setLoading(false);
    }
  }, [buildListParams]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const loadDetail = useCallback(
    async (sequence: string) => {
      setDetailLoading(true);
      try {
        const p = new URLSearchParams();
        p.set("detailKind", kind);
        p.set("sequence", sequence);
        const res = await fetch(`/api/nlc-notices?${p.toString()}`);
        const json = (await res.json()) as {
          ok?: boolean;
          detail?: NlcNoticeDetail;
          message?: string;
        };
        if (json.ok && json.detail) {
          setDetail(json.detail);
        } else {
          setDetail(null);
        }
      } catch {
        setDetail(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [kind],
  );

  const selectRow = (sequence: string) => {
    setSelectedSequence(sequence);
    void loadDetail(sequence);
  };

  const resetFilters = () => {
    setSearch(initialSearchState(defaultNlcDateRange()));
    setPage(1);
    setSelectedSequence(null);
    setDetail(null);
  };

  const runSearch = () => {
    setPage(1);
    setSelectedSequence(null);
    setDetail(null);
    void loadList(1);
  };

  const total = listPayload?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const curPageSafe = Math.min(Math.max(1, page), totalPages);
  const pageBlock = useMemo(
    () => nlcVisiblePageBlock(curPageSafe, totalPages),
    [curPageSafe, totalPages],
  );

  const goPage = (p: number) => {
    setPage(p);
    setSelectedSequence(null);
    setDetail(null);
  };

  const listMessage =
    listPayload?.kind === "local-legislation" && !listPayload.dataAvailable
      ? listPayload.message
      : null;

  const searchFacets: NlcSearchFacets = useMemo(() => {
    const empty: NlcSearchFacets = {
      departments: [],
      lawTypes: [],
      lawFields: [],
      institutions: [],
      ruleTypes: [],
      localGovernments: [],
      localRegions: [],
    };
    if (listPayload?.kind === "ministry-legislation") {
      return { ...empty, ...listPayload.facets };
    }
    if (listPayload?.kind === "ministry-administrative") {
      return { ...empty, ...listPayload.facets };
    }
    if (listPayload?.kind === "local-legislation" && listPayload.facets) {
      return { ...empty, ...listPayload.facets };
    }
    return empty;
  }, [listPayload]);

  const patchSearch = (patch: Partial<NlcSearchFormState>) => {
    setSearch((prev) => ({ ...prev, ...patch }));
  };

  return (
    <CasPageShell className="flex min-h-0 flex-1 flex-col gap-4">
      <CasPageHeader title={nlcNoticePageTitle(kind)} />

      <CasCard className="p-3">
        <NlcNoticeSearchForm
          kind={kind}
          state={search}
          facets={searchFacets}
          loading={loading}
          onChange={patchSearch}
          onSearch={runSearch}
          onReset={resetFilters}
        />
      </CasCard>

      {error ? <CasAlert tone="error">{error}</CasAlert> : null}
      {listMessage ? <CasAlert tone="info">{listMessage}</CasAlert> : null}

      <CasCard className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5 text-sm text-slate-600">
          <span>
            {loading
              ? "불러오는 중…"
              : `전체 ${total.toLocaleString("ko-KR")}건 · ${curPageSafe} / ${totalPages}쪽`}
          </span>
          <NlcNoticeSortSelect
            sort={search.sort}
            disabled={loading}
            onChange={(sort) => patchSearch({ sort })}
            onApply={runSearch}
          />
        </div>

        <div className={`${GRID_SCROLL} ${slTableWrapClass} rounded-none border-x-0 border-b-0`}>
          <table className="w-max min-w-full border-collapse text-left text-sm text-slate-800">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr>
                {kind === "ministry-legislation" ? (
                  <>
                    <th className={`${stickyThClass} min-w-[3rem]`}>번호</th>
                    <th className={`${stickyThClass} min-w-[16rem]`}>법령 제명</th>
                    <th className={`${stickyThClass} min-w-[9rem]`}>소관부처 (법령종류)</th>
                    <th className={`${stickyThClass} min-w-[10rem]`}>법령분야 (적용대상)</th>
                    <th className={`${stickyThClass} min-w-[11rem]`}>입법의견 접수기간</th>
                    <th className={`${stickyThClass} min-w-[4.5rem]`}>남은기간</th>
                    <th className={`${stickyThClass} min-w-[3.5rem]`}>의견수</th>
                    <th className={`${stickyThClass} min-w-[3.5rem]`}>조회수</th>
                  </>
                ) : null}
                {kind === "ministry-administrative" ? (
                  <>
                    <th className={`${stickyThClass} min-w-[3rem]`}>번호</th>
                    <th className={`${stickyThClass} min-w-[16rem]`}>행정예고명</th>
                    <th className={`${stickyThClass} min-w-[5rem]`}>행정규칙</th>
                    <th className={`${stickyThClass} min-w-[10rem]`}>기관 (공고번호)</th>
                    <th className={`${stickyThClass} min-w-[11rem]`}>입법의견 접수기간</th>
                    <th className={`${stickyThClass} min-w-[3.5rem]`}>조회수</th>
                  </>
                ) : null}
                {kind === "local-legislation" ? (
                  <>
                    <th className={`${stickyThClass} min-w-[3rem]`}>번호</th>
                    <th className={`${stickyThClass} min-w-[16rem]`}>입법예고명</th>
                    <th className={`${stickyThClass} min-w-[8rem]`}>자치단체</th>
                    <th className={`${stickyThClass} min-w-[7rem]`}>공고번호</th>
                    <th className={`${stickyThClass} min-w-[6.5rem]`}>공고일자</th>
                    <th className={`${stickyThClass} min-w-[3.5rem]`}>조회수</th>
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {kind === "ministry-legislation" &&
              listPayload?.kind === "ministry-legislation"
                ? listPayload.items.map((row, idx) => (
                    <LegislationRow
                      key={row.noticeSequence}
                      row={row}
                      rowNo={total - (curPageSafe - 1) * pageSize - idx}
                      active={selectedSequence === row.noticeSequence}
                      onSelect={() => selectRow(row.noticeSequence)}
                    />
                  ))
                : null}
              {kind === "ministry-administrative" &&
              listPayload?.kind === "ministry-administrative"
                ? listPayload.items.map((row, idx) => (
                    <AdministrativeRow
                      key={row.noticeSequence}
                      row={row}
                      rowNo={total - (curPageSafe - 1) * pageSize - idx}
                      active={selectedSequence === row.noticeSequence}
                      onSelect={() => selectRow(row.noticeSequence)}
                    />
                  ))
                : null}
              {kind === "local-legislation" &&
              listPayload?.kind === "local-legislation"
                ? listPayload.items.map((row, idx) => (
                    <LocalRow
                      key={row.noticeSequence}
                      row={row}
                      rowNo={total - (curPageSafe - 1) * pageSize - idx}
                      active={selectedSequence === row.noticeSequence}
                      onSelect={() => selectRow(row.noticeSequence)}
                    />
                  ))
                : null}
              {!loading && total === 0 ? (
                <tr>
                  <td
                    colSpan={
                      kind === "ministry-legislation"
                        ? 8
                        : kind === "ministry-administrative"
                          ? 6
                          : 6
                    }
                    className="px-4 py-10 text-center text-slate-400"
                  >
                    조회 결과가 없습니다.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="px-4 pb-4">
          <ClipPaginationBar
            curPageSafe={curPageSafe}
            totalPg={totalPages}
            loading={loading}
            block={pageBlock}
            onPage={goPage}
          />
        </div>
      </CasCard>

      {selectedSequence ? (
        <CasCard className="p-4">
          <NlcNoticeDetailPanel
            detail={detail}
            loading={detailLoading}
            sequence={selectedSequence}
          />
        </CasCard>
      ) : null}
    </CasPageShell>
  );
}

function rowClass(active: boolean): string {
  return `cursor-pointer border-t border-slate-100 hover:bg-sky-50/60 ${active ? "bg-sky-50" : ""}`;
}

function LegislationRow({
  row,
  rowNo,
  active,
  onSelect,
}: {
  row: NlcMinistryLegislationListItem;
  rowNo: number;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <tr className={rowClass(active)} onClick={onSelect}>
      <td className={`${tdClass} whitespace-nowrap tabular-nums`}>{rowNo}</td>
      <td className={`${tdClass} max-w-[24rem] whitespace-normal align-top font-medium text-sky-900`}>
        {row.title}
      </td>
      <td className={`${tdClass} whitespace-nowrap`}>
        {str(row.department)}
        {row.lawType ? ` (${row.lawType})` : ""}
      </td>
      <td className={`${tdClass} whitespace-normal align-top`}>
        {str(row.lawField)}
        {row.targetAudience ? ` (${row.targetAudience})` : ""}
      </td>
      <td className={`${tdClass} whitespace-nowrap`}>
        {formatNlcPeriod(row.startDate, row.endDate)}
      </td>
      <td className={`${tdClass} whitespace-nowrap`}>
        {nlcRemainingDays(row.endDate)}
      </td>
      <td className={`${tdClass} whitespace-nowrap tabular-nums text-slate-400`}>
        —
      </td>
      <td className={`${tdClass} whitespace-nowrap tabular-nums`}>
        {row.viewCount ?? "—"}
      </td>
    </tr>
  );
}

function AdministrativeRow({
  row,
  rowNo,
  active,
  onSelect,
}: {
  row: NlcMinistryAdministrativeListItem;
  rowNo: number;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <tr className={rowClass(active)} onClick={onSelect}>
      <td className={`${tdClass} whitespace-nowrap tabular-nums`}>{rowNo}</td>
      <td className={`${tdClass} max-w-[24rem] whitespace-normal align-top font-medium text-sky-900`}>
        {row.title}
      </td>
      <td className={`${tdClass} whitespace-nowrap`}>{str(row.ruleType)}</td>
      <td className={`${tdClass} whitespace-normal align-top`}>
        {str(row.institution)}
        {row.noticeNumber ? ` (${row.noticeNumber})` : ""}
      </td>
      <td className={`${tdClass} whitespace-nowrap`}>
        {formatNlcPeriod(row.startDate, row.endDate)}
      </td>
      <td className={`${tdClass} whitespace-nowrap tabular-nums`}>
        {row.viewCount ?? "—"}
      </td>
    </tr>
  );
}

function LocalRow({
  row,
  rowNo,
  active,
  onSelect,
}: {
  row: NlcLocalLegislationListItem;
  rowNo: number;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <tr className={rowClass(active)} onClick={onSelect}>
      <td className={`${tdClass} whitespace-nowrap tabular-nums`}>{rowNo}</td>
      <td className={`${tdClass} max-w-[24rem] whitespace-normal align-top font-medium text-sky-900`}>
        {row.title}
      </td>
      <td className={`${tdClass} whitespace-nowrap`}>{str(row.localGovernment)}</td>
      <td className={`${tdClass} whitespace-nowrap`}>{str(row.noticeNumber)}</td>
      <td className={`${tdClass} whitespace-nowrap`}>
        {formatNlcDisplayDate(row.announcementDate)}
      </td>
      <td className={`${tdClass} whitespace-nowrap tabular-nums`}>
        {row.viewCount ?? "—"}
      </td>
    </tr>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-[8rem_1fr] sm:gap-3">
      <dt className="text-sm font-semibold text-slate-600">{label}</dt>
      <dd className="text-sm text-slate-900">{value}</dd>
    </div>
  );
}

function NlcNoticeDetailPanel({
  detail,
  loading,
  sequence,
}: {
  detail: NlcNoticeDetail | null;
  loading: boolean;
  sequence: string;
}) {
  if (loading) {
    return <p className="text-sm text-slate-500">상세 불러오는 중…</p>;
  }
  if (!detail) {
    return (
      <p className="text-sm text-slate-500">
        상세를 불러오지 못했습니다. (번호 {sequence})
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-base font-bold text-slate-900">{detail.title}</h2>
        <div className="flex flex-wrap gap-2">
          {detail.sourceUrl ? (
            <CasSecondaryButton
              type="button"
              onClick={() =>
                window.open(detail.sourceUrl, "_blank", "noopener,noreferrer")
              }
            >
              원문 페이지
            </CasSecondaryButton>
          ) : null}
        </div>
      </div>

      <dl className="space-y-2 rounded-md border border-slate-100 bg-slate-50/60 p-3">
        {detail.kind === "ministry-legislation" ? (
          <>
            <DetailRow label="소관부처" value={str(detail.department)} />
            <DetailRow label="법령종류" value={str(detail.lawType)} />
            <DetailRow label="법령분야" value={str(detail.lawField)} />
            <DetailRow label="적용대상" value={str(detail.targetAudience)} />
            <DetailRow
              label="접수기간"
              value={formatNlcPeriod(detail.startDate ?? "", detail.endDate ?? "")}
            />
          </>
        ) : null}
        {detail.kind === "ministry-administrative" ? (
          <>
            <DetailRow label="행정규칙" value={str(detail.ruleType)} />
            <DetailRow label="기관" value={str(detail.institution)} />
            <DetailRow label="공고번호" value={str(detail.noticeNumber)} />
            <DetailRow
              label="접수기간"
              value={formatNlcPeriod(detail.startDate ?? "", detail.endDate ?? "")}
            />
            <DetailRow label="전화" value={str(detail.phone)} />
            <DetailRow label="팩스" value={str(detail.fax)} />
            <DetailRow label="이메일" value={str(detail.email)} />
          </>
        ) : null}
        {detail.kind === "local-legislation" ? (
          <>
            <DetailRow label="자치단체" value={str(detail.localGovernment)} />
            <DetailRow label="공고번호" value={str(detail.noticeNumber)} />
            <DetailRow
              label="공고일자"
              value={formatNlcDisplayDate(detail.announcementDate ?? "")}
            />
          </>
        ) : null}
        <DetailRow label="조회수" value={str(detail.viewCount)} />
        {Object.entries(detail.detailInfo).map(([k, v]) => (
          <DetailRow key={k} label={k} value={v} />
        ))}
      </dl>

      {detail.attachments.length > 0 ? (
        <div>
          <h3 className="mb-2 text-sm font-bold text-slate-800">첨부파일</h3>
          <ul className="space-y-1 text-sm">
            {detail.attachments.map((a) => (
              <li key={a.attachmentId}>
                {a.hasLocalFile ? (
                  <Link
                    className="text-sky-700 underline hover:text-sky-900"
                    href={`/api/nlc-notices/attachment?id=${a.attachmentId}`}
                  >
                    {a.fileName}
                  </Link>
                ) : a.downloadUrl ? (
                  <a
                    className="text-sky-700 underline hover:text-sky-900"
                    href={a.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {a.fileName}
                  </a>
                ) : (
                  <span>{a.fileName}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {detail.bodyText.trim() ? (
        <div>
          <h3 className="mb-2 text-sm font-bold text-slate-800">본문</h3>
          <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap rounded-md border border-slate-100 bg-white p-3 text-sm leading-relaxed text-slate-800">
            {detail.bodyText.trim()}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
