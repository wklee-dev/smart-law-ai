/**
 * law-chat / LangChain RAG가 동일한 Supabase 벡터·텍스트 재정렬 검색을 쓰도록 공용 모듈.
 */
import {
  formatLawSourceLine,
  truncateChunkAtLawBoundary,
} from "@/app/lib/law-chat-context";
import { embedQueryText } from "@/app/lib/gemini-embed";
import { cosineSimilarity, parseVector } from "@/app/lib/law-embedding-sim";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";

export type LawChatMatchRow = {
  id: number;
  chunk_text: string;
  source_title: string | null;
  metadata: Record<string, unknown> | null;
  similarity: number | null;
};

export type LawChatRetrievalMode =
  | "vector"
  | "vector_relaxed"
  | "text_reranked"
  | "text_fallback";

/** `match_law_chunks` 상한은 sql/match_law_chunks.sql의 least(..., 32)와 맞출 것 */
export function parseMatchCount(): number {
  const raw = process.env.LAW_CHAT_MATCH_COUNT?.trim();
  const fallback = 16;
  const n = raw ? Number.parseInt(raw, 10) : fallback;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(32, Math.max(1, n));
}

/**
 * 벡터 유사도 하한 (1 - cosine distance). 0.7은 너무 높아 후보가 빈 경우가 많아 기본은 0.45.
 * 음수(예: -1)는 RPC에서 하한 미적용 — 코드에서 빈 결과 시 재시도용으로 사용.
 */
export function parseMinSimilarity(): number {
  const raw = process.env.LAW_CHAT_MIN_SIMILARITY?.trim();
  const n = raw ? Number.parseFloat(raw) : 0.45;
  if (!Number.isFinite(n)) return 0.45;
  return Math.min(0.999, Math.max(-1, n));
}

/** 빈 결과 후 상위 k만 가져올 때(유사도 필터 끄기). DB 함수와 동기화 */
const VECTOR_RELAXED_MIN_SIMILARITY = -1;

/** 키워드로 넓게 모은 뒤 질의 임베딩과 재비교할 때 하한(코사인). */
function parseTextRerankMinSimilarity(): number {
  const raw = process.env.LAW_CHAT_TEXT_RERANK_MIN_SIMILARITY?.trim();
  const n = raw ? Number.parseFloat(raw) : 0.28;
  if (!Number.isFinite(n)) return 0.28;
  return Math.min(0.99, Math.max(0, n));
}

const TEXT_FALLBACK_CANDIDATE_CAP = 96;

/** 법령별 청크 상한 — 한 법(예: 관세법)이 후보를 독점하지 않게 */
const DEFAULT_MAX_CHUNKS_PER_LAW_ID = 5;

function parseMaxChunksPerLawId(): number {
  const raw = process.env.LAW_CHAT_MAX_CHUNKS_PER_LAW?.trim();
  const n = raw ? Number.parseInt(raw, 10) : DEFAULT_MAX_CHUNKS_PER_LAW_ID;
  if (!Number.isFinite(n) || n < 1) return DEFAULT_MAX_CHUNKS_PER_LAW_ID;
  return Math.min(16, n);
}

const LEXICAL_STOPWORDS = new Set([
  "대해",
  "설명",
  "알려",
  "주세요",
  "부탁",
  "해줘",
  "해주",
  "해주세요",
  "법률",
  "법령",
  "관련",
  "질문",
  "내용",
  "무엇",
  "어떻게",
  "자세히",
  "상세히",
  "이게",
  "이거",
  "그게",
  "그거",
  "뭐야",
  "알아",
  "보여",
  "찾아",
  "해당",
  "적용",
  "경우",
]);

function sanitizeIlikeFragment(s: string): string {
  return s.replace(/[%_]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

/** 질의 확장: 「검역」류 질문에서 가축전염병 예방법·동물검역 쪽 벡터 후보를 끌어올림 */
function expandMessageForVectorEmbedding(message: string): string | null {
  const t = message.trim();
  if (!t) return null;
  if (/검역/.test(t) && /수입/.test(t)) {
    return `${t} 가축전염병예방법 동물검역 지정검역물`;
  }
  if (/검역/.test(t)) {
    return `${t} 가축전염병예방법 동물검역`;
  }
  return null;
}

async function retrieveChunksByVector(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  embedding: number[],
  lawId: string | null,
  matchCount: number,
  minSimilarity: number,
): Promise<LawChatMatchRow[]> {
  const { data, error } = await supabase.rpc("match_law_chunks", {
    query_embedding: embedding,
    match_count: matchCount,
    filter_law_id: lawId && lawId.trim() ? lawId.trim() : null,
    min_similarity: minSimilarity,
  });

  if (error) {
    throw error;
  }
  return (data ?? []) as LawChatMatchRow[];
}

/** [tag] 제거 후 한글 연속 구간을 키워드 후보로 사용 */
function extractKoreanSearchTerms(message: string, maxTerms: number): string[] {
  const noTags = message.replace(/\[[^\]]*\]/g, " ");
  const words = noTags.match(/[\uAC00-\uD7A3]{2,}/g) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of words) {
    const t = w.length > 48 ? w.slice(0, 48) : w;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= maxTerms) break;
  }
  return out;
}

