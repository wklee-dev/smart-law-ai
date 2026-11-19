import type { ApiManagementListItem } from "@/app/shared/api-management-list";
import { prepareApiManagementList } from "@/app/shared/api-management-list";
import { fetchLawIdForApiName, sleep } from "@/app/lib/law-eflaw-fetch-one";

export type BatchLawIdRowResult = {
  id: string;
  apiName: string;
  status: "updated" | "skipped" | "failed";
  lawId?: string;
  lawShortName?: string;
  error?: string;
};

export type BatchLawIdSummary = {
  totalCandidates: number;
  updated: number;
  failed: number;
  skipped: number;
  results: BatchLawIdRowResult[];
};

const GENERAL_LAW_DIVISION = "일반법령";

export function isGeneralLawWithoutId(item: ApiManagementListItem): boolean {
  return (
    item.division.trim() === GENERAL_LAW_DIVISION &&
    !item.lawId.trim()
  );
}

export function countGeneralLawWithoutId(items: ApiManagementListItem[]): number {
  return items.filter(isGeneralLawWithoutId).length;
}

export async function batchFetchLawIdsForGeneralLaws(
  items: ApiManagementListItem[],
  opts?: {
    delayMs?: number;
    limit?: number;
  },
): Promise<{ items: ApiManagementListItem[]; summary: BatchLawIdSummary }> {
  const delayMs = opts?.delayMs ?? 400;
  const candidates = items.filter(isGeneralLawWithoutId);
  const toProcess =
    opts?.limit != null && opts.limit > 0
      ? candidates.slice(0, opts.limit)
      : candidates;

  const results: BatchLawIdRowResult[] = [];
  let updated = 0;
  let failed = 0;

  const byId = new Map(items.map((i) => [i.id, { ...i }]));

  for (let i = 0; i < toProcess.length; i += 1) {
    const row = toProcess[i]!;
    const r = await fetchLawIdForApiName(row.apiName);

    if (r.ok) {
      const current = byId.get(row.id);
      if (current) {
        current.lawId = r.hit.lawId;
        current.lawShortName = r.hit.lawShortName;
        byId.set(row.id, current);
      }
      updated += 1;
      results.push({
        id: row.id,
        apiName: row.apiName,
        status: "updated",
        lawId: r.hit.lawId,
        lawShortName: r.hit.lawShortName,
      });
    } else {
      failed += 1;
      results.push({
        id: row.id,
        apiName: row.apiName,
        status: "failed",
        error: r.error,
      });
    }

    if (i < toProcess.length - 1 && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  const nextItems = prepareApiManagementList(
    items.map((item) => byId.get(item.id) ?? item),
  );

  const skipped = candidates.length - toProcess.length;

  return {
    items: nextItems,
    summary: {
      totalCandidates: candidates.length,
      updated,
      failed,
      skipped,
      results,
    },
  };
}
