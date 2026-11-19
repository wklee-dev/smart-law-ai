-- ==================================================
-- STEP 8-1 match_smartlaw_chunk() Vector Search 함수
-- ==================================================
-- Embedding Model : gemini-embedding-001
-- Embedding Dim   : 768
-- Distance        : cosine (<=>)
-- Similarity      : 1 - cosine distance
-- ==================================================

DROP FUNCTION IF EXISTS public.match_smartlaw_chunk(
    vector,
    integer
);

DROP FUNCTION IF EXISTS public.match_smartlaw_chunk(
    vector,
    integer,
    double precision,
    text,
    text,
    text,
    text
);

CREATE OR REPLACE FUNCTION public.match_smartlaw_chunk(
    query_embedding vector(768),
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
    similarity double precision
)
LANGUAGE plpgsql
STABLE
AS $function$
BEGIN
    IF query_embedding IS NULL THEN
        RAISE EXCEPTION
            'query_embedding은 필수입니다.';
    END IF;

    IF match_count IS NULL THEN
        RAISE EXCEPTION
            'match_count는 필수입니다.';
    END IF;

    IF match_count < 1 OR match_count > 100 THEN
        RAISE EXCEPTION
            'match_count는 1 이상 100 이하여야 합니다.';
    END IF;

    IF match_threshold IS NULL THEN
        RAISE EXCEPTION
            'match_threshold는 필수입니다.';
    END IF;

    IF match_threshold < -1 OR match_threshold > 1 THEN
        RAISE EXCEPTION
            'match_threshold는 -1 이상 1 이하여야 합니다.';
    END IF;

    RETURN QUERY
    SELECT
        sc.id,
        sc.source_table,
        sc.source_pk,
        sc.document_category,
        sc.document_type,
        sc.law_name,
        sc.chunk_type,
        sc.article_no,
        sc.title,
        sc.header,
        sc.body,
        sc.chunk_text,
        sc.keywords,
        sc.metadata,
        (
            1 - (sc.embedding <=> query_embedding)
        )::double precision AS similarity
    FROM public.smartlaw_chunk AS sc
    WHERE sc.embedding IS NOT NULL

      AND (
          NULLIF(
              BTRIM(filter_document_category),
              ''
          ) IS NULL
          OR sc.document_category = NULLIF(
              BTRIM(filter_document_category),
              ''
          )
      )

      AND (
          NULLIF(
              BTRIM(filter_document_type),
              ''
          ) IS NULL
          OR sc.document_type = NULLIF(
              BTRIM(filter_document_type),
              ''
          )
      )

      AND (
          NULLIF(
              BTRIM(filter_source_table),
              ''
          ) IS NULL
          OR sc.source_table = NULLIF(
              BTRIM(filter_source_table),
              ''
          )
      )

      AND (
          NULLIF(
              BTRIM(filter_chunk_type),
              ''
          ) IS NULL
          OR sc.chunk_type = NULLIF(
              BTRIM(filter_chunk_type),
              ''
          )
      )

      AND (
          1 - (sc.embedding <=> query_embedding)
      ) >= match_threshold

    ORDER BY
        sc.embedding <=> query_embedding ASC,
        sc.id ASC

    LIMIT match_count;
END;
$function$;

COMMENT ON FUNCTION public.match_smartlaw_chunk(
    vector,
    integer,
    double precision,
    text,
    text,
    text,
    text
)
IS
'Smart Law AI 공통 768차원 cosine vector 검색 함수';

-- ==================================================
-- STEP 8-1 TEST 1: 자기 자신 검색
-- ==================================================

SELECT
    id,
    source_pk,
    law_name,
    article_no,
    similarity
FROM public.match_smartlaw_chunk(
    query_embedding := (
        SELECT embedding
        FROM public.smartlaw_chunk
        WHERE id = 2
    ),
    match_count := 5,
    match_threshold := 0.0::double precision,
    filter_document_category := 'ADMIN_RULE'::text,
    filter_document_type := NULL::text,
    filter_source_table := 'admin_rule'::text,
    filter_chunk_type := 'ARTICLE'::text
);

-- ==================================================
-- STEP 8-1 TEST 2: document_type 필터
-- ==================================================

SELECT
    id,
    source_pk,
    law_name,
    document_type,
    similarity
FROM public.match_smartlaw_chunk(
    query_embedding := (
        SELECT embedding
        FROM public.smartlaw_chunk
        WHERE source_table = 'admin_rule'
          AND source_pk = 63
          AND chunk_type = 'ARTICLE'
    ),
    match_count := 10,
    match_threshold := 0.0::double precision,
    filter_document_category := 'ADMIN_RULE'::text,
    filter_document_type := '공고'::text,
    filter_source_table := 'admin_rule'::text,
    filter_chunk_type := 'ARTICLE'::text
);

-- ==================================================
-- STEP 8-1 TEST 3: 높은 threshold
-- ==================================================

SELECT
    id,
    source_pk,
    law_name,
    similarity
FROM public.match_smartlaw_chunk(
    query_embedding := (
        SELECT embedding
        FROM public.smartlaw_chunk
        WHERE id = 2
    ),
    match_count := 10,
    match_threshold := 0.9999::double precision,
    filter_document_category := 'ADMIN_RULE'::text,
    filter_document_type := NULL::text,
    filter_source_table := 'admin_rule'::text,
    filter_chunk_type := 'ARTICLE'::text
);

-- ==================================================
-- STEP 8-1 TEST 4: 입력 오류
-- ==================================================
-- 아래 SQL은 오류 확인용이므로 주석 상태로 유지하세요.
--
-- SELECT *
-- FROM public.match_smartlaw_chunk(
--     query_embedding := (
--         SELECT embedding
--         FROM public.smartlaw_chunk
--         WHERE id = 2
--     ),
--     match_count := 0
-- );