/**
 * "수입검역" ↔ "수입 검역"처럼 붙여 쓴 질의가 조문·청크(띄어쓰기)와 어긋날 때를 보완하기 위해
 * 긴 토큰을 대략 반으로 나눈 부분어를 추가합니다.
 */
function expandKoreanCompoundTerms(terms: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of terms) {
    if (t.length >= 2 && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
    if (t.length >= 4) {
      const mid = Math.floor(t.length / 2);
      const a = t.slice(0, mid);
      const b = t.slice(mid);
      for (const x of [a, b]) {
        if (x.length >= 2 && !seen.has(x)) {
          seen.add(x);
          out.push(x);
        }
      }
    }
  }
  return out;
}

function koreanSearchTermsForLexical(
  message: string,
  maxBase: number,
): string[] {
  const base = extractKoreanSearchTerms(message, maxBase);
  return expandKoreanCompoundTerms(base);
}

/** 토큰 끝 조사 제거 — 「검역에」→「검역」로 AND·가산점이 본문과 맞도록 */
function stripTrailingKoreanParticle(s: string): string {
  if (s.length < 3) return s;
  const particles = "은는이가을를에의로와도만까지부터에서으로";
  const last = s[s.length - 1];
  if (particles.includes(last)) {
    return s.slice(0, -1);
  }
  return s;
}

function coreLexicalTerms(message: string): string[] {
  const raw = koreanSearchTermsForLexical(message, 12)
    .map((x) => sanitizeIlikeFragment(x))
    .filter((x) => x.length >= 2 && !LEXICAL_STOPWORDS.has(x));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of raw) {
    const variants = [
      x,
      stripTrailingKoreanParticle(x),
    ].filter((v) => v.length >= 2 && !LEXICAL_STOPWORDS.has(v));
    for (const v of variants) {
      if (seen.has(v)) continue;
      seen.add(v);
      out.push(v);
      if (out.length >= 8) return out;
    }
  }
  return out;
}

/** 띄어쓰기 무시 비교용 */
function compactHangul(s: string): string {
  return s.replace(/\s+/g, "");
}

/** `chunk_text` / `source_title` ilike 패턴 (수입·검역 사이 임의 문자 허용) */
function phraseIlikeImportQuarantine(message: string): string | null {
  const c = compactHangul(message);
  if (c.includes("수입검역") || (/수입/.test(message) && /검역/.test(message))) {
    return "%수입%검역%";
  }
  return null;
}

type RawChunkRow = {
  id: number;
  chunk_text: string;
  source_title: string | null;
  metadata: Record<string, unknown> | null;
  embedding: unknown;
};

type LexicalBoostContext = {
  coreTerms: string[];
  phraseIlike: string | null;
};

function lexicalBoostForRow(
  row: RawChunkRow,
  ctx: LexicalBoostContext | null,
): number {
  if (!ctx || ctx.coreTerms.length < 2) return 0;
  const title = (row.source_title ?? "").toLowerCase();
  const body = (row.chunk_text ?? "").toLowerCase();
  let b = 0;
  if (ctx.phraseIlike) {
    const inner = ctx.phraseIlike.replace(/^%|%$/g, "").replace(/%/g, "");
    const needle = inner.toLowerCase().replace(/\s+/g, "");
    if (needle.length >= 4) {
      const tc = compactHangul(title);
      const bc = compactHangul(body);
      if (tc.includes(needle)) b += 0.14;
      else if (bc.includes(needle)) b += 0.07;
    }
  }
  const terms = ctx.coreTerms.map((x) => x.toLowerCase());
  const titleHasAll = terms.every((t) => title.includes(t));
  const bodyHasAll = terms.every((t) => body.includes(t));
  if (titleHasAll) b += 0.1;
  else if (bodyHasAll) b += 0.055;
  return Math.min(0.24, b);
}

