"use client";

import {
  ClipGridTable,
  ClipGridTd,
  ClipGridTh,
} from "@/app/(ai)/customs-law-portal/clip-portal-grid-ui";
import type { ClipHsImportGuideDetail } from "@/app/lib/clip-hs-import-guide-shared";
import { thClass } from "@/app/lib/sl-table-styles";

type GuideSection = {
  label: string;
  guidance: string;
  example: string;
  errorExample: string;
};

function hasSectionText(section: GuideSection): boolean {
  return Boolean(
    section.guidance.trim() ||
      section.example.trim() ||
      section.errorExample.trim(),
  );
}

function buildSections(detail: ClipHsImportGuideDetail): GuideSection[] {
  return [
    {
      label: "품명",
      guidance: detail.name_guidance,
      example: detail.name_example,
      errorExample: detail.name_error_example,
    },
    {
      label: "거래품명",
      guidance: detail.transaction_name_guidance,
      example: detail.transaction_name_example,
      errorExample: detail.transaction_name_error_example,
    },
    {
      label: "모델·규격",
      guidance: detail.model_spec_guidance,
      example: detail.model_spec_example,
      errorExample: detail.model_spec_error_example,
    },
    {
      label: "성분",
      guidance: detail.ingredient_guidance,
      example: detail.ingredient_example,
      errorExample: detail.ingredient_error_example,
    },
    {
      label: "수입요건확인",
      guidance: detail.import_requirement_guidance,
      example: detail.import_requirement_example,
      errorExample: detail.import_requirement_error_example,
    },
  ].filter(hasSectionText);
}

function GuideCell({ text }: { text: string }) {
  if (!text.trim()) {
    return <span className="text-[#999]">—</span>;
  }
  return (
    <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[#333]">
      {text}
    </p>
  );
}

export function HsImportGuideDetailModal({
  detail,
  loading,
  onClose,
}: {
  detail: ClipHsImportGuideDetail | null;
  loading?: boolean;
  onClose: () => void;
}) {
  if (!detail && !loading) return null;

  const sections = detail ? buildSections(detail) : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2"
      role="dialog"
      aria-modal
      aria-labelledby="hs-import-guide-detail-title"
      onClick={onClose}
    >
      <div
        className="flex h-[min(92vh,900px)] w-[min(96vw,1180px)] flex-col overflow-hidden rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-stone-200 bg-[#f8f6f2] px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <h2
              id="hs-import-guide-detail-title"
              className="text-[15px] font-semibold text-[#1e2f4f]"
            >
              HS별 작성 가이드 상세
            </h2>
            <button
              type="button"
              className="rounded border border-stone-300 bg-white px-3 py-1 text-[12px] text-[#333] hover:bg-stone-50"
              onClick={onClose}
            >
              닫기
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          {loading ? (
            <p className="text-[13px] text-[#666]">상세 불러오는 중…</p>
          ) : detail ? (
            <>
              <ClipGridTable fixedLayout={false} minWidth="100%">
                <colgroup>
                  <col style={{ width: "18%" }} />
                  <col />
                </colgroup>
                <tbody>
                  <tr>
                    <th className={`${thClass} text-left`}>HS부호</th>
                    <ClipGridTd align="left" className="font-mono text-[13px]">
                      {detail.hs_code_display}
                    </ClipGridTd>
                  </tr>
                  <tr>
                    <th className={`${thClass} text-left`}>품명</th>
                    <ClipGridTd align="left" className="text-[13px]">
                      {detail.product_name}
                    </ClipGridTd>
                  </tr>
                </tbody>
              </ClipGridTable>

              <div className="mt-4">
              <ClipGridTable fixedLayout={false} minWidth="100%">
                <colgroup>
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "34%" }} />
                  <col style={{ width: "27%" }} />
                  <col style={{ width: "27%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <ClipGridTh>항목</ClipGridTh>
                    <ClipGridTh>작성요령</ClipGridTh>
                    <ClipGridTh>작성예시</ClipGridTh>
                    <ClipGridTh>오류예시</ClipGridTh>
                  </tr>
                </thead>
                <tbody>
                  {sections.map((section) => (
                    <tr key={section.label} className="align-top">
                      <th className={`${thClass} text-left align-top`}>
                        {section.label}
                      </th>
                      <ClipGridTd align="left" className="text-[13px]">
                        <GuideCell text={section.guidance} />
                      </ClipGridTd>
                      <ClipGridTd align="left" className="text-[13px]">
                        <GuideCell text={section.example} />
                      </ClipGridTd>
                      <ClipGridTd align="left" className="text-[13px]">
                        <GuideCell text={section.errorExample} />
                      </ClipGridTd>
                    </tr>
                  ))}
                </tbody>
              </ClipGridTable>
              </div>

              {detail.declaration_caution.trim() ? (
                <section className="mt-4">
                  <h3 className="mb-2 border-l-4 border-[#1e2f4f] pl-2 text-[13px] font-semibold text-[#1e2f4f]">
                    신고 유의사항
                  </h3>
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[#333]">
                    {detail.declaration_caution}
                  </p>
                </section>
              ) : null}
              {detail.special_material.trim() ? (
                <section className="mt-4">
                  <h3 className="mb-2 border-l-4 border-[#1e2f4f] pl-2 text-[13px] font-semibold text-[#1e2f4f]">
                    특이사항
                  </h3>
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[#333]">
                    {detail.special_material}
                  </p>
                </section>
              ) : null}
              {detail.remarks.trim() ? (
                <section className="mt-4">
                  <h3 className="mb-2 border-l-4 border-[#1e2f4f] pl-2 text-[13px] font-semibold text-[#1e2f4f]">
                    비고
                  </h3>
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[#333]">
                    {detail.remarks}
                  </p>
                </section>
              ) : null}
            </>
          ) : (
            <p className="text-[13px] text-[#666]">상세 정보가 없습니다.</p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-stone-200 bg-[#f8f6f2] px-4 py-3">
          <button
            type="button"
            className="rounded border border-stone-300 bg-white px-3 py-1.5 text-[12px] text-[#333] hover:bg-stone-50"
            onClick={() => {
              document
                .getElementById("hs-import-guide-detail-title")
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            TOP
          </button>
          <button
            type="button"
            className="rounded bg-[#1e2f4f] px-4 py-1.5 text-[12px] font-medium text-white hover:bg-[#16253d]"
            onClick={onClose}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
