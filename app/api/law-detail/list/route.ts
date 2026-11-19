import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";
import { formatSupabaseClientError } from "@/app/lib/supabase/format-client-error";
import {
  mapVersionAndLawToDocument,
  parseLawPrimaryKeyRef,
  type LawRowForList,
  type LawVersionRowForList,
} from "@/app/lib/law-supabase-helpers";

/** 한 줄로 두어 Supabase PostgREST select 타입 추론이 깨지지 않게 함 */
const LAW_VERSION_COLUMNS =
  "id, law_id, version_key, promulgation_no, promulgation_date, enforcement_date, revision_type, article_effective_text, promulgated_law_yn, contact_phone, contact_department_name, is_current, raw_json, updated_at";

const LAWS_EMBED_COLUMNS =
  "id, law_id, law_key, law_name_kr, law_name_short, law_name_hanja, ministry_name, ministry_code";

const LAW_VERSIONS_WITH_LAWS_SELECT = `${LAW_VERSION_COLUMNS}, laws (${LAWS_EMBED_COLUMNS})`;

function mapEmbeddedRows(
  rows: Record<string, unknown>[],
): ReturnType<typeof mapVersionAndLawToDocument>[] {
  return rows.map((row) => {
    const law = row.laws as LawRowForList | LawRowForList[] | null | undefined;
    const L = Array.isArray(law) ? law[0] : law;
    const version = row as LawVersionRowForList & { laws?: unknown };
    const { laws: _nestedLaw, ...rest } = version;
    void _nestedLaw;
    return mapVersionAndLawToDocument(rest as LawVersionRowForList, L ?? null);
  });
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();

    const { data: embedded, error: embedError } = await supabase
      .from("law_versions")
      .select(LAW_VERSIONS_WITH_LAWS_SELECT)
      .eq("is_current", true)
      .order("id", { ascending: false });

    if (!embedError && Array.isArray(embedded)) {
      return NextResponse.json({
        ok: true,
        documents: mapEmbeddedRows(embedded as Record<string, unknown>[]),
      });
    }

    if (embedError) {
      console.warn(
        "law_versions+laws embed 조회 실패, FK 분리 조회로 대체:",
        embedError.message ?? String(embedError),
      );
    }

    const { data: soloVersions, error: vErr } = await supabase
      .from("law_versions")
      .select(LAW_VERSION_COLUMNS)
      .eq("is_current", true)
      .order("id", { ascending: false });

    if (vErr) {
      throw vErr;
    }

    const versions = (soloVersions ?? []) as LawVersionRowForList[];

    const lawIds = [
      ...new Set(
        versions
          .map((v) => parseLawPrimaryKeyRef(v.law_id))
          .filter((id): id is number => id !== null),
      ),
    ];

    const lawsById = new Map<number, LawRowForList>();

    if (lawIds.length > 0) {
      const { data: lawRows, error: lErr } = await supabase
        .from("laws")
        .select(LAWS_EMBED_COLUMNS)
        .in("id", lawIds);

      if (lErr) {
        throw lErr;
      }

      for (const L of lawRows ?? []) {
        const row = L as LawRowForList;
        lawsById.set(row.id, row);
      }
    }

    const documents = versions.map((row) => {
      const fk = parseLawPrimaryKeyRef(row.law_id);
      const law = fk != null ? lawsById.get(fk) ?? null : null;
      return mapVersionAndLawToDocument(row, law);
    });

    return NextResponse.json({
      ok: true,
      documents,
    });
  } catch (error) {
    const message = formatSupabaseClientError(error);

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 },
    );
  }
}
