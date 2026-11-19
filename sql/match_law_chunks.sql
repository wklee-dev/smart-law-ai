-- Supabase SQL Editor에서 실행하세요. 벡터 차원은 EMBEDDING_OUTPUT_DIMENSIONALITY(기본 768)와 일치해야 합니다.
-- 차원이 다르면 vector(768)을 vector(차원)으로 바꾸세요.
--
-- min_similarity: (1 - cosine_distance). 이 값보다 큰 청크만 반환.
-- 음수(예: -1)이면 유사도 하한을 적용하지 않고 상위 match_count개만 반환합니다.

create or replace function match_law_chunks(
  query_embedding vector(768),
  match_count int default 8,
  filter_law_id text default null,
  min_similarity float default 0.45
)
returns table (
  id bigint,
  chunk_text text,
  source_title text,
  metadata jsonb,
  similarity float
)
language sql
stable
as $$
  select
    c.id,
    c.chunk_text,
    c.source_title,
    c.metadata,
    (1 - (c.embedding <=> query_embedding))::float as similarity
  from law_chunks c
  where c.embedding is not null
    and (
      coalesce(min_similarity, 0.45) < 0
      or (1 - (c.embedding <=> query_embedding))::float
        > coalesce(min_similarity, 0.45)
    )
    and (
      filter_law_id is null
      or filter_law_id = ''
      or (c.metadata->>'law_id') = filter_law_id
    )
  order by c.embedding <=> query_embedding
  limit least(coalesce(match_count, 8), 32);
$$;
