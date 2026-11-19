-- HS 해설서 RAG 청크 (SQLite hs_manual_* → Supabase)
-- 벡터 차원: EMBEDDING_OUTPUT_DIMENSIONALITY(기본 768)

set search_path to public, extensions;

create table if not exists public.hs_chunks (
  id bigint generated always as identity primary key,
  hs_meta_id bigint not null,
  aply_year text not null,
  division text not null,
  source_type text not null,
  source_key text not null,
  source_title text,
  lang_code text not null default 'kor',
  chunk_text text not null,
  chunk_index int not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(768),
  constraint hs_chunks_meta_lang_chunk_unique
    unique (hs_meta_id, lang_code, chunk_index)
);

create index if not exists idx_hs_chunks_aply_division
  on public.hs_chunks(aply_year, division);

create index if not exists idx_hs_chunks_hs_meta
  on public.hs_chunks(hs_meta_id);

create index if not exists idx_hs_chunks_source_type
  on public.hs_chunks(source_type);

comment on table public.hs_chunks is
  '품목분류 HS 해설서 청크 및 벡터 (hs_manual SQLite)';

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

grant select, insert, update, delete on public.hs_chunks to anon, authenticated, service_role;
grant execute on function public.match_hs_chunks(vector, int, text, text, float)
  to anon, authenticated, service_role;
