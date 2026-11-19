/**
 * 국가법령정보 API **법령 본문 JSON(조문단위·항·호 트리)** 를 해석합니다.
 * 일반법령조회 화면은 DB에 저장된 조문 테이블을 보여 주고, 벡터 DB(law_chunks)는
 * 이 파서가 만든 **같은 법령의 청크 텍스트**를 임베딩한 것입니다. 구조가 “다른 두 법체계”가
 * 아니라, 화면은 요약·탐색용, RAG는 조·항 단위 청크용입니다.
 */

import { isDeletedLawParagraph } from "@/app/lib/law-paragraph-utils";

type JsonObject = Record<string, unknown>;

export type ParsedLawDetail = {
  document: {
    lawId: string;
    lawKey: string;
    lawNameKr: string;
    lawNameHanja: string;
    lawNameShort: string;
    promulgationNo: string;
    promulgationDate: string;
    enforcementDate: string;
    revisionType: string;
    language: string;
    lawTypeName: string;
    lawTypeCode: string;
    ministryName: string;
    ministryCode: string;
    contactPhone: string;
    contactDepartmentName: string;
    articleEffectiveText: string;
    promulgatedLawYn: string;
    rawJson: JsonObject;
  };
  articles: ParsedArticle[];
  chunks: ParsedChunk[];
};

export type ParsedArticle = {
  articleKey: string;
  articleNo: string;
  articleTitle: string;
  articleContent: string;
  articleType: string;
  articleRevisionType: string;
  articleEffectiveDate: string;
  articleChangedYn: string;
  articleMovedFrom: string;
  articleMovedTo: string;
  articleReference: string;
  articleOrder: number;
  rawJson: JsonObject;
  items: ParsedArticleItem[];
};

export type ParsedArticleItem = {
  itemLevel: "항" | "호" | "목";
  itemNo: string;
  itemContent: string;
  itemOrder: number;
  rawJson: JsonObject;
  children: ParsedArticleItem[];
};

export type ParsedChunk = {
  sourceType: "article" | "item" | "appendix" | "addendum" | "amendment" | "reason";
  sourceKey: string;
  sourceTitle: string;
  chunkText: string;
  chunkIndex: number;
  metadata: JsonObject;
};

