-- 관세율표(tariff.db) RAG 청크 — year + country_code 필터
-- 벡터 차원: EMBEDDING_OUTPUT_DIMENSIONALITY(기본 768)

set search_path to public, extensions;

create table if not exists public.tariff_chunks (
  id bigint generated always as identity primary key,
  sqlite_id bigint not null,
  record_uuid text,
  year int not null,
  country_code text not null,
  country_name text,
  source_level text not null,
  source_key text not null,
  source_title text,
  chunk_text text not null,
  chunk_index int not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(768),
  constraint tariff_chunks_scope_chunk_unique
    unique (year, country_code, source_level, source_key, chunk_index)
);

create index if not exists idx_tariff_chunks_year_country
  on public.tariff_chunks(year, country_code);

create index if not exists idx_tariff_chunks_source_level
  on public.tariff_chunks(source_level);

create index if not exists idx_tariff_chunks_hs
  on public.tariff_chunks((metadata->>'hs_code'));

comment on table public.tariff_chunks is
  '관세율표 SQLite(tariff_section/chapter/heading/item) 청크 및 벡터';

create or replace function public.match_tariff_chunks(
  query_embedding vector(768),
  match_count int default 8,
  filter_year int default null,
  filter_country_code text default null,
  filter_source_level text default null,
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
  from public.tariff_chunks c
  where c.embedding is not null
    and (
      coalesce(min_similarity, 0.45) < 0
      or (1 - (c.embedding <=> query_embedding))::float
        > coalesce(min_similarity, 0.45)
    )
    and (
      filter_year is null
      or c.year = filter_year
    )
    and (
      filter_country_code is null
      or filter_country_code = ''
      or upper(trim(c.country_code)) = upper(trim(filter_country_code))
    )
    and (
      filter_source_level is null
      or filter_source_level = ''
      or c.source_level = filter_source_level
    )
  order by c.embedding <=> query_embedding
  limit least(coalesce(match_count, 8), 32);
$$;

grant select, insert, update, delete on public.tariff_chunks to anon, authenticated, service_role;
grant execute on function public.match_tariff_chunks(vector, int, int, text, text, float)
  to anon, authenticated, service_role;
