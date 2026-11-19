/**
 * law_structure_nodes: 법령 버전별 장/절(TOC) 노드.
 * 스키마: parent_id, node_type(CHAPTER|SECTION|…), node_no, node_title, full_title, depth 등.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedArticle } from "@/app/lib/law-detail-parser";
import {
  isChapterTitle,
  isSectionTitle,
  resolveHeadingTitleForToc,
  splitCombinedChapterAndSectionHeading,
} from "@/app/lib/law-toc-tree";

export const ORPHAN_CHAPTER_TITLE = "조문";

/** DB law_structure_nodes insert 페이로드 ( CHECK: node_type 대문자 ) */
export type LawStructureNodeInsert = {
  law_version_id: number;
  parent_id: number | null;
  node_type: "CHAPTER" | "SECTION";
  node_no: string | null;
  node_title: string;
  full_title: string;
  display_order: number;
  depth: number;
  article_no: string | null;
  article_key: string | null;
  raw_json: Record<string, unknown>;
};

function normalizeDigitsAndNbsp(s: string): string {
  return s
    .replace(/\u00a0/g, " ")
    .replace(/[０-９]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30),
    )
    .trim();
}

/** '제1장 총칙' → node_no 제1장, 제목 부분 분리. 비패턴(예: 조문)은 node_no null */
function splitHeadingForNode(heading: string): { nodeNo: string | null; nodeTitle: string } {
  const full = heading.trim();
  const t = normalizeDigitsAndNbsp(full);
  const m = t.match(/^제\s*(\d+)\s*(장|절)\s*(.*)$/);
  if (!m) {
    return { nodeNo: null, nodeTitle: full };
  }
  const nodeNo = `제${m[1]}${m[2]}`;
  const rest = (m[3] ?? "").trim();
  return { nodeNo, nodeTitle: rest || full };
}

export async function insertLawStructureNode(
  supabase: SupabaseClient,
  row: LawStructureNodeInsert,
): Promise<number> {
  const { data, error } = await supabase
    .from("law_structure_nodes")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return data.id as number;
}

/** SQLite 등 동기 insert — `insertNode`가 새 노드 id를 반환 */
export function insertLawStructureNodesForArticlesWith(
  insertNode: (row: LawStructureNodeInsert) => number,
  lawVersionId: number,
  articles: ParsedArticle[],
): Map<string, number | null> {
  const articleKeyToStructureNodeId = new Map<string, number | null>();

  let chapterNodeId: number | null = null;
  let sectionNodeId: number | null = null;
  let nodeDisplayOrder = 0;

  for (const article of articles) {
    const heading = resolveHeadingTitleForToc(
      article.articleTitle ?? "",
      article.articleContent ?? "",
    );
    let structureNodeIdForArticle: number | null = null;

    const combined = splitCombinedChapterAndSectionHeading(heading);
    if (combined) {
      const chParts = splitHeadingForNode(combined.chapter);
      const idCh = insertNode({
        law_version_id: lawVersionId,
        parent_id: null,
        node_type: "CHAPTER",
        node_no: chParts.nodeNo,
        node_title: chParts.nodeTitle,
        full_title: combined.chapter.trim(),
        display_order: nodeDisplayOrder++,
        depth: 0,
        article_no: article.articleNo?.trim() || null,
        article_key: article.articleKey?.trim() || null,
        raw_json: {
          article_key: article.articleKey,
          combined_chapter_section: true,
          chapter_only: true,
        },
      });
      chapterNodeId = idCh;
      sectionNodeId = null;

      const secParts = splitHeadingForNode(combined.section);
      const idSec = insertNode({
        law_version_id: lawVersionId,
        parent_id: chapterNodeId,
        node_type: "SECTION",
        node_no: secParts.nodeNo,
        node_title: secParts.nodeTitle,
        full_title: combined.section.trim(),
        display_order: nodeDisplayOrder++,
        depth: 1,
        article_no: article.articleNo?.trim() || null,
        article_key: article.articleKey?.trim() || null,
        raw_json: {
          article_key: article.articleKey,
          combined_chapter_section: true,
          section_only: true,
        },
      });
      sectionNodeId = idSec;
      structureNodeIdForArticle = idSec;
      articleKeyToStructureNodeId.set(article.articleKey, idSec);
      continue;
    }

    const { nodeNo, nodeTitle } = splitHeadingForNode(heading);
    if (isChapterTitle(heading)) {
      const id = insertNode({
        law_version_id: lawVersionId,
        parent_id: null,
        node_type: "CHAPTER",
        node_no: nodeNo,
        node_title: nodeTitle,
        full_title: heading.trim(),
        display_order: nodeDisplayOrder++,
        depth: 0,
        article_no: article.articleNo?.trim() || null,
        article_key: article.articleKey?.trim() || null,
        raw_json: { article_key: article.articleKey },
      });
      chapterNodeId = id;
      sectionNodeId = null;
      structureNodeIdForArticle = id;
    } else if (isSectionTitle(heading)) {
      if (chapterNodeId == null) {
        const orphanParts = splitHeadingForNode(ORPHAN_CHAPTER_TITLE);
        const orphanChapterId = insertNode({
          law_version_id: lawVersionId,
          parent_id: null,
          node_type: "CHAPTER",
          node_no: orphanParts.nodeNo,
          node_title: orphanParts.nodeTitle,
          full_title: ORPHAN_CHAPTER_TITLE,
          display_order: nodeDisplayOrder++,
          depth: 0,
          article_no: null,
          article_key: null,
          raw_json: { synthetic: true },
        });
        chapterNodeId = orphanChapterId;
      }

      const id = insertNode({
        law_version_id: lawVersionId,
        parent_id: chapterNodeId,
        node_type: "SECTION",
        node_no: nodeNo,
        node_title: nodeTitle,
        full_title: heading.trim(),
        display_order: nodeDisplayOrder++,
        depth: 1,
        article_no: article.articleNo?.trim() || null,
        article_key: article.articleKey?.trim() || null,
        raw_json: { article_key: article.articleKey },
      });
      sectionNodeId = id;
      structureNodeIdForArticle = id;
    } else {
      structureNodeIdForArticle = sectionNodeId ?? chapterNodeId ?? null;
    }

    articleKeyToStructureNodeId.set(
      article.articleKey,
      structureNodeIdForArticle,
    );
  }

  return articleKeyToStructureNodeId;
}

