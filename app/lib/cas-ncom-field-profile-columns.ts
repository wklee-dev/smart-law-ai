import {
  fieldKeyToExportKey,
  fieldKeyToImportKey,
  normalizeExportXmlFieldName,
  normalizeImportXmlFieldName,
} from "@/app/lib/cas-ncom-field-map";
import type {
  NcomFieldProfileApi,
  UserFieldProfile,
  UserFieldProfileField,
} from "@/app/lib/cas-ncom-user-field-profile-server";
import {
  EXPORT_PERFORMANCE_COLUMNS,
  type ExportPerformanceColumn,
} from "@/app/lib/cas-ncom-export-performance-columns";
import {
  IMPORT_PERFORMANCE_COLUMNS,
  type ImportPerformanceColumn,
} from "@/app/lib/cas-ncom-import-performance-columns";
import importGuideLabels from "@/app/lib/cas-ncom-import-guide-labels.json";
import exportGuideLabels from "@/app/lib/cas-ncom-export-guide-labels.json";

const IMPORT_GUIDE_LABELS = importGuideLabels as Record<string, string>;
const EXPORT_GUIDE_LABELS = exportGuideLabels as Record<string, string>;

const IMPORT_LABEL_MAP = new Map(
  IMPORT_PERFORMANCE_COLUMNS.map((col) => [col.key, col.label]),
);
const EXPORT_LABEL_MAP = new Map(
  EXPORT_PERFORMANCE_COLUMNS.map((col) => [col.key, col.label]),
);

export function formatProfileLevelTabLabel(
  levelName: string,
  tableNm: string,
): string {
  const tm = tableNm.toUpperCase();
  if (tm === "IMPO1" || tm === "EXPO1") return "공통항목";
  if (tm === "IMPO2" || tm === "EXPO2") return "란 항목";
  if (tm === "IMPO3" || tm === "EXPO3") return "모델규격";
  return levelName.replace(/\s*\((?:IMPO|EXPO)[123]\)\s*/gi, "").trim() || "항목";
}

function internalKeysForField(
  api: NcomFieldProfileApi,
  field: Pick<UserFieldProfileField, "fieldKey" | "xmlName">,
): string[] {
  const keys: string[] = [];
  const fromFieldKey =
    api === "ncomSearchExpoQry"
      ? fieldKeyToExportKey(field.fieldKey)
      : fieldKeyToImportKey(field.fieldKey);
  if (fromFieldKey) keys.push(fromFieldKey);
  if (field.xmlName) {
    const fromXml =
      api === "ncomSearchExpoQry"
        ? normalizeExportXmlFieldName(field.xmlName)
        : normalizeImportXmlFieldName(field.xmlName);
    if (fromXml && !keys.includes(fromXml)) keys.push(fromXml);
  }
  return keys;
}

function isTechnicalLabel(label?: string): boolean {
  if (!label?.trim()) return true;
  if (/^[A-Z0-9_]{2,}$/.test(label.trim())) return true;
  return /hanjoo|ehanjoo|impo|expo|imlan|impum|exlan|expum|_/i.test(label);
}

function hasHangul(label: string): boolean {
  return /[\uac00-\ud7a3]/.test(label);
}

/** API 가이드(V1.7/V1.6) XML 응답 구조 — 항목명(국문)이 있는 필드만 */
function resolveGuideFieldLabel(
  api: NcomFieldProfileApi,
  field: Pick<UserFieldProfileField, "fieldKey" | "xmlName">,
): string | undefined {
  const guideLabels =
    api === "ncomSearchExpoQry" ? EXPORT_GUIDE_LABELS : IMPORT_GUIDE_LABELS;

  for (const key of internalKeysForField(api, field)) {
    const mapped = guideLabels[key];
    if (mapped && hasHangul(mapped) && !isTechnicalLabel(mapped)) {
      return mapped;
    }
  }
  return undefined;
}

export function isConfigurableProfileField(
  api: NcomFieldProfileApi,
  field: Pick<UserFieldProfileField, "fieldKey" | "xmlName" | "label">,
): boolean {
  return resolveGuideFieldLabel(api, field) != null;
}

