"use client";

import { TARIFF_DETAIL_SECTION_CLASS } from "@/app/components/tariff-item-detail-panels";

const REQ_TYPE_ORDER = ["수입", "수출", "기타"] as const;

const REQ_CATEGORY_ORDER = ["세관장확인", "수출입공고", "통합공고"] as const;

export type TariffReqRow = {
  req_type: string;
  req_category: string;
  req_content: string;
};

export type TariffStrategicRow = {
  cls_no: string;
  item_name: string;
  ctrl_name: string;
  model_spec: string;
  ctrl_detail: string;
  manufacturer: string;
  remark: string;
};

const REQ_EMPTY_MESSAGE = "조회결과가 존재하지 않습니다.";

function sortReqRows(rows: TariffReqRow[]): TariffReqRow[] {
  const order = new Map(
    REQ_CATEGORY_ORDER.map((c, i) => [c, i] as const),
  );
  return [...rows].sort((a, b) => {
    const ai = order.get(a.req_category.trim() as (typeof REQ_CATEGORY_ORDER)[number]);
    const bi = order.get(b.req_category.trim() as (typeof REQ_CATEGORY_ORDER)[number]);
    const av = ai ?? 99;
    const bv = bi ?? 99;
    if (av !== bv) return av - bv;
    return a.req_category.localeCompare(b.req_category, "ko");
  });
}

function isReqContentEmpty(content: string | undefined | null): boolean {
  const t = (content ?? "").trim();
  return !t || t === "—" || t === "-";
}

function hasAnyReqContent(rows: TariffReqRow[]): boolean {
  return rows.some((r) => !isReqContentEmpty(r.req_content));
}

/** 수입·수출·기타 — 세관장확인·수출입공고·통합공고 3행 고정 */
function rowsForReqType(
  typeLabel: string,
  reqByType: Record<string, TariffReqRow[]>,
): TariffReqRow[] {
  const fromApi = sortReqRows(reqByType[typeLabel] ?? []);
  const byCat = new Map(
    fromApi.map((r) => [r.req_category.trim(), r] as const),
  );
  return REQ_CATEGORY_ORDER.map((cat) => {
    const existing = byCat.get(cat);
    return (
      existing ?? {
        req_type: typeLabel,
        req_category: cat,
        req_content: "",
      }
    );
  });
}

