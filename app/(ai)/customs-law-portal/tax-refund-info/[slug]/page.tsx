import { notFound } from "next/navigation";
import { TaxRefundContentView } from "@/app/(ai)/customs-law-portal/tax-refund-info/tax-refund-content-view";
import { ClipTaxRefundPlaceholder } from "@/app/(ai)/customs-law-portal/tax-refund-info/clip-tax-refund-placeholder";
import { CLIP_TAX_REFUND_INFO_BY_SLUG } from "@/app/lib/clip-tax-refund-info-items";

export default async function ClipTaxRefundInfoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const item = CLIP_TAX_REFUND_INFO_BY_SLUG[slug];
  if (!item) notFound();
  if (item.dedicatedPage) notFound();

  if (item.ntxSection || item.ntxTabs?.length) {
    return <TaxRefundContentView item={item} />;
  }

  return <ClipTaxRefundPlaceholder item={item} />;
}
