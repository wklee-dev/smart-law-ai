-- supabase/migrations/20260522120000_hs_chunks.sql 과 동일 (참고용)

create or replace function public.match_hs_chunks(
  query_embedding vector(768),
  match_count int default 8,
  filter_aply_year text default null,
  filter_division text default null,
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
set search_path to public, extensions
as $$
  select
    c.id,
    c.chunk_text,
    c.source_title,
    c.metadata,
    (1 - (c.embedding <=> query_embedding))::float as similarity
  from public.hs_chunks c
  where c.embedding is not null
    and (
      coalesce(min_similarity, 0.45) < 0
      or (1 - (c.embedding <=> query_embedding))::float
        > coalesce(min_similarity, 0.45)
    )
    and (
      filter_aply_year is null
      or filter_aply_year = ''
      or c.aply_year = filter_aply_year
    )
    and (
      filter_division is null
      or filter_division = ''
      or c.division = filter_division
    )
  order by c.embedding <=> query_embedding
  limit least(coalesce(match_count, 8), 32);
$$;
