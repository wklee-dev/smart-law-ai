import { redirect } from "next/navigation";

/** 예전 `/…/[caseId]` 링크 → `?caseId=` (탭·embed 유지) */
export default async function WorldHsClassificationCaseLegacyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ caseId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { caseId } = await params;
  const raw = await searchParams;
  const u = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const v of value) u.append(key, v);
    } else {
      u.set(key, value);
    }
  }
  u.set("caseId", caseId.trim());
  redirect(`/item-classification/world-hs-classification-cases?${u.toString()}`);
}
