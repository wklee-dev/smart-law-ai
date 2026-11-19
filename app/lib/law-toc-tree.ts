type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function normalizeObjectArray(value: unknown): JsonObject[] {
  if (Array.isArray(value)) {
    return value.filter(isJsonObject);
  }
  if (isJsonObject(value)) {
    return [value];
  }
  return [];
}

/** DB raw_json: 법령 객체 단일 저장 또는 { 법령: {...} } 래핑 모두 허용 */
function getLawRoot(rawJson: unknown): JsonObject | null {
  if (!isJsonObject(rawJson)) return null;
  if (rawJson["조문"] !== undefined || rawJson["기본정보"] !== undefined) {
    return rawJson;
  }
  const wrapped = rawJson["법령"];
  return isJsonObject(wrapped) ? wrapped : null;
}

/** law_articles 행과 호환되는 최소 필드 */
export type TocArticle = {
  id: number;
  article_no: string;
  article_title: string;
  article_order: number;
  article_content?: string;
  /** 조문단위.조문키 — raw_json 조문 배열과 인덱스가 어긋날 때 TOC 매칭용 */
  article_key?: string;
};

export type TocSectionNode = {
  kind: "section";
  id: string;
  title: string;
  article: TocArticle;
  articles: TocArticle[];
};

export type TocChapterNode = {
  kind: "chapter";
  id: string;
  title: string;
  article: TocArticle;
  sections: TocSectionNode[];
  looseArticles: TocArticle[];
};

export type LawTocModel = {
  looseArticles: TocArticle[];
  chapters: TocChapterNode[];
};

/** 전각 숫자·비공백 정규화 후 장/절 패턴 판별 */
function normalizeLawHeadingText(s: string): string {
  return s
    .replace(/\u00a0/g, " ")
    .replace(/[０-９]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30),
    )
    .trim();
}

export function isChapterTitle(title: string): boolean {
  const t = normalizeLawHeadingText(title ?? "");
  return /^제\s*\d+\s*장/.test(t);
}

export function isSectionTitle(title: string): boolean {
  const t = normalizeLawHeadingText(title ?? "");
  return /^제\s*\d+\s*절/.test(t);
}

/**
 * 한 줄에 "제N장 … 제M절 …"이 붙어 있는 국가법령 조문제목을 장/절로 분리한다.
 * (예: 제1장 총칙 <개정 …> 제1절 통칙 <개정 …>)
 */
export function splitCombinedChapterAndSectionHeading(
  full: string,
): { chapter: string; section: string } | null {
  const t = normalizeLawHeadingText(full ?? "");
  if (!t || !/^제\s*\d+\s*장/.test(t)) {
    return null;
  }
  const m = t.match(/제\s*\d+\s*절/);
  if (!m || m.index === undefined || m.index === 0) {
    return null;
  }
  const chapterPart = t.slice(0, m.index).trim();
  const sectionPart = t.slice(m.index).trim();
  if (!chapterPart || !sectionPart) {
    return null;
  }
  if (!isChapterTitle(chapterPart) || !isSectionTitle(sectionPart)) {
    return null;
  }
  return { chapter: chapterPart, section: sectionPart };
}

function firstNonEmptyLine(text: string): string {
  for (const line of (text ?? "").split(/\r?\n/)) {
    const s = line.replace(/\u00a0/g, " ").trim();
    if (s.length > 0) {
      return s;
    }
  }
  return "";
}

function flattenJoMunContentPreview(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(flattenJoMunContentPreview).filter(Boolean).join(" ");
  }
  if (isJsonObject(value)) {
    return Object.values(value)
      .map(flattenJoMunContentPreview)
      .filter(Boolean)
      .join(" ");
  }
  return "";
}

/**
 * 장/절 TOC용 제목. 조문제목이 비어 있거나 본문에만 '제N절 …'이 있는 국가법령 JSON에 대응한다.
 * law_structure_nodes 삽입·일반법령 조회 TOC가 동일한 규칙을 쓰도록 export.
 */
export function resolveHeadingTitleForToc(
  articleTitle: string,
  articleContent?: string,
): string {
  const t = (articleTitle ?? "").trim();
  if (isChapterTitle(t) || isSectionTitle(t)) {
    return t;
  }
  const firstLine = firstNonEmptyLine(articleContent ?? "");
  if (isChapterTitle(firstLine) || isSectionTitle(firstLine)) {
    return firstLine;
  }
  return t;
}

