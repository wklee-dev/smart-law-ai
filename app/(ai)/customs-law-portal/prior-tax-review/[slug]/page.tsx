import { notFound } from "next/navigation";
import { PriorTaxReviewView } from "@/app/(ai)/customs-law-portal/prior-tax-review/prior-tax-review-view";
import { CLIP_PRIOR_TAX_REVIEW_BY_SLUG } from "@/app/lib/clip-prior-tax-review-items";

export default async function ClipPriorTaxReviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const item = CLIP_PRIOR_TAX_REVIEW_BY_SLUG[slug];
  if (!item) notFound();

  return <PriorTaxReviewView item={item} />;
}
