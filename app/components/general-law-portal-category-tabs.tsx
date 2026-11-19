"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  GENERAL_LAW_PORTAL_CATEGORIES,
  generalLawPortalEmbedHref,
  generalLawPortalHref,
  type GeneralLawPortalCategorySlug,
} from "@/app/shared/general-law-portal-categories";

export function GeneralLawPortalCategoryTabs({
  activeSlug,
  categoryLabel,
}: {
  activeSlug: GeneralLawPortalCategorySlug;
  categoryLabel: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEmbed = searchParams.get("embed") === "1";

  const handleSelect = (slug: GeneralLawPortalCategorySlug) => {
    if (slug === activeSlug) return;

    const href = generalLawPortalHref(slug);
    router.push(isEmbed ? generalLawPortalEmbedHref(slug) : href);
  };

  return (
    <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex flex-wrap items-center gap-1 border border-slate-300 bg-slate-100 p-0.5">
        {GENERAL_LAW_PORTAL_CATEGORIES.map((item) => {
          const active = item.slug === activeSlug;
          return (
            <button
              key={item.slug}
              type="button"
              onClick={() => handleSelect(item.slug)}
              className={`min-w-[4.5rem] rounded px-3 py-1.5 text-sm font-medium transition ${
                active
                  ? "bg-[#1e2f4f] text-white shadow-sm"
                  : "bg-transparent text-slate-800 hover:bg-white"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Home &gt; 법령·판례 등 &gt; 일반법령 &gt; {categoryLabel}
      </p>
    </div>
  );
}
