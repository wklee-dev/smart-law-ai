"use client";

export const WORLD_HS_CLASSIFICATION_ARCHIVE_TABS = [
  { key: "tariff", label: "관세율표" },
  { key: "cases", label: "품목분류사례" },
  { key: "etc", label: "기타" },
] as const;

export type WorldHsClassificationArchiveTabKey =
  (typeof WORLD_HS_CLASSIFICATION_ARCHIVE_TABS)[number]["key"];

/** CLIP 품목분류 자료실 — 상단 구분 탭 */
export function WorldHsClassificationArchiveTabs({
  activeKey,
  onChange,
}: {
  activeKey: WorldHsClassificationArchiveTabKey;
  onChange: (key: WorldHsClassificationArchiveTabKey) => void;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-[#e5e9ef] bg-white shadow-sm">
      <div className="flex flex-wrap">
        {WORLD_HS_CLASSIFICATION_ARCHIVE_TABS.map((tab) => {
          const active = activeKey === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              className={`min-w-[7.5rem] flex-1 border-b-2 px-4 py-2.5 text-[13px] font-medium transition-colors sm:flex-none ${
                active
                  ? "border-[#1e2f4f] bg-[#f8fafc] text-[#1e2f4f]"
                  : "border-transparent text-[#666] hover:bg-[#fafafa] hover:text-[#333]"
              }`}
              onClick={() => onChange(tab.key)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