export function parseLawDetailJson(raw: JsonObject): ParsedLawDetail {
  const root = getObject(raw["법령"]);
  if (!root) {
    throw new Error("최상위 '법령' 객체를 찾을 수 없습니다.");
  }

  const basicInfo = getObject(root["기본정보"]);
  if (!basicInfo) {
    throw new Error("'기본정보' 객체를 찾을 수 없습니다.");
  }

  const ministry = getObject(basicInfo["소관부처"]);
  const lawType = getObject(basicInfo["법종구분"]);
  const contactWrapper = getObject(basicInfo["연락부서"]);
  const contactUnit = contactWrapper
    ? getObject(contactWrapper["부서단위"])
    : null;

  const document = {
    lawId: getString(basicInfo["법령ID"]),
    lawKey: getString(root["법령키"]),
    lawNameKr: getString(basicInfo["법령명_한글"]),
    lawNameHanja: getString(basicInfo["법령명_한자"]),
    lawNameShort: getString(basicInfo["법령명약칭"]),
    promulgationNo: getString(basicInfo["공포번호"]),
    promulgationDate: getString(basicInfo["공포일자"]),
    enforcementDate: getString(basicInfo["시행일자"]),
    revisionType: getString(basicInfo["제개정구분"]),
    language: getString(basicInfo["언어"]),
    lawTypeName: lawType ? getString(lawType["content"]) : "",
    lawTypeCode: lawType ? getString(lawType["법종구분코드"]) : "",
    ministryName: ministry ? getString(ministry["content"]) : "",
    ministryCode: ministry ? getString(ministry["소관부처코드"]) : "",
    contactPhone: contactUnit ? getString(contactUnit["부서연락처"]) : getString(basicInfo["전화번호"]),
    contactDepartmentName: contactUnit ? getString(contactUnit["부서명"]) : "",
    articleEffectiveText: getString(basicInfo["조문시행일자문자열"]),
    promulgatedLawYn: getString(basicInfo["공포법령여부"]),
    rawJson: root,
  };

  if (!document.lawId) {
    throw new Error("기본정보.법령ID가 없습니다.");
  }

  const articleWrapper = getObject(root["조문"]);
  const articleUnits = articleWrapper ? normalizeObjectArray(articleWrapper["조문단위"]) : [];

  const articles = articleUnits.map((unit, index) => parseArticle(unit, index + 1));

  const chunks: ParsedChunk[] = [];

  for (const article of articles) {
    const articleLabel = article.articleNo ? `제${article.articleNo}조` : "";
    const flatArticleBody = toFlatText(article.articleContent);
    const articleText = cleanText(
      [document.lawNameKr, articleLabel, article.articleTitle, flatArticleBody]
        .filter(Boolean)
        .join(" "),
    );

    const skipArticleLevelChunk =
      isDeletedLawParagraph(flatArticleBody);

    if (articleText && !skipArticleLevelChunk) {
      chunks.push({
        sourceType: "article",
        sourceKey: article.articleKey,
        sourceTitle: `${articleLabel} ${article.articleTitle}`.trim(),
        chunkText: articleText,
        chunkIndex: 0,
        metadata: {
          law_id: document.lawId,
          law_name_kr: document.lawNameKr,
          article_no: article.articleNo,
          article_key: article.articleKey,
          article_type: article.articleType,
        },
      });
    }

    let itemChunkIndex = 1;
    for (const item of article.items) {
      const itemChunks = buildItemChunks(
        document.lawId,
        document.lawNameKr,
        article,
        item,
        itemChunkIndex,
      );
      chunks.push(...itemChunks);
      itemChunkIndex += itemChunks.length;
    }
  }

  const appendixWrapper = getObject(root["별표"]);
  const appendixUnit = appendixWrapper ? getObject(appendixWrapper["별표단위"]) : null;
  if (appendixUnit) {
    const appendixText = cleanText(
      [
        document.lawNameKr,
        getString(appendixUnit["별표구분"]),
        getString(appendixUnit["별표제목"]),
        toFlatText(appendixUnit["별표내용"]),
      ]
        .filter(Boolean)
        .join(" "),
    );

    if (appendixText) {
      chunks.push({
        sourceType: "appendix",
        sourceKey: getString(appendixUnit["별표키"]),
        sourceTitle: getString(appendixUnit["별표제목"]),
        chunkText: appendixText,
        chunkIndex: 0,
        metadata: {
          law_id: document.lawId,
          law_name_kr: document.lawNameKr,
          appendix_no: getString(appendixUnit["별표번호"]),
          appendix_sub_no: getString(appendixUnit["별표가지번호"]),
          appendix_type: getString(appendixUnit["별표구분"]),
        },
      });
    }
  }

  const addendumWrapper = getObject(root["부칙"]);
  const addendumUnits = addendumWrapper ? normalizeObjectArray(addendumWrapper["부칙단위"]) : [];
  for (let i = 0; i < addendumUnits.length; i += 1) {
    const unit = addendumUnits[i];
    const title = `부칙 ${getString(unit["부칙공포번호"])}`.trim();
    const text = cleanText([document.lawNameKr, title, toFlatText(unit["부칙내용"])].join(" "));
    if (text) {
      chunks.push({
        sourceType: "addendum",
        sourceKey: getString(unit["부칙키"]),
        sourceTitle: title,
        chunkText: text,
        chunkIndex: i,
        metadata: {
          law_id: document.lawId,
          law_name_kr: document.lawNameKr,
          promulgation_no: getString(unit["부칙공포번호"]),
          promulgation_date: getString(unit["부칙공포일자"]),
        },
      });
    }
  }

  const amendmentWrapper = getObject(root["개정문"]);
  if (amendmentWrapper) {
    const text = cleanText(
      [document.lawNameKr, "개정문", toFlatText(amendmentWrapper["개정문내용"])]
        .filter(Boolean)
        .join(" "),
    );

    if (text) {
      chunks.push({
        sourceType: "amendment",
        sourceKey: "amendment",
        sourceTitle: "개정문",
        chunkText: text,
        chunkIndex: 0,
        metadata: {
          law_id: document.lawId,
          law_name_kr: document.lawNameKr,
        },
      });
    }
  }

  const reasonWrapper = getObject(root["제개정이유"]);
  if (reasonWrapper) {
    const text = cleanText(
      [document.lawNameKr, "제개정이유", toFlatText(reasonWrapper["제개정이유내용"])]
        .filter(Boolean)
        .join(" "),
    );

    if (text) {
      chunks.push({
        sourceType: "reason",
        sourceKey: "reason",
        sourceTitle: "제개정이유",
        chunkText: text,
        chunkIndex: 0,
        metadata: {
          law_id: document.lawId,
          law_name_kr: document.lawNameKr,
        },
      });
    }
  }

  return {
    document,
    articles,
    chunks,
  };
}