/**
 * 조문단위 순서와 동일한 parsed.articles를 순회하며 장/절 노드를 insert하고,
 * 각 article_key에 매길 structure_node_id(소속 장/절) 맵을 만든다.
 */
export async function insertLawStructureNodesForArticles(
  supabase: SupabaseClient,
  lawVersionId: number,
  articles: ParsedArticle[],
): Promise<Map<string, number | null>> {
  const articleKeyToStructureNodeId = new Map<string, number | null>();

  let chapterNodeId: number | null = null;
  let sectionNodeId: number | null = null;
  let nodeDisplayOrder = 0;

  for (const article of articles) {
    const heading = resolveHeadingTitleForToc(
      article.articleTitle ?? "",
      article.articleContent ?? "",
    );
    let structureNodeIdForArticle: number | null = null;

    const combined = splitCombinedChapterAndSectionHeading(heading);
    if (combined) {
      const chParts = splitHeadingForNode(combined.chapter);
      const idCh = await insertLawStructureNode(supabase, {
        law_version_id: lawVersionId,
        parent_id: null,
        node_type: "CHAPTER",
        node_no: chParts.nodeNo,
        node_title: chParts.nodeTitle,
        full_title: combined.chapter.trim(),
        display_order: nodeDisplayOrder++,
        depth: 0,
        article_no: article.articleNo?.trim() || null,
        article_key: article.articleKey?.trim() || null,
        raw_json: {
          article_key: article.articleKey,
          combined_chapter_section: true,
          chapter_only: true,
        },
      });
      chapterNodeId = idCh;
      sectionNodeId = null;

      const secParts = splitHeadingForNode(combined.section);
      const idSec = await insertLawStructureNode(supabase, {
        law_version_id: lawVersionId,
        parent_id: chapterNodeId,
        node_type: "SECTION",
        node_no: secParts.nodeNo,
        node_title: secParts.nodeTitle,
        full_title: combined.section.trim(),
        display_order: nodeDisplayOrder++,
        depth: 1,
        article_no: article.articleNo?.trim() || null,
        article_key: article.articleKey?.trim() || null,
        raw_json: {
          article_key: article.articleKey,
          combined_chapter_section: true,
          section_only: true,
        },
      });
      sectionNodeId = idSec;
      structureNodeIdForArticle = idSec;
      articleKeyToStructureNodeId.set(article.articleKey, idSec);
      continue;
    }

    const { nodeNo, nodeTitle } = splitHeadingForNode(heading);
    if (isChapterTitle(heading)) {
      const id = await insertLawStructureNode(supabase, {
        law_version_id: lawVersionId,
        parent_id: null,
        node_type: "CHAPTER",
        node_no: nodeNo,
        node_title: nodeTitle,
        full_title: heading.trim(),
        display_order: nodeDisplayOrder++,
        depth: 0,
        article_no: article.articleNo?.trim() || null,
        article_key: article.articleKey?.trim() || null,
        raw_json: { article_key: article.articleKey },
      });
      chapterNodeId = id;
      sectionNodeId = null;
      structureNodeIdForArticle = id;
    } else if (isSectionTitle(heading)) {
      if (chapterNodeId == null) {
        const orphanParts = splitHeadingForNode(ORPHAN_CHAPTER_TITLE);
        const orphanChapterId = await insertLawStructureNode(supabase, {
          law_version_id: lawVersionId,
          parent_id: null,
          node_type: "CHAPTER",
          node_no: orphanParts.nodeNo,
          node_title: orphanParts.nodeTitle,
          full_title: ORPHAN_CHAPTER_TITLE,
          display_order: nodeDisplayOrder++,
          depth: 0,
          article_no: null,
          article_key: null,
          raw_json: { synthetic: true },
        });
        chapterNodeId = orphanChapterId;
      }

      const id = await insertLawStructureNode(supabase, {
        law_version_id: lawVersionId,
        parent_id: chapterNodeId,
        node_type: "SECTION",
        node_no: nodeNo,
        node_title: nodeTitle,
        full_title: heading.trim(),
        display_order: nodeDisplayOrder++,
        depth: 1,
        article_no: article.articleNo?.trim() || null,
        article_key: article.articleKey?.trim() || null,
        raw_json: { article_key: article.articleKey },
      });
      sectionNodeId = id;
      structureNodeIdForArticle = id;
    } else {
      structureNodeIdForArticle = sectionNodeId ?? chapterNodeId ?? null;
    }

    articleKeyToStructureNodeId.set(
      article.articleKey,
      structureNodeIdForArticle,
    );
  }

  return articleKeyToStructureNodeId;
}
