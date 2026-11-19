-- ==================================================
-- STEP 8-3 search_smartlaw_chunk_keywords() Keyword Search
-- ==================================================

DROP FUNCTION IF EXISTS public.search_smartlaw_chunk_keywords(
    text[],
    integer,
    double precision,
    text,
    text,
    text,
    text
);

CREATE OR REPLACE FUNCTION public.search_smartlaw_chunk_keywords(
    query_terms text[],
    match_count integer DEFAULT 10,
    match_threshold double precision DEFAULT 0.0,
    filter_document_category text DEFAULT NULL,
    filter_document_type text DEFAULT NULL,
    filter_source_table text DEFAULT NULL,
    filter_chunk_type text DEFAULT NULL
)
RETURNS TABLE
(
    id bigint,
    source_table text,
    source_pk bigint,
    document_category text,
    document_type text,
    law_name text,
    chunk_type text,
    article_no text,
    title text,
    header text,
    body text,
    chunk_text text,
    keywords text[],
    metadata jsonb,
    matched_keywords text[],
    exact_match_count integer,
    partial_match_count integer,
    keyword_score double precision
)
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
    v_terms text[];
    v_query_term_count integer;
BEGIN
    IF query_terms IS NULL THEN
        RAISE EXCEPTION
            'query_terms는 필수입니다.';
    END IF;

    IF cardinality(query_terms) = 0 THEN
        RAISE EXCEPTION
            'query_terms는 1개 이상이어야 합니다.';
    END IF;

    IF match_count IS NULL
       OR match_count < 1
       OR match_count > 100 THEN
        RAISE EXCEPTION
            'match_count는 1 이상 100 이하여야 합니다.';
    END IF;

    IF match_threshold IS NULL
       OR match_threshold < 0
       OR match_threshold > 1 THEN
        RAISE EXCEPTION
            'match_threshold는 0 이상 1 이하여야 합니다.';
    END IF;

    SELECT ARRAY_AGG(normalized.term ORDER BY normalized.ord)
    INTO v_terms
    FROM (
        SELECT
            LOWER(BTRIM(t.term)) AS term,
            MIN(t.ord) AS ord
        FROM unnest(query_terms) WITH ORDINALITY AS t(term, ord)
        WHERE t.term IS NOT NULL
          AND BTRIM(t.term) <> ''
        GROUP BY LOWER(BTRIM(t.term))
    ) AS normalized;

    IF v_terms IS NULL OR cardinality(v_terms) = 0 THEN
        RAISE EXCEPTION
            '유효한 query_terms가 없습니다.';
    END IF;

    v_query_term_count := cardinality(v_terms);

    RETURN QUERY
    WITH terms AS (
        SELECT unnest(v_terms) AS term
    ),
    scored AS (
        SELECT
            sc.id AS chunk_id,
            sc.source_table AS chunk_source_table,
            sc.source_pk AS chunk_source_pk,
            sc.document_category AS chunk_document_category,
            sc.document_type AS chunk_document_type,
            sc.law_name AS chunk_law_name,
            sc.chunk_type AS chunk_chunk_type,
            sc.article_no AS chunk_article_no,
            sc.title AS chunk_title,
            sc.header AS chunk_header,
            sc.body AS chunk_body,
            sc.chunk_text AS chunk_chunk_text,
            sc.keywords AS chunk_keywords,
            sc.metadata AS chunk_metadata,
            (
                SELECT COUNT(*)::integer
                FROM terms qt
                WHERE EXISTS (
                    SELECT 1
                    FROM unnest(sc.keywords) AS kw(keyword)
                    WHERE LOWER(BTRIM(kw.keyword)) = qt.term
                )
            ) AS exact_cnt,
            (
                SELECT COUNT(*)::integer
                FROM terms qt
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM unnest(sc.keywords) AS kw(keyword)
                    WHERE LOWER(BTRIM(kw.keyword)) = qt.term
                )
                AND EXISTS (
                    SELECT 1
                    FROM unnest(sc.keywords) AS kw(keyword)
                    WHERE LOWER(BTRIM(kw.keyword)) LIKE '%' || qt.term || '%'
                       OR qt.term LIKE '%' || LOWER(BTRIM(kw.keyword)) || '%'
                )
            ) AS partial_cnt,
            (
                SELECT COUNT(*)::integer
                FROM terms qt
                WHERE LOWER(COALESCE(sc.title, '')) LIKE '%' || qt.term || '%'
                   OR LOWER(COALESCE(sc.header, '')) LIKE '%' || qt.term || '%'
            ) AS title_cnt,
            (
                SELECT COUNT(*)::integer
                FROM terms qt
                WHERE LOWER(COALESCE(sc.law_name, '')) LIKE '%' || qt.term || '%'
            ) AS law_name_cnt,
            COALESCE(
                (
                    SELECT ARRAY_AGG(matched.keyword ORDER BY matched.keyword)
                    FROM (
                        SELECT DISTINCT kw.keyword AS keyword
                        FROM unnest(sc.keywords) AS kw(keyword)
                        WHERE EXISTS (
                            SELECT 1
                            FROM terms qt
                            WHERE LOWER(BTRIM(kw.keyword)) = qt.term
                               OR LOWER(BTRIM(kw.keyword))
                                  LIKE '%' || qt.term || '%'
                               OR qt.term
                                  LIKE '%' || LOWER(BTRIM(kw.keyword)) || '%'
                        )
                    ) AS matched
                ),
                ARRAY[]::text[]
            ) AS matched_kw
        FROM public.smartlaw_chunk AS sc
        WHERE sc.keywords IS NOT NULL
          AND cardinality(sc.keywords) > 0
          AND (
              NULLIF(BTRIM(filter_document_category), '') IS NULL
              OR sc.document_category = NULLIF(
                  BTRIM(filter_document_category),
                  ''
              )
          )
          AND (
              NULLIF(BTRIM(filter_document_type), '') IS NULL
              OR sc.document_type = NULLIF(
                  BTRIM(filter_document_type),
                  ''
              )
          )
          AND (
              NULLIF(BTRIM(filter_source_table), '') IS NULL
              OR sc.source_table = NULLIF(
                  BTRIM(filter_source_table),
                  ''
              )
          )
          AND (
              NULLIF(BTRIM(filter_chunk_type), '') IS NULL
              OR sc.chunk_type = NULLIF(
                  BTRIM(filter_chunk_type),
                  ''
              )
          )
    ),
    ranked AS (
        SELECT
            scored.*,
            LEAST(
                1.0::double precision,
                (scored.exact_cnt::double precision / v_query_term_count) * 0.60
                + (scored.partial_cnt::double precision / v_query_term_count) * 0.25
                + (scored.title_cnt::double precision / v_query_term_count) * 0.10
                + (scored.law_name_cnt::double precision / v_query_term_count) * 0.05
            ) AS score
        FROM scored
        WHERE scored.exact_cnt > 0
           OR scored.partial_cnt > 0
           OR scored.title_cnt > 0
           OR scored.law_name_cnt > 0
    )
    SELECT
        ranked.chunk_id,
        ranked.chunk_source_table,
        ranked.chunk_source_pk,
        ranked.chunk_document_category,
        ranked.chunk_document_type,
        ranked.chunk_law_name,
        ranked.chunk_chunk_type,
        ranked.chunk_article_no,
        ranked.chunk_title,
        ranked.chunk_header,
        ranked.chunk_body,
        ranked.chunk_chunk_text,
        ranked.chunk_keywords,
        ranked.chunk_metadata,
        ranked.matched_kw,
        ranked.exact_cnt,
        ranked.partial_cnt,
        ranked.score
    FROM ranked
    WHERE ranked.score >= match_threshold
    ORDER BY
        ranked.score DESC,
        ranked.exact_cnt DESC,
        ranked.partial_cnt DESC,
        ranked.chunk_id ASC
    LIMIT match_count;
