"use client";

import { useParams } from "next/navigation";
import { CasPageHeader } from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import { GeneralLawPortalCategoryTabs } from "@/app/components/general-law-portal-category-tabs";
import { GeneralLawPortalRawView } from "@/app/components/general-law-portal-raw-view";
import {
  generalLawPortalCategoryLabel,
  parseGeneralLawPortalCategory,
} from "@/app/shared/general-law-portal-categories";

export default function CustomsLawPortalGeneralLawsPage() {
  const params = useParams();
  const segment = Array.isArray(params.category)
    ? params.category[0]
    : undefined;
  const categorySlug = parseGeneralLawPortalCategory(segment);
  const categoryLabel = generalLawPortalCategoryLabel(categorySlug);

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-100">
      <header className="shrink-0 px-4 py-3 sm:px-6">
        <CasPageHeader
          title={
            categorySlug === "all"
              ? "일반법령"
              : `일반법령 (${categoryLabel})`
          }
        />
      </header>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <GeneralLawPortalCategoryTabs
          activeSlug={categorySlug}
          categoryLabel={categoryLabel}
        />
        <GeneralLawPortalRawView
          categorySlug={categorySlug}
          categoryLabel={categoryLabel}
        />
      </div>
    </div>
  );
}