function ReqContent({ text }: { text: string }) {
  const trimmed = (text ?? "").trim();
  if (!trimmed || trimmed === "—" || trimmed === "-") return null;
  const parts = trimmed.split(/(\[[^\]]+\])/g);
  return (
    <span className="whitespace-pre-wrap leading-relaxed text-slate-800">
      {parts.map((part, i) =>
        part.startsWith("[") && part.endsWith("]") ? (
          <span key={i} className="text-blue-700">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  );
}

function ExternalLinkIcon() {
  return (
    <svg
      className="ml-1 inline-block h-3.5 w-3.5 shrink-0 text-blue-600"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <path
        d="M10 2h4v4M14 2 8 8M6 3H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-3"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ReqCategoryLabel({ category }: { category: string }) {
  return (
    <span className="inline-flex items-center justify-center gap-0.5">
      {category}
      <ExternalLinkIcon />
    </span>
  );
}

function ReqTypeBlock({ typeLabel, rows }: { typeLabel: string; rows: TariffReqRow[] }) {
  const hasContent = hasAnyReqContent(rows);

  return (
    <div className="mb-4 last:mb-0">
      <h3 className="mb-2 text-sm font-semibold text-slate-800">
        <span className="text-slate-500">·</span> {typeLabel}
      </h3>
      <div className="overflow-hidden rounded-sm border border-[#b8d4e8] bg-[#f8fbfd]">
        <table className="w-full border-collapse text-sm">
          <tbody>
            {!hasContent ? (
              REQ_CATEGORY_ORDER.map((cat, i) => (
                <tr
                  key={cat}
                  className="border-b border-[#d1e1f0] last:border-b-0"
                >
                  <th
                    scope="row"
                    className="w-[9.5rem] min-w-[9.5rem] border-r border-[#d1e1f0] bg-[#eef4f9] px-3 py-2.5 text-center align-middle text-xs font-medium text-slate-700"
                  >
                    <ReqCategoryLabel category={cat} />
                  </th>
                  {i === 0 ? (
                    <td
                      rowSpan={REQ_CATEGORY_ORDER.length}
                      className="bg-white px-3 py-8 text-center align-middle text-sm text-slate-600"
                    >
                      {REQ_EMPTY_MESSAGE}
                    </td>
                  ) : null}
                </tr>
              ))
            ) : (
              rows.map((row) => (
                <tr
                  key={row.req_category}
                  className="border-b border-[#d1e1f0] last:border-b-0"
                >
                  <th
                    scope="row"
                    className="w-[9.5rem] min-w-[9.5rem] border-r border-[#d1e1f0] bg-[#eef4f9] px-3 py-2.5 text-center align-middle text-xs font-medium text-slate-700"
                  >
                    <ReqCategoryLabel category={row.req_category} />
                  </th>
                  <td className="bg-white px-3 py-2.5 align-top">
                    <ReqContent text={row.req_content} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** 원본 UNIPASS: 요건사항 — 수입·수출·기타를 탭 없이 세로로 표시 */
export function TariffReqConditionsSection({
  reqByType,
}: {
  reqByType: Record<string, TariffReqRow[]>;
}) {
  const extraTypes = Object.keys(reqByType).filter(
    (k) => !REQ_TYPE_ORDER.includes(k as (typeof REQ_TYPE_ORDER)[number]),
  );
  const types = [...REQ_TYPE_ORDER, ...extraTypes];

  const blocks = types.map((type) => ({
    type,
    rows: rowsForReqType(type, reqByType),
  }));

  const hasAnySectionContent = blocks.some((b) => hasAnyReqContent(b.rows));

  return (
    <section className={TARIFF_DETAIL_SECTION_CLASS}>
      <div className="border-b border-[#b8d4e8] bg-white px-3 py-2">
        <h2 className="text-sm font-semibold text-blue-800">
          <span className="mr-1 text-blue-600">|</span> 요건사항
        </h2>
      </div>
      <div className="p-3">
        {!hasAnySectionContent ? (
          <p className="py-4 text-center text-sm text-slate-600">
            {REQ_EMPTY_MESSAGE}
          </p>
        ) : (
          blocks.map(({ type, rows }) => (
            <ReqTypeBlock key={type} typeLabel={type} rows={rows} />
          ))
        )}
      </div>
    </section>
  );
}

const STRATEGIC_COLUMNS: { key: keyof TariffStrategicRow; label: string }[] = [
  { key: "cls_no", label: "전략물자 분류번호" },
  { key: "item_name", label: "품명" },
  { key: "ctrl_name", label: "전략물자통제명" },
  { key: "model_spec", label: "모델규격명" },
  { key: "ctrl_detail", label: "전략물자 통제상세내용" },
  { key: "manufacturer", label: "제조자상호" },
  { key: "remark", label: "비고내용" },
];

/** 원본 UNIPASS: 전략물자 7열 테이블 */
export function TariffStrategicSection({
  rows,
}: {
  rows: TariffStrategicRow[];
}) {
  return (
    <section className={TARIFF_DETAIL_SECTION_CLASS}>
      <div className="border-b border-[#b8d4e8] bg-white px-3 py-2">
        <h2 className="text-sm font-semibold text-slate-800">
          <span className="text-slate-500">·</span> 전략물자
        </h2>
      </div>
      <div className="overflow-x-auto p-3 pt-2">
        <table className="w-full min-w-[720px] border-collapse border border-[#b8d4e8] text-left text-xs">
          <thead>
            <tr className="bg-[#eef4f9] text-slate-700">
              {STRATEGIC_COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className="border border-[#d1e1f0] px-2 py-2 font-medium whitespace-nowrap"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={STRATEGIC_COLUMNS.length}
                  className="border border-[#d1e1f0] bg-white px-3 py-6 text-center text-sm text-slate-600"
                >
                  조회결과가 존재하지 않습니다.
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={`${row.cls_no}-${i}`} className="bg-white">
                  {STRATEGIC_COLUMNS.map((col) => (
                    <td
                      key={col.key}
                      className="border border-[#d1e1f0] px-2 py-2 align-top text-slate-800"
                    >
                      {(row[col.key] ?? "").trim() || "—"}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
          * 전략물자 관련 정보는 단순 참고사항으로 전략물자 등 해당여부는 전략물자
          수출입고시(산업통상부) 별표1~별표4를 확인하시기 바랍니다.
        </p>
      </div>
    </section>
  );
}

/** 원본 UNIPASS: 기타사항 (별도 섹션) */
export function TariffOtherMattersSection({
  content,
}: {
  /** 추후 별도 데이터 연동 시 사용; 없으면 조회 없음 표시 */
  content?: string | null;
}) {
  const text = (content ?? "").trim();
  return (
    <section className={TARIFF_DETAIL_SECTION_CLASS}>
      <div className="border-b border-[#b8d4e8] bg-white px-3 py-2">
        <h2 className="text-sm font-semibold text-slate-800">
          <span className="text-slate-500">·</span> 기타
        </h2>
      </div>
      <div className="p-3">
        <div className="rounded-sm border border-[#b8d4e8] bg-[#f8fbfd] px-3 py-6 text-center text-sm text-slate-600">
          {text || "조회결과가 존재하지 않습니다."}
        </div>
      </div>
    </section>
  );
}
