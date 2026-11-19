import { formatLawSourceLine } from "@/app/lib/law-chat-context";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";

/** `metadata.law_name_kr`가 비어 있을 때 `laws` 테이블로 보강 */
export async function resolveLawNamesByLawIds(
  lawIds: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(lawIds.map((id) => id.trim()).filter(Boolean))];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("laws")
    .select("law_id, law_name_kr, law_name_short")
    .in("law_id", unique);

  if (error) {
    console.warn("resolveLawNamesByLawIds:", error.message);
    return map;
  }

  for (const row of data ?? []) {
    const id = row.law_id != null ? String(row.law_id).trim() : "";
    const nm =
      (typeof row.law_name_kr === "string" && row.law_name_kr.trim()) ||
      (typeof row.law_name_short === "string" && row.law_name_short.trim()) ||
      "";
    if (id && nm) map.set(id, nm);
  }
  return map;
}

export async function resolveLawNameKrForLawId(
  lawId: string | null | undefined,
): Promise<string | null> {
  const id = lawId?.trim();
  if (!id) return null;
  const m = await resolveLawNamesByLawIds([id]);
  return m.get(id) ?? null;
}

type SourceLike = {
  law_id?: string | null;
  law_name_kr?: string | null;
  source_title?: string | null;
  source_label?: string | null;
};

/** 채팅 출처 JSON에 `law_name_kr`·`source_label` 채움 (UI에 법령ID 노출 없이) */
export async function enrichChatSourcesWithLawNames<
  T extends SourceLike,
>(sources: T[]): Promise<T[]> {
  if (sources.length === 0) return sources;

  const needsIds = sources
    .filter((s) => !s.law_name_kr?.trim() && s.law_id?.trim())
    .map((s) => s.law_id!.trim());

  const nameMap =
    needsIds.length > 0
      ? await resolveLawNamesByLawIds(needsIds)
      : new Map<string, string>();

  return sources.map((s) => {
    const lid = s.law_id?.trim() ?? "";
    let name = s.law_name_kr?.trim() ?? "";
    if (!name && lid) name = nameMap.get(lid) ?? "";

    const meta: Record<string, unknown> = {
      law_name_kr: name || null,
      law_id: lid || null,
    };
    const source_label = formatLawSourceLine(
      name || lid ? meta : null,
      s.source_title ?? null,
    );

    return {
      ...s,
      law_name_kr: name || null,
      source_label,
    };
  });
}