/**
 * law_versions.raw_json의 조문단위와 law_articles를 **조문키** 우선으로 매칭해 트리 구성.
 * (DB display_order와 JSON 배열 순서가 달라지면 인덱스-only 매칭은 제N조가 장/절에 잘못 붙음)
 * 제목은 조문단위.조문제목을 우선 사용.
 */
export function buildLawTocModelFromRawJson(
  rawJson: unknown,
  articles: TocArticle[],
): LawTocModel | null {
  const root = getLawRoot(rawJson);
  if (!root) return null;

  const articleWrapper = isJsonObject(root["조문"]) ? root["조문"] : null;
  if (!articleWrapper || !isJsonObject(articleWrapper)) return null;

  const units = normalizeObjectArray(articleWrapper["조문단위"]);
  if (units.length === 0) return null;

  const sorted = [...articles].sort(
    (a, b) => (a.article_order ?? 0) - (b.article_order ?? 0),
  );

  if (sorted.length === 0) return null;

  const byArticleKey = new Map<string, TocArticle>();
  for (const a of sorted) {
    const k = (a.article_key ?? "").trim();
    if (k && !byArticleKey.has(k)) {
      byArticleKey.set(k, a);
    }
  }

  const usedIds = new Set<number>();

  const pickArticleForUnit = (unit: JsonObject): TocArticle | null => {
    const key = getString(unit["조문키"]).trim();
    if (key) {
      const hit = byArticleKey.get(key);
      if (hit && !usedIds.has(hit.id)) {
        return hit;
      }
    }
    const next = sorted.find((x) => !usedIds.has(x.id));
    return next ?? null;
  };

  const looseArticles: TocArticle[] = [];
  const chapters: TocChapterNode[] = [];
  let curChapter: TocChapterNode | null = null;
  let curSection: TocSectionNode | null = null;

  for (const unit of units) {
    const a = pickArticleForUnit(unit);
    if (!a) {
      break;
    }
    usedIds.add(a.id);
    const titleFromUnit = getString(unit["조문제목"]);
    const titleBase = titleFromUnit || (a.article_title ?? "").trim();
    const contentHint =
      flattenJoMunContentPreview(unit["조문내용"]) || (a.article_content ?? "");
    const title = resolveHeadingTitleForToc(titleBase, contentHint);

    const combined = splitCombinedChapterAndSectionHeading(title);
    if (combined) {
      curChapter = {
        kind: "chapter",
        id: `ch-${a.id}`,
        title: combined.chapter,
        article: a,
        sections: [],
        looseArticles: [],
      };
      curSection = {
        kind: "section",
        id: `sec-${a.id}-1`,
        title: combined.section,
        article: a,
        articles: [],
      };
      curChapter.sections.push(curSection);
      chapters.push(curChapter);
      continue;
    }

    if (isChapterTitle(title)) {
      curChapter = {
        kind: "chapter",
        id: `ch-${a.id}`,
        title,
        article: a,
        sections: [],
        looseArticles: [],
      };
      curSection = null;
      chapters.push(curChapter);
      continue;
    }

    if (isSectionTitle(title)) {
      if (!curChapter) {
        curChapter = {
          kind: "chapter",
          id: `ch-orphan-${a.id}`,
          title: "조문",
          article: a,
          sections: [],
          looseArticles: [],
        };
        chapters.push(curChapter);
      }
      const sec: TocSectionNode = {
        kind: "section",
        id: `sec-${a.id}`,
        title,
        article: a,
        articles: [],
      };
      curChapter.sections.push(sec);
      curSection = sec;
      continue;
    }

    if (curSection && curChapter) {
      curSection.articles.push(a);
    } else if (curChapter) {
      curChapter.looseArticles.push(a);
    } else {
      looseArticles.push(a);
    }
  }

  for (const a of sorted) {
    if (!usedIds.has(a.id)) {
      looseArticles.push(a);
    }
  }

  return { looseArticles, chapters };
}

/** 원문 JSON 우선, 실패 시 조문제목 문자열 기반 분류 */
export function buildLawTocModelUnified(
  rawJson: unknown | null | undefined,
  articles: TocArticle[],
): LawTocModel {
  if (rawJson != null) {
    const fromRaw = buildLawTocModelFromRawJson(rawJson, articles);
    if (fromRaw) {
      return fromRaw;
    }
  }
  return buildLawTocModel(articles);
}

