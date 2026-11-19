"use client";

import {
  CasCard,
  CasPageHeader,
  CasPageShell,
} from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import type { ClipPriorTaxReviewItem } from "@/app/lib/clip-prior-tax-review-items";

export function ClipPriorTaxReviewPlaceholder({
  item,
}: {
  item: ClipPriorTaxReviewItem;
}) {
  return (
    <CasPageShell>
      <CasPageHeader title={item.label} />
      <CasCard title="준비 중">
        <p className="text-[13px] leading-relaxed text-[#666]">
          CLIP 사전세액심사 「{item.label}」 화면은 데이터 수집·연동 작업
          중입니다.
        </p>
      </CasCard>
    </CasPageShell>
  );
}
