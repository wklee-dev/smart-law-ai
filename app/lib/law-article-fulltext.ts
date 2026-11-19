import { itemLevelToDisplay } from "@/app/lib/law-article-db";
import {
  flattenLawArticleItemTree,
  type LawArticleItemRowInput,
} from "@/app/lib/law-article-items-tree";

type ItemRow = LawArticleItemRowInput & Record<string, unknown>;

function compact(s: string): string {
  return s.replace(/\s+/g, "");
}

/**
 * 조문 헤더와 동일한 `article_content`(제목만 저장된 경우)는 생략합니다.
 */
function articleBodyWorthShowing(header: string, articleContent: string): string {
  const body = articleContent.trim();
  if (!body) return "";
  if (compact(body) === compact(header)) return "";
  return body;
}

/**
 * `law_articles` + `law_article_items`를 일반법령조회와 같은 순서의 평문으로 만듭니다.
 */
export function buildLawArticlePlainText(
  articleNoDisplay: string | null,
  articleTitle: string | null,
  articleContent: string | null,
  items: ItemRow[],
): string {
  const no = (articleNoDisplay ?? "").trim();
  const title = (articleTitle ?? "").trim();
  const header =
    (no ? `제${no}조` : "조문") + (title ? `(${title})` : "");

  const parts: string[] = [header];

  const body = articleBodyWorthShowing(header, articleContent ?? "");
  if (body) parts.push(body);

  const normalized: ItemRow[] = items.map((row) => ({
    ...row,
    item_level: itemLevelToDisplay(String(row.item_level ?? "")),
  }));

  const rows = flattenLawArticleItemTree(normalized);
  for (const row of rows) {
    const content = (row.item_content ?? "").trim();
    const lab = [row.item_level, row.item_no].filter(Boolean).join(" ").trim();
    const indent = "  ".repeat(Math.max(0, row.depth));
    const line =
      `${indent}${lab ? `${lab} ` : ""}${content}`.trim();
    if (line) parts.push(line);
  }

  return parts.join("\n\n");
}