function rerankRawChunksByQueryEmbedding(
  rawRows: RawChunkRow[],
  queryEmbedding: number[],
  limit: number,
  boostCtx: LexicalBoostContext | null = null,
): LawChatMatchRow[] {
  const floor = parseTextRerankMinSimilarity();
  const scored = rawRows
    .map((row) => {
      const emb = parseVector(row.embedding);
      if (!emb || emb.length !== queryEmbedding.length) {
        return { row, sim: -1 as number, rankScore: -1 as number };
      }
      const sim = cosineSimilarity(queryEmbedding, emb);
      const boost = lexicalBoostForRow(row, boostCtx);
      const rankScore = Math.min(1, sim + boost);
      return { row, sim, rankScore };
    })
    .filter((x) => x.sim > -0.5);

  scored.sort((a, b) => b.rankScore - a.rankScore);

  let picked = scored.filter((x) => x.rankScore >= floor);
  if (picked.length === 0) {
    picked = scored.slice(0, Math.min(limit, scored.length));
  } else {
    picked = picked.slice(0, limit);
  }

  return picked.map(({ row, sim }) => ({
    id: row.id,
    chunk_text: row.chunk_text,
    source_title: row.source_title,
    metadata: row.metadata,
    similarity: Math.max(0, sim),
  }));
}

async function retrieveChunksByVectorBestOfQueries(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  embeddings: number[][],
  lawId: string | null,
  matchCount: number,
  minSimilarity: number,
): Promise<LawChatMatchRow[]> {
  if (embeddings.length === 0) return [];
  const byId = new Map<number, LawChatMatchRow>();
  for (const emb of embeddings) {
    if (emb.length === 0) continue;
    const rows = await retrieveChunksByVector(
      supabase,
      emb,
      lawId,
      matchCount,
      minSimilarity,
    );
    for (const r of rows) {
      const prev = byId.get(r.id);
      const s = r.similarity ?? 0;
      if (!prev || s > (prev.similarity ?? 0)) {
        byId.set(r.id, r);
      }
    }
  }
  return Array.from(byId.values())
    .sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
    .slice(0, matchCount);
}

/**
 * 키워드로 후보만 모은 뒤, 청크에 저장된 임베딩과 질의 임베딩 코사인으로 재정렬.
 * (키워드만 쓰면 임의 청크 + LLM 환각이 늘어남)
 */
function ilikeOrClauseForTerms(terms: string[]): string {
  const parts: string[] = [];
  for (const t of terms.slice(0, 12)) {
    parts.push(`chunk_text.ilike.%${t}%`);
    parts.push(`source_title.ilike.%${t}%`);
  }
  return parts.join(",");
}

/**
 * 키워드·조문제목(source_title) 일치 후보를 넓게 모은 뒤 질의 임베딩으로 재정렬합니다.
 * 구절·핵심어 AND(교집합) 후보를 OR보다 먼저 넣어 관세법 등 단일 키워드 대량 매칭을 완화합니다.
 */
