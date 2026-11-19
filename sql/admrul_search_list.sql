-- Supabase SQL Editor에서 실행하세요.
-- 행정규칙 목록 조회 (lawSearch.do?target=admrul) JSON 저장 · 행 단위 임베딩
-- 벡터 차원은 EMBEDDING_OUTPUT_DIMENSIONALITY(기본 768)와 맞춥니다.

create extension if not exists vector;

-- 목록 API 호출 1회당 1행 (원본 JSON 보관)
create table if not exists public.admrul_search_runs (
  id bigint generated always as identity primary key,
  requested_url text,
  target text not null default 'admrul',
  query text,
  date_single text,
  page int,
  display int,
  nw int,
  search_scope int,
  org text,
  knd text,
  sort text,
  prml_yd text,
  mod_yd text,
  nb text,
  total_cnt int,
  result_code text,
  result_msg text,
  section text,
  num_of_rows text,
  raw_response jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_admrul_search_runs_created
  on public.admrul_search_runs(created_at desc);

comment on table public.admrul_search_runs is
  '행정규칙 목록 조회 Open API(AdmRulSearch) 응답';

-- 목록의 각 행정규칙 1건당 1행 (임베딩은 규칙명·부처·종류 등 요약 텍스트)
create table if not exists public.admrul_list_items (
  id bigint generated always as identity primary key,
  search_run_id bigint not null references public.admrul_search_runs(id) on delete cascade,
  result_row_id text,
  adm_serial_id text not null,
  adm_lid text,
  rule_name_kr text,
  rule_type text,
  ministry_name text,
  promulgation_date text,
  promulgation_no text,
  enforcement_date text,
  created_record_date text,
  current_history_type text,
  revision_code text,
  revision_name text,
  detail_link text,
  embed_text text not null,
  embedding vector(768),
  raw_item jsonb not null,
  unique(search_run_id, adm_serial_id)
);

create index if not exists idx_admrul_list_items_run
  on public.admrul_list_items(search_run_id);

create index if not exists idx_admrul_list_items_serial
  on public.admrul_list_items(adm_serial_id);

comment on table public.admrul_list_items is
  '행정규칙 목록 조회 결과 행 + 목록 요약 임베딩';

-- 선택: 임베딩이 쌓인 뒤 실행
-- create index if not exists admrul_list_items_embedding_hnsw
--   on public.admrul_list_items
--   using hnsw (embedding vector_cosine_ops);

create or replace function match_admrul_list_items(
  query_embedding vector(768),
  match_count int default 8,
  filter_adm_serial_id text default null,
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
    i.id,
    i.embed_text as chunk_text,
    coalesce(i.rule_name_kr, '') as source_title,
    jsonb_build_object(
      'adm_serial_id', i.adm_serial_id,
      'adm_lid', i.adm_lid,
      'search_run_id', i.search_run_id,
      'source', 'admrul_list',
      'ministry_name', i.ministry_name,
      'rule_type', i.rule_type
    ) as metadata,
    (1 - (i.embedding <=> query_embedding))::float as similarity
  from admrul_list_items i
  where i.embedding is not null
    and (
      coalesce(min_similarity, 0.45) < 0
      or (1 - (i.embedding <=> query_embedding))::float
        > coalesce(min_similarity, 0.45)
    )
    and (
      filter_adm_serial_id is null
      or filter_adm_serial_id = ''
      or i.adm_serial_id = filter_adm_serial_id
    )
  order by i.embedding <=> query_embedding
  limit least(coalesce(match_count, 8), 32);
$$;