function parseArticle(unit: JsonObject, order: number): ParsedArticle {
  const items: ParsedArticleItem[] = [];

  const hangCandidates = normalizeObjectArray(unit["항"]);
  if (hangCandidates.length > 0) {
    for (let i = 0; i < hangCandidates.length; i += 1) {
      items.push(parseHang(hangCandidates[i], i + 1));
    }
  } else {
    const hangObject = getObject(unit["항"]);
    if (hangObject) {
      items.push(parseHang(hangObject, 1));
    }
  }

  return {
    articleKey: getString(unit["조문키"]),
    articleNo: getString(unit["조문번호"]),
    articleTitle: getString(unit["조문제목"]),
    articleContent: toFlatText(unit["조문내용"]),
    articleType: getString(unit["조문여부"]),
    articleRevisionType: getString(unit["조문제개정유형"]),
    articleEffectiveDate: getString(unit["조문시행일자"]),
    articleChangedYn: getString(unit["조문변경여부"]),
    articleMovedFrom: getString(unit["조문이동이전"]),
    articleMovedTo: getString(unit["조문이동이후"]),
    articleReference: getString(unit["조문참고자료"]),
    articleOrder: order,
    rawJson: unit,
    items,
  };
}

function parseHang(unit: JsonObject, order: number): ParsedArticleItem {
  const childHos = normalizeObjectArray(unit["호"]).map((ho, index) => parseHo(ho, index + 1));

  return {
    itemLevel: "항",
    itemNo: getString(unit["항번호"]),
    itemContent: toFlatText(unit["항내용"]),
    itemOrder: order,
    rawJson: unit,
    children: childHos,
  };
}

function parseHo(unit: JsonObject, order: number): ParsedArticleItem {
  const childMoks = normalizeObjectArray(unit["목"]).map((mok, index) => parseMok(mok, index + 1));

  return {
    itemLevel: "호",
    itemNo: getString(unit["호번호"]),
    itemContent: toFlatText(unit["호내용"]),
    itemOrder: order,
    rawJson: unit,
    children: childMoks,
  };
}

function parseMok(unit: JsonObject, order: number): ParsedArticleItem {
  return {
    itemLevel: "목",
    itemNo: getString(unit["목번호"]),
    itemContent: toFlatText(unit["목내용"]),
    itemOrder: order,
    rawJson: unit,
    children: [],
  };
}

function buildItemChunks(
  lawId: string,
  lawNameKr: string,
  article: ParsedArticle,
  item: ParsedArticleItem,
  startIndex: number,
): ParsedChunk[] {
  if (isDeletedLawParagraph(item.itemContent)) {
    return [];
  }

  const chunks: ParsedChunk[] = [];
  const articleLabel = article.articleNo ? `제${article.articleNo}조` : "";
  const itemLabel = `${item.itemLevel}${item.itemNo}`.trim();

  const text = cleanText(
    [lawNameKr, articleLabel, article.articleTitle, itemLabel, item.itemContent]
      .filter(Boolean)
      .join(" "),
  );

  if (text) {
    chunks.push({
      sourceType: "item",
      sourceKey: `${article.articleKey}:${item.itemLevel}:${item.itemNo}`,
      sourceTitle: `${articleLabel} ${itemLabel}`.trim(),
      chunkText: text,
      chunkIndex: startIndex,
      metadata: {
        law_id: lawId,
        law_name_kr: lawNameKr,
        article_key: article.articleKey,
        article_no: article.articleNo,
        item_level: item.itemLevel,
        item_no: item.itemNo,
      },
    });
  }

  let nextIndex = startIndex + 1;
  for (const child of item.children) {
    const childChunks = buildItemChunks(lawId, lawNameKr, article, child, nextIndex);
    chunks.push(...childChunks);
    nextIndex += childChunks.length;
  }

  return chunks;
}

function normalizeObjectArray(value: unknown): JsonObject[] {
  if (Array.isArray(value)) {
    return value.filter(isObject) as JsonObject[];
  }
  if (isObject(value)) {
    return [value as JsonObject];
  }
  return [];
}

function getObject(value: unknown): JsonObject | null {
  return isObject(value) ? (value as JsonObject) : null;
}

function getString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function toFlatText(value: unknown): string {
  if (typeof value === "string") return cleanText(value);
  if (typeof value === "number") return String(value);

  if (Array.isArray(value)) {
    return cleanText(
      value
        .map((item) => toFlatText(item))
        .filter(Boolean)
        .join(" "),
    );
  }

  if (isObject(value)) {
    return cleanText(
      Object.values(value as JsonObject)
        .map((item) => toFlatText(item))
        .filter(Boolean)
        .join(" "),
    );
  }

  return "";
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}