async function retrieveChunksByTextFallback(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  message: string,
  lawId: string | null,
  limit: number,
  queryEmbedding: number[],
): Promise<LawChatMatchRow[]> {
  const terms = koreanSearchTermsForLexical(message, 10)
    .map((t) => sanitizeIlikeFragment(t))
    .filter((t) => t.length >= 2);
  const fullQ = sanitizeIlikeFragment(message);
  const core = coreLexicalTerms(message);
  const phrasePat = phraseIlikeImportQuarantine(message);
  const boostCtx: LexicalBoostContext = {
    coreTerms: core,
    phraseIlike: phrasePat,
  };

  if (
    terms.length === 0 &&
    fullQ.length < 2 &&
    !phrasePat &&
    core.length < 2
  ) {
    return [];
  }

  const base = () =>
    supabase
      .from("law_chunks")
      .select("id, chunk_text, source_title, metadata, embedding")
      .not("embedding", "is", null);

  const withLaw = <T extends { eq: (a: string, b: string) => T }>(
    q: T,
    applyLaw: boolean,
  ): T => {
    if (applyLaw && lawId?.trim()) {
      return q.eq("metadata->>law_id", lawId.trim());
    }
    return q;
  };

  const runPhrase = async (applyLaw: boolean): Promise<RawChunkRow[]> => {
    if (!phrasePat) return [];
    let q = base().or(
      `chunk_text.ilike.${phrasePat},source_title.ilike.${phrasePat}`,
    );
    q = withLaw(q, applyLaw);
    const { data, error } = await q.limit(100);
    if (error) throw error;
    return (data ?? []) as RawChunkRow[];
  };

  const runAndCore = async (applyLaw: boolean): Promise<RawChunkRow[]> => {
    if (core.length < 2) return [];
    let q = base();
    for (const t of core.slice(0, 3)) {
      q = q.or(`chunk_text.ilike.%${t}%,source_title.ilike.%${t}%`);
    }
    q = withLaw(q, applyLaw);
    const { data, error } = await q.limit(100);
    if (error) throw error;
    return (data ?? []) as RawChunkRow[];
  };

  const runOrTerms = async (applyLaw: boolean): Promise<RawChunkRow[]> => {
    if (terms.length === 0) return [];
    let q = base().or(ilikeOrClauseForTerms(terms));
    q = withLaw(q, applyLaw);
    const { data, error } = await q.limit(120);
    if (error) throw error;
    return (data ?? []) as RawChunkRow[];
  };

  const runFull = async (applyLaw: boolean): Promise<RawChunkRow[]> => {
    if (fullQ.length < 2) return [];
    let q = base().or(
      `chunk_text.ilike.%${fullQ}%,source_title.ilike.%${fullQ}%`,
    );
    q = withLaw(q, applyLaw);
    const { data, error } = await q.limit(120);
    if (error) throw error;
    return (data ?? []) as RawChunkRow[];
  };

  const steps: Array<(applyLaw: boolean) => Promise<RawChunkRow[]>> = [
    runPhrase,
    runAndCore,
    runOrTerms,
    runFull,
  ];

  const seen = new Map<number, RawChunkRow>();
  for (const step of steps) {
    for (const applyLaw of [true, false]) {
      const batch = await step(applyLaw);
      for (const row of batch) {
        if (!seen.has(row.id)) {
          seen.set(row.id, row);
        }
      }
      if (seen.size >= TEXT_FALLBACK_CANDIDATE_CAP) {
        break;
      }
    }
    if (seen.size >= TEXT_FALLBACK_CANDIDATE_CAP) {
      break;
    }
  }

  const candidates = Array.from(seen.values());
  if (candidates.length === 0) {
    return [];
  }

  return rerankRawChunksByQueryEmbedding(
    candidates,
    queryEmbedding,
    limit,
    boostCtx,
  );
}

const LEXICAL_SUPPLEMENT_MAX = 6;

function mergeUniqueChunkRows(
  primary: LawChatMatchRow[],
  extra: LawChatMatchRow[],
  maxTotal: number,
): LawChatMatchRow[] {
  const seen = new Set<number>();
  const out: LawChatMatchRow[] = [];
  for (const r of primary) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
    if (out.length >= maxTotal) return out;
  }
  for (const r of extra) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
    if (out.length >= maxTotal) return out;
  }
  return out;
}

/**
 * 벡터 상위만으로는 띄어쓰기·표기 차이(예: 수입검역 vs 수입 검역)로 누락될 수 있어
 * 제목·본문 키워드 재정렬 결과를 일부 합칩니다.
 */
async function supplementVectorRowsWithLexical(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  message: string,
  lawId: string | null,
  vectorRows: LawChatMatchRow[],
  queryEmbedding: number[],
  matchCount: number,
): Promise<LawChatMatchRow[]> {
  if (vectorRows.length === 0 || LEXICAL_SUPPLEMENT_MAX <= 0) {
    return vectorRows;
  }
  const exclude = new Set(vectorRows.map((r) => r.id));
  const lexical = await retrieveChunksByTextFallback(
    supabase,
    message,
    lawId,
    matchCount + LEXICAL_SUPPLEMENT_MAX + 8,
    queryEmbedding,
  );
  const additions = lexical.filter((r) => !exclude.has(r.id));
  const maxTotal = Math.min(32, matchCount + LEXICAL_SUPPLEMENT_MAX);
  return mergeUniqueChunkRows(vectorRows, additions, maxTotal);
}

function resolveMatchCount(override?: number): number {
  if (typeof override === "number" && Number.isFinite(override)) {
    return Math.min(32, Math.max(1, Math.trunc(override)));
  }
  return parseMatchCount();
}

