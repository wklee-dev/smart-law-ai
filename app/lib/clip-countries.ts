import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export type ClipCountry = { code: string; name: string };

const DEFAULT_COUNTRIES_JSON_PATH = "C:\\SQLiteDB\\countries.json";

/**
 * 관세법령정보포털(CLIP) 스타일 국가 코드 목록.
 * 기본: `DEFAULT_COUNTRIES_JSON_PATH` — `COUNTRIES_JSON_PATH`로 재정의 가능.
 *
 * 화면 표시 순서는 이 함수가 반환하는 **배열 순서**(JSON 파일의 `countries[]` 나열 순)를 따릅니다.
 * 별도의 `order` 숫자 필드는 없으며, 순서를 바꾸려면 JSON에서 항목 순서를 바꾸면 됩니다.
 */
export function loadCountriesFromClipJson(): ClipCountry[] {
  const envPath = process.env.COUNTRIES_JSON_PATH?.trim();
  const filePath =
    envPath && envPath.length > 0
      ? resolve(envPath)
      : resolve(DEFAULT_COUNTRIES_JSON_PATH);

  try {
    if (!existsSync(filePath)) return [];
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as { countries?: unknown };
    if (!Array.isArray(parsed.countries)) return [];

    const out: ClipCountry[] = [];
    for (const item of parsed.countries) {
      if (
        item &&
        typeof item === "object" &&
        "code" in item &&
        "name" in item &&
        typeof (item as ClipCountry).code === "string" &&
        typeof (item as ClipCountry).name === "string"
      ) {
        const code = (item as ClipCountry).code.trim().toUpperCase();
        const name = (item as ClipCountry).name.trim();
        if (code && name) out.push({ code, name });
      }
    }
    return out;
  } catch {
    return [];
  }
}