END;
$function$;

COMMENT ON FUNCTION public.search_smartlaw_chunk_keywords(
    text[],
    integer,
    double precision,
    text,
    text,
    text,
    text
)
IS
'Smart Law AI 공통 Keyword Search 함수';

-- ==================================================
-- STEP 8-3 TEST 1
-- ==================================================

SELECT
    id,
    source_pk,
    law_name,
    article_no,
    title,
    matched_keywords,
    exact_match_count,
    partial_match_count,
    keyword_score
FROM public.search_smartlaw_chunk_keywords(
    query_terms := ARRAY[
        '사후관리',
        '용도 외 사용',
        '승인'
    ]::text[],
    match_count := 10,
    match_threshold := 0.0::double precision,
    filter_document_category := 'ADMIN_RULE'::text,
    filter_document_type := NULL::text,
    filter_source_table := 'admin_rule'::text,
    filter_chunk_type := 'ARTICLE'::text
);

-- ==================================================
-- STEP 8-3 TEST 2
-- ==================================================

SELECT
    id,
    source_pk,
    law_name,
    article_no,
    title,
    matched_keywords,
    exact_match_count,
    partial_match_count,
    keyword_score
FROM public.search_smartlaw_chunk_keywords(
    query_terms := ARRAY['제29조']::text[],
    match_count := 10,
    match_threshold := 0.0::double precision,
    filter_document_category := 'ADMIN_RULE'::text,
    filter_document_type := NULL::text,
    filter_source_table := 'admin_rule'::text,
    filter_chunk_type := 'ARTICLE'::text
);

-- ==================================================
-- STEP 8-3 TEST 3: 입력 오류 (주석 상태)
-- ==================================================
-- 기대 오류: match_count는 1 이상 100 이하여야 합니다.
--
-- SELECT *
-- FROM public.search_smartlaw_chunk_keywords(
--     query_terms := ARRAY['사후관리']::text[],
--     match_count := 0
-- );