function resolveMinSimilarity(override?: number): number {
  if (typeof override === "number" && Number.isFinite(override)) {
    return Math.min(0.999, Math.max(-1, override));
  }
  return parseMinSimilarity();
}

export function buildContextBlock(
  rows: LawChatMatchRow[],
  maxChunkChars: number,
): string {
  if (rows.length === 0) {
    return "(참고 조문 없음)";
  }
  return rows
    .map((r, i) => {
      const src = formatLawSourceLine(r.metadata, r.source_title);
      const sim =
        r.similarity != null
          ? `유사도 ${(r.similarity * 100).toFixed(1)}%`
          : "유사도 —";
      const body = truncateChunkAtLawBoundary(
        (r.chunk_text ?? "").trim(),
        maxChunkChars,
      );
      return `[${i + 1}] 출처: ${src} (${sim})\n${body}`;
    })
    .join("\n\n---\n\n");
}

/**
 * 질문에 「수입」「검역」이 함께 있을 때, 제36조(수입 검역) 등 질문과 같은 취지의 조문을
 * 검역증명서 첨부(제34조) 등 부가 조문보다 앞에 두어 LLM이 앞 블록을 근거로 삼게 합니다.
 * (유사도 내림차순은 티어 안에서 유지)
 */
function prioritizeImportQuarantineRows(
  sorted: LawChatMatchRow[],
): LawChatMatchRow[] {
  function tier(r: LawChatMatchRow): number {
    const st = r.source_title ?? "";
    const titleCompact = st.replace(/\s+/g, "");
    const blobHead = (r.chunk_text ?? "").replace(/\s+/g, "").slice(0, 1600);
    const blob = titleCompact + blobHead;
    const titleHasBoth =
      /수입/.test(st) &&
      /검역/.test(st) &&
      !/검역증명|증명서/.test(titleCompact);
    const article36 = /제\s*36조/.test(st) || /제36조/.test(st);
    if (titleHasBoth) return 0;
    if (article36 && /수입/.test(blob) && /검역/.test(blob)) return 0;
    if (/수입/.test(blob) && /검역/.test(blob)) return 1;
    return 2;
  }

  const decorated = sorted.map((r, i) => ({ r, i, t: tier(r) }));
  decorated.sort((a, b) => {
    if (a.t !== b.t) return a.t - b.t;
    const ds = (b.r.similarity ?? 0) - (a.r.similarity ?? 0);
    if (ds !== 0) return ds;
    return a.i - b.i;
  });
  return decorated.map((x) => x.r);
}

/**
 * 「납부기한」 등 질문에서 관세법 제9조(납부기한)류를 가산세·경정(제38조) 등보다 앞에 둡니다.
 * 벡터 유사도만으로는 제38조가 [1]에 오는 경우가 있어 LangChain·벡터 채팅 공통 순서를 맞춥니다.
 */
function prioritizePaymentDeadlineRows(
  sorted: LawChatMatchRow[],
): LawChatMatchRow[] {
  function tier(r: LawChatMatchRow): number {
    const st = r.source_title ?? "";
    const art9 = /제\s*9조/.test(st) || /제9조/.test(st);
    if (art9 && /납부/.test(st) && /기한/.test(st)) return 0;
    if (art9 && (/납부/.test(st) || /기한/.test(st))) return 1;
    if (art9) return 2;
    if (/납부/.test(st) && /기한/.test(st)) return 3;
    if (/납부/.test(st) || /기한/.test(st)) return 4;
    return 5;
  }

  const decorated = sorted.map((r, i) => ({ r, i, t: tier(r) }));
  decorated.sort((a, b) => {
    if (a.t !== b.t) return a.t - b.t;
    const ds = (b.r.similarity ?? 0) - (a.r.similarity ?? 0);
    if (ds !== 0) return ds;
    return a.i - b.i;
  });
  return decorated.map((x) => x.r);
}

export function prioritizeRowsForRetrievalOverlap(
  message: string,
  rows: LawChatMatchRow[],
): LawChatMatchRow[] {
  if (rows.length <= 1) return rows;
  const sorted = [...rows].sort(
    (a, b) => (b.similarity ?? 0) - (a.similarity ?? 0),
  );

  const paymentDeadlineQuery =
    /납부기한/.test(message) ||
    /납부\s*기한/.test(message) ||
    (/납부/.test(message) && /기한/.test(message));

  if (paymentDeadlineQuery) {
    return prioritizePaymentDeadlineRows(sorted);
  }

  if (/수입/.test(message) && /검역/.test(message)) {
    return prioritizeImportQuarantineRows(sorted);
  }

  return sorted;
}

