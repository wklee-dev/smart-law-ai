import { notFound } from "next/navigation";
import TradeGuidelinesView from "@/app/(ai)/cl-site/trade-guidelines/trade-guidelines-view";
import { ClipClearanceContentView } from "@/app/(ai)/customs-law-portal/clearance-info/clip-clearance-content-view";
import { ClipClearancePlaceholder } from "@/app/(ai)/customs-law-portal/clearance-info/clip-clearance-placeholder";
import ImportExportNoticeView from "@/app/(ai)/customs-law-portal/clearance-info/import-export-notice/import-export-notice-view";
import IntegratedNoticeView from "@/app/(ai)/customs-law-portal/clearance-info/integrated-notice/integrated-notice-view";
import HsImportGuideView from "@/app/(ai)/customs-law-portal/clearance-info/hs-import-guide/hs-import-guide-view";
import OriginCriteriaView from "@/app/(ai)/customs-law-portal/clearance-info/origin/origin-criteria-view";
import {
  CLIP_CLEARANCE_INFO_BY_SLUG,
} from "@/app/lib/clip-clearance-info-items";
import { isClipClearanceContentSlug } from "@/app/lib/clip-clearance-content-shared";

export default async function ClipClearanceInfoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const item = CLIP_CLEARANCE_INFO_BY_SLUG[slug];
  if (!item) notFound();

  if (slug === "integrated-notice") {
    return <IntegratedNoticeView />;
  }
  if (slug === "import-export-notice") {
    return <ImportExportNoticeView />;
  }
  if (slug === "origin") {
    return <OriginCriteriaView layout="clip" />;
  }
  if (slug === "hs-import-guide") {
    return <HsImportGuideView />;
  }
  if (isClipClearanceContentSlug(slug)) {
    return <ClipClearanceContentView slug={slug} title={item.label} />;
  }

  if (item.cielTitle) {
    return (
      <TradeGuidelinesView
        initialTitle={item.cielTitle}
        portalItemLabel={item.label}
      />
    );
  }

  return <ClipClearancePlaceholder item={item} />;
}
