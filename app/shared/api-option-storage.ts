export type ApiOptionConfig = {
  divisions: string[];
  categories: string[];
};

export const API_OPTION_STORAGE_KEY = "api-option-config";

// 기준: 국가법령정보 OPEN API 활용가이드 표의 구분(이미지 목록과 동일 순서)
export const DEFAULT_API_OPTION_CONFIG: ApiOptionConfig = {
  divisions: [
    "일반법령",
    "행정규칙",
    "판례·결정사례",
    "질의회신",
    "조약/협정",
    "별표/서식",
  ],
  // 기준: 활용가이드 표의 분류(이미지 목록과 동일 순서·구성)
  categories: [
    "관세관련",
    "무역관련",
    "외국환관련",
    "세관장확인관련",
    "통합공고관련",
    "내국세관련",
    "행정관련",
  ],
};

export const normalizeOptionConfig = (
  value: Partial<ApiOptionConfig> | null | undefined,
): ApiOptionConfig => {
  const normalizeArray = (arr: unknown, fallback: string[]) => {
    if (!Array.isArray(arr)) return fallback;

    const cleaned = arr
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);

    return cleaned.length > 0 ? Array.from(new Set(cleaned)) : fallback;
  };

  return {
    divisions: normalizeArray(value?.divisions, DEFAULT_API_OPTION_CONFIG.divisions),
    categories: normalizeArray(value?.categories, DEFAULT_API_OPTION_CONFIG.categories),
  };
};