export type RetrieveLawChatChunksResult = {
  rows: LawChatMatchRow[];
  retrievalMode: LawChatRetrievalMode;
  minSimilarityUsed: number;
  matchCount: number;
};

/**
 * 유사도 순으로 정렬된 행에서 law_id당 개수를 제한한 뒤, 부족하면 나머지로 채웁니다.
 */
export function applyLawIdDiversity(
  rows: LawChatMatchRow[],
  maxPerLaw: number,
  targetCount: number,
): LawChatMatchRow[] {
  if (rows.length === 0) return [];
  const sorted = [...rows].sort(
    (a, b) => (b.similarity ?? 0) - (a.similarity ?? 0),
  );
  const counts = new Map<string, number>();
  const out: LawChatMatchRow[] = [];
  const used = new Set<number>();

  for (const r of sorted) {
    const lid =
      r.metadata && typeof r.metadata.law_id === "string"
        ? r.metadata.law_id.trim()
        : "";
    const key = lid || "__none__";
    const c = counts.get(key) ?? 0;
    if (c >= maxPerLaw) continue;
    counts.set(key, c + 1);
    out.push(r);
    used.add(r.id);
    if (out.length >= targetCount) {
      return out;
    }
  }

  for (const r of sorted) {
    if (used.has(r.id)) continue;
    out.push(r);
    used.add(r.id);
    if (out.length >= targetCount) break;
  }
  return out;
}

/**
 * law-chat POST와 동일: 벡터 → (빈 결과 시) 완화 벡터 → (여전히 빈 경우) 키워드+임베딩 재정렬.
 * RPC 실패 시 `text_fallback` 모드로 표시한 뒤 텍스트 경로로 보완.
 */
export async function retrieveLawChatChunks(params: {
  message: string;
  lawId: string | null;
  matchCount?: number;
  minSimilarity?: number;
}): Promise<RetrieveLawChatChunksResult> {
  const supabase = getSupabaseAdmin();
  const primaryEmb = await embedQueryText(params.message);
  const augmentedText = expandMessageForVectorEmbedding(params.message);
  const vectorEmbeddings = augmentedText
    ? [primaryEmb, await embedQueryText(augmentedText)]
    : [primaryEmb];

  const matchCount = resolveMatchCount(params.matchCount);
  const minSimilarity = resolveMinSimilarity(params.minSimilarity);

  let rows: LawChatMatchRow[] = [];
  let retrievalMode: LawChatRetrievalMode = "vector";
  let minSimilarityUsed = minSimilarity;

  try {
    rows = await retrieveChunksByVectorBestOfQueries(
      supabase,
      vectorEmbeddings,
      params.lawId,
      matchCount,
      minSimilarity,
    );
    if (rows.length === 0 && minSimilarity >= 0) {
      const relaxed = await retrieveChunksByVectorBestOfQueries(
        supabase,
        vectorEmbeddings,
        params.lawId,
        matchCount,
        VECTOR_RELAXED_MIN_SIMILARITY,
      );
      if (relaxed.length > 0) {
        rows = relaxed;
        retrievalMode = "vector_relaxed";
        minSimilarityUsed = VECTOR_RELAXED_MIN_SIMILARITY;
      }
    }
    if (
      rows.length > 0 &&
      (retrievalMode === "vector" || retrievalMode === "vector_relaxed")
    ) {
      rows = await supplementVectorRowsWithLexical(
        supabase,
        params.message,
        params.lawId,
        rows,
        primaryEmb,
        matchCount,
      );
    }
  } catch (rpcErr) {
    console.warn(
      "match_law_chunks RPC 실패 (sql/match_law_chunks.sql 실행 여부 확인):",
      rpcErr instanceof Error ? rpcErr.message : rpcErr,
    );
    retrievalMode = "text_fallback";
  }

  if (rows.length === 0) {
    const textRows = await retrieveChunksByTextFallback(
      supabase,
      params.message,
      params.lawId,
      matchCount,
      primaryEmb,
    );
    if (textRows.length > 0) {
      rows = textRows;
      retrievalMode = "text_reranked";
    }
  }

  rows = applyLawIdDiversity(rows, parseMaxChunksPerLawId(), matchCount);
  rows = prioritizeRowsForRetrievalOverlap(params.message, rows);

  return { rows, retrievalMode, minSimilarityUsed, matchCount };
}
