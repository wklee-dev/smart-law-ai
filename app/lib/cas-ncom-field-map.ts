/** Gateway V1.6/V1.4 — Hanjoo_/Ehanjoo_ XML 요소명 → 내부 그리드 key (legacy impo/expo) */

/** Gateway XmlNameConverter는 HanjooLan_* → hanjoolan*(전부 소문자) 형태로 내려올 수 있음 */
function stripXmlPrefix(name: string, prefix: string): string | null {
  if (name.length < prefix.length) return null;
  if (name.slice(0, prefix.length).toLowerCase() !== prefix.toLowerCase()) {
    return null;
  }
  return name.slice(prefix.length);
}

export function normalizeImportXmlFieldName(name: string): string {
  const trimmed = name.trim();
  const fromPum = stripXmlPrefix(trimmed, "hanjooPum");
  if (fromPum != null && fromPum.length > 0) return `impum${fromPum}`;
  const fromLan = stripXmlPrefix(trimmed, "hanjooLan");
  if (fromLan != null) {
    return fromLan.length > 0 ? `imlan${fromLan}` : "impoLan";
  }
  const fromImpo = stripXmlPrefix(trimmed, "hanjoo");
  if (fromImpo != null) return `impo${fromImpo}`;
  return trimmed;
}

export function normalizeExportXmlFieldName(name: string): string {
  const trimmed = name.trim();
  const fromPum = stripXmlPrefix(trimmed, "ehanjooPum");
  if (fromPum != null && fromPum.length > 0) return `expum${fromPum}`;
  const fromLan = stripXmlPrefix(trimmed, "ehanjooLan");
  if (fromLan != null) {
    return fromLan.length > 0 ? `exlan${fromLan}` : "expoLan";
  }
  const fromExpo = stripXmlPrefix(trimmed, "ehanjoo");
  if (fromExpo != null) return `expo${fromExpo}`;
  return trimmed;
}

function snakeToCamelSuffix(snake: string): string {
  return snake
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("");
}

/** Hanjoo_* fieldKey → 내부 그리드 key */
export function fieldKeyToImportKey(fieldKey: string): string {
  if (fieldKey.startsWith("HanjooPum_")) {
    return `impum${snakeToCamelSuffix(fieldKey.slice("HanjooPum_".length))}`;
  }
  if (fieldKey.startsWith("HanjooLan_")) {
    return `imlan${snakeToCamelSuffix(fieldKey.slice("HanjooLan_".length))}`;
  }
  if (fieldKey.startsWith("Hanjoo_")) {
    return `impo${snakeToCamelSuffix(fieldKey.slice("Hanjoo_".length))}`;
  }
  return fieldKey;
}

/** Ehanjoo_* fieldKey → 내부 그리드 key */
export function fieldKeyToExportKey(fieldKey: string): string {
  if (fieldKey.startsWith("EhanjooPum_")) {
    return `expum${snakeToCamelSuffix(fieldKey.slice("EhanjooPum_".length))}`;
  }
  if (fieldKey.startsWith("EhanjooLan_")) {
    return `exlan${snakeToCamelSuffix(fieldKey.slice("EhanjooLan_".length))}`;
  }
  if (fieldKey.startsWith("Ehanjoo_")) {
    return `expo${snakeToCamelSuffix(fieldKey.slice("Ehanjoo_".length))}`;
  }
  return fieldKey;
}

export function normalizeImportFieldMap(
  raw: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw)) {
    const key = normalizeImportXmlFieldName(name);
    if (!(key in out) || out[key] === "") {
      out[key] = value;
    }
  }
  return out;
}

export function normalizeExportFieldMap(
  raw: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw)) {
    const key = normalizeExportXmlFieldName(name);
    if (!(key in out) || out[key] === "") {
      out[key] = value;
    }
  }
  return out;
}