export function filterConfigurableProfile(
  profile: UserFieldProfile,
  api: NcomFieldProfileApi,
): UserFieldProfile {
  return {
    ...profile,
    levels: profile.levels.map((level) => ({
      ...level,
      fields: level.fields.filter((f) => isConfigurableProfileField(api, f)),
    })),
  };
}

export function resolveFieldDisplayLabel(
  api: NcomFieldProfileApi,
  field: Pick<UserFieldProfileField, "fieldKey" | "xmlName" | "label">,
): string {
  const fromGuide = resolveGuideFieldLabel(api, field);
  if (fromGuide) return fromGuide;

  const labelMap =
    api === "ncomSearchExpoQry" ? EXPORT_LABEL_MAP : IMPORT_LABEL_MAP;
  for (const key of internalKeysForField(api, field)) {
    const mapped = labelMap.get(key);
    if (mapped && hasHangul(mapped) && !isTechnicalLabel(mapped)) return mapped;
  }

  const safeLabel = isTechnicalLabel(field.label) ? undefined : field.label;
  if (safeLabel && hasHangul(safeLabel)) return safeLabel;

  return "항목";
}

function defaultWidth(key: string, label: string): string | undefined {
  if (key.endsWith("Date") || key.endsWith("Dt")) return "92px";
  if (key === "impoSingoNo" || key === "expoSingoNo") return "148px";
  if (key === "imlanHs" || key === "exlanHs") return "96px";
  if (key.endsWith("Amt") || key.endsWith("Tax") || key.endsWith("Won")) {
    return "96px";
  }
  if (label.length >= 8) return "120px";
  if (label.length >= 5) return "88px";
  return "72px";
}

export function buildImportColumnsFromProfile(
  profile: UserFieldProfile,
): ImportPerformanceColumn[] {
  const templateMap = new Map(
    IMPORT_PERFORMANCE_COLUMNS.map((col) => [col.key, col]),
  );
  const cols: ImportPerformanceColumn[] = [];
  let idx = 0;

  for (const level of profile.levels) {
    for (const field of level.fields) {
      if (!field.selected) continue;
      if (!isConfigurableProfileField("ncomSearchQry", field)) continue;
      const key = internalKeysForField("ncomSearchQry", field)[0];
      if (!key) continue;
      const template = templateMap.get(key);
      const label = resolveFieldDisplayLabel("ncomSearchQry", field);
      cols.push({
        id: `col-${idx++}`,
        key,
        label,
        width: template?.width ?? defaultWidth(key, label),
        align: template?.align,
        mono: template?.mono,
      });
    }
  }

  return cols;
}

export function buildExportColumnsFromProfile(
  profile: UserFieldProfile,
): ExportPerformanceColumn[] {
  const templateMap = new Map(
    EXPORT_PERFORMANCE_COLUMNS.map((col) => [col.key, col]),
  );
  const cols: ExportPerformanceColumn[] = [];
  let idx = 0;

  for (const level of profile.levels) {
    for (const field of level.fields) {
      if (!field.selected) continue;
      if (!isConfigurableProfileField("ncomSearchExpoQry", field)) continue;
      const key = internalKeysForField("ncomSearchExpoQry", field)[0];
      if (!key) continue;
      const template = templateMap.get(key);
      const label = resolveFieldDisplayLabel("ncomSearchExpoQry", field);
      cols.push({
        id: `col-${idx++}`,
        key,
        label,
        width: template?.width ?? defaultWidth(key, label),
        align: template?.align,
        mono: template?.mono,
      });
    }
  }

  return cols;
}

export function profileSavePayload(
  profile: UserFieldProfile,
): {
  apiNm: "ncomSearchQry" | "ncomSearchExpoQry";
  levels: Array<{ level: string; fieldKeys: string[] }>;
} {
  const apiNmResolved =
    profile.levels[0]?.tableNm.startsWith("EXPO") ||
    profile.levels.some((l) => l.tableNm.startsWith("EXPO"))
      ? "ncomSearchExpoQry"
      : "ncomSearchQry";

  const levels = profile.levels.map((level) => ({
    level: level.tableNm,
    fieldKeys: level.fields
      .filter(
        (f) =>
          f.selected && isConfigurableProfileField(apiNmResolved, f),
      )
      .map((f) => f.fieldKey),
  }));

  return { apiNm: apiNmResolved, levels };
}