export function buildLawTocModel(articles: TocArticle[]): LawTocModel {
  const sorted = [...articles].sort(
    (a, b) => (a.article_order ?? 0) - (b.article_order ?? 0),
  );

  const looseArticles: TocArticle[] = [];
  const chapters: TocChapterNode[] = [];
  let curChapter: TocChapterNode | null = null;
  let curSection: TocSectionNode | null = null;

  for (const a of sorted) {
    const title = resolveHeadingTitleForToc(
      (a.article_title ?? "").trim(),
      a.article_content ?? "",
    );

    const combined = splitCombinedChapterAndSectionHeading(title);
    if (combined) {
      curChapter = {
        kind: "chapter",
        id: `ch-${a.id}`,
        title: combined.chapter,
        article: a,
        sections: [],
        looseArticles: [],
      };
      curSection = {
        kind: "section",
        id: `sec-${a.id}-1`,
        title: combined.section,
        article: a,
        articles: [],
      };
      curChapter.sections.push(curSection);
      chapters.push(curChapter);
      continue;
    }

    if (isChapterTitle(title)) {
      curChapter = {
        kind: "chapter",
        id: `ch-${a.id}`,
        title,
        article: a,
        sections: [],
        looseArticles: [],
      };
      curSection = null;
      chapters.push(curChapter);
      continue;
    }

    if (isSectionTitle(title)) {
      if (!curChapter) {
        curChapter = {
          kind: "chapter",
          id: `ch-orphan-${a.id}`,
          title: "조문",
          article: a,
          sections: [],
          looseArticles: [],
        };
        chapters.push(curChapter);
      }
      const sec: TocSectionNode = {
        kind: "section",
        id: `sec-${a.id}`,
        title,
        article: a,
        articles: [],
      };
      curChapter.sections.push(sec);
      curSection = sec;
      continue;
    }

    if (curSection && curChapter) {
      curSection.articles.push(a);
    } else if (curChapter) {
      curChapter.looseArticles.push(a);
    } else {
      looseArticles.push(a);
    }
  }

  return { looseArticles, chapters };
}

export function filterLawTocModel(
  model: LawTocModel,
  navKeyword: string,
  bodyActive: boolean,
  bodyIds: Set<number> | null,
  /** 조문내용이 비어 있어도 항·호·목 본문까지 조문명 검색에 포함 */
  articleItemSearchText?: Map<number, string> | null,
): LawTocModel {
  const navQ = navKeyword.trim().toLowerCase();
  const hasNav = navQ.length > 0;

  const leafMatch = (a: TocArticle) => {
    const itemBlob = articleItemSearchText?.get(a.id) ?? "";
    const navOk =
      !hasNav ||
      `${a.article_no} ${a.article_title} ${a.article_content ?? ""} ${itemBlob}`
        .toLowerCase()
        .includes(navQ);
    const bodyOk =
      !bodyActive || bodyIds === null || bodyIds.has(a.id);
    return navOk && bodyOk;
  };

  const headingMatch = (title: string) =>
    !hasNav || title.toLowerCase().includes(navQ);

  const filterSection = (sec: TocSectionNode): TocSectionNode | null => {
    const arts = sec.articles.filter(leafMatch);
    if (arts.length > 0) {
      return { ...sec, articles: arts };
    }
    if (headingMatch(sec.title) && !bodyActive) {
      return { ...sec, articles: [] };
    }
    return null;
  };

  const filterChapter = (ch: TocChapterNode): TocChapterNode | null => {
    const sections = ch.sections
      .map(filterSection)
      .filter((s): s is TocSectionNode => s !== null);
    const loose = ch.looseArticles.filter(leafMatch);
    const chHeading =
      headingMatch(ch.title) ||
      headingMatch(`${ch.article.article_no} ${ch.article.article_title}`);

    if (sections.length > 0 || loose.length > 0) {
      return { ...ch, sections, looseArticles: loose };
    }
    if (chHeading && !bodyActive) {
      return { ...ch, sections: [], looseArticles: [] };
    }
    return null;
  };

  const chapters = model.chapters
    .map(filterChapter)
    .filter((c): c is TocChapterNode => c !== null);

  const looseArticles = model.looseArticles.filter(leafMatch);

  return { looseArticles, chapters };
}

export function collectSectionIds(model: LawTocModel): string[] {
  const ids: string[] = [];
  for (const ch of model.chapters) {
    for (const sec of ch.sections) {
      ids.push(sec.id);
    }
  }
  return ids;
}

export function collectChapterIds(model: LawTocModel): string[] {
  return model.chapters.map((c) => c.id);
}
