import { splitBodyIntoChunks } from "@/app/lib/hs-chunk-text";

export type TariffSourceLevel = "section" | "chapter" | "heading" | "item";

export type TariffChunkRowInput = {
  sqliteId: number;
  recordUuid: string | null;
  year: number;
  countryCode: string;
  countryName: string | null;
  sourceLevel: TariffSourceLevel;
  sourceKey: string;
  sourceTitle: string;
  body: string;
  metadata: Record<string, unknown>;
};

function trimOrEmpty(v: string | null | undefined): string {
  return (v ?? "").trim();
}

function joinLines(lines: (string | null | undefined)[]): string {
  return lines.filter((l) => l && String(l).trim()).join("\n");
}

export function buildTariffChunkHeader(
  year: number,
  countryCode: string,
  countryName: string | null,
  sourceLevel: TariffSourceLevel,
  sourceKey: string,
  sourceTitle: string,
): string {
  const levelKo =
    sourceLevel === "section"
      ? "부"
      : sourceLevel === "chapter"
        ? "류"
        : sourceLevel === "heading"
          ? "호"
          : "세번";
  return joinLines([
    `[관세율표] 연도:${year} 국가:${countryCode}${countryName ? `(${countryName})` : ""} 구분:${levelKo} 코드:${sourceKey}`,
    sourceTitle ? `제목: ${sourceTitle.slice(0, 300)}` : null,
  ]);
}

export function buildFullTariffChunkText(
  year: number,
  countryCode: string,
  countryName: string | null,
  sourceLevel: TariffSourceLevel,
  sourceKey: string,
  sourceTitle: string,
  body: string,
): string {
  const header = buildTariffChunkHeader(
    year,
    countryCode,
    countryName,
    sourceLevel,
    sourceKey,
    sourceTitle,
  );
  const trimmed = body.trim();
  if (!trimmed) return "";
  return `${header}\n---\n${trimmed}`;
}

export function bodyFromEmbedOrFields(
  embedText: string | null | undefined,
  fallback: string | (string | null | undefined)[],
): string {
  const embed = trimOrEmpty(embedText);
  if (embed) return embed;
  if (typeof fallback === "string") return fallback.trim();
  return joinLines(fallback);
}

export function expandTariffRowToChunks(
  input: TariffChunkRowInput,
): { chunk_text: string; chunk_index: number; metadata: Record<string, unknown> }[] {
  const parts = splitBodyIntoChunks(input.body);
  const out: {
    chunk_text: string;
    chunk_index: number;
    metadata: Record<string, unknown>;
  }[] = [];

  for (let chunkIndex = 0; chunkIndex < parts.length; chunkIndex += 1) {
    const chunkText = buildFullTariffChunkText(
      input.year,
      input.countryCode,
      input.countryName,
      input.sourceLevel,
      input.sourceKey,
      input.sourceTitle,
      parts[chunkIndex] ?? "",
    );
    if (!chunkText.trim()) continue;
    out.push({
      chunk_text: chunkText,
      chunk_index: chunkIndex,
      metadata: {
        ...input.metadata,
        chunk_part: parts.length > 1 ? chunkIndex + 1 : null,
        chunk_parts: parts.length > 1 ? parts.length : null,
      },
    });
  }
  return out;
}

export function sectionFallbackBody(row: {
  section_name: string;
  section_name_en?: string | null;
  note_text?: string | null;
}): string {
  return joinLines([
    row.section_name,
    row.section_name_en ? `EN: ${row.section_name_en}` : null,
    row.note_text ? `주: ${row.note_text}` : null,
  ]);
}

export function chapterFallbackBody(row: {
  section_code: string;
  chapter_code: string;
  chapter_name: string;
  chapter_name_en?: string | null;
  note_text?: string | null;
}): string {
  return joinLines([
    `부 ${row.section_code} · 류 ${row.chapter_code}`,
    row.chapter_name,
    row.chapter_name_en ? `EN: ${row.chapter_name_en}` : null,
    row.note_text ? `주: ${row.note_text}` : null,
  ]);
}

export function headingFallbackBody(row: {
  section_code: string;
  chapter_code: string;
  heading_code: string;
  heading_name: string;
  heading_name_en?: string | null;
  note_text?: string | null;
}): string {
  return joinLines([
    `부 ${row.section_code} · 류 ${row.chapter_code} · 호 ${row.heading_code}`,
    row.heading_name,
    row.heading_name_en ? `EN: ${row.heading_name_en}` : null,
    row.note_text ? `주: ${row.note_text}` : null,
  ]);
}

export function itemFallbackBody(row: {
  hs_code: string;
  item_name: string;
  item_name_en?: string | null;
  unit?: string | null;
  basic_rate?: string | null;
  elastic_rate?: string | null;
  fta_rate?: string | null;
  temp_rate?: string | null;
  special_rate?: string | null;
  import_notice?: string | null;
}): string {
  return joinLines([
    `세번: ${row.hs_code}`,
    row.item_name,
    row.item_name_en ? `EN: ${row.item_name_en}` : null,
    row.unit ? `단위: ${row.unit}` : null,
    row.basic_rate ? `기본세율: ${row.basic_rate}` : null,
    row.elastic_rate ? `탄력세율: ${row.elastic_rate}` : null,
    row.fta_rate ? `FTA: ${row.fta_rate}` : null,
    row.temp_rate ? `잠정: ${row.temp_rate}` : null,
    row.special_rate ? `특별: ${row.special_rate}` : null,
    row.import_notice ? `수입공고: ${row.import_notice}` : null,
  ]);
}
