-- =============================================================================
-- smart-law-ai — 데이터베이스 생성 통합 스크립트
-- =============================================================================
-- 이 파일은 Supabase에 직접 접근해 덤프한 것이 아니라, 저장소의 sql/*.sql 과
-- 앱 소스에서 참조하는 스키마를 모아 새 프로젝트에 적용할 수 있게 한 것입니다.
-- 실제 운영 DB와 차이가 있을 수 있으니, 배포 전에 한 번 검토하세요.
--
-- 벡터 차원은 EMBEDDING_OUTPUT_DIMENSIONALITY(기본 768)와 일치해야 합니다.
-- Gemini 설정이 다르면 아래 vector(768)을 모두 동일 차원으로 바꾸세요.
--
-- Supabase SQL Editor 등에서 순서대로 실행하면 됩니다.
-- =============================================================================

create schema if not exists extensions;
create extension if not exists vector with schema extensions;
set search_path to public, extensions;

-- -----------------------------------------------------------------------------
-- 법령 본문 · 조문 (law-detail/save, 일반법령 조회 등)
-- -----------------------------------------------------------------------------

create table if not exists public.laws (
  id bigint generated always as identity primary key,
  law_id text not null unique,
  law_key text,
  law_name_kr text not null default '',
  law_name_hanja text,
  law_name_short text,
  law_type_name text,
  law_type_code text,
  ministry_name text,
  ministry_code text,
  language text,
  raw_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists idx_laws_law_id on public.laws(law_id);

comment on table public.laws is '법령 마스터(법령ID·명칭·소관부처 등)';

create table if not exists public.law_versions (
  id bigint generated always as identity primary key,
  law_id bigint not null references public.laws(id) on delete cascade,
  version_key text,
  promulgation_no text,
  promulgation_date date,
  enforcement_date date,
  revision_type text,
  article_effective_text text,
  promulgated_law_yn text,
  contact_phone text,
  contact_department_name text,
  is_current boolean not null default false,
  raw_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists idx_law_versions_law_id on public.law_versions(law_id);
create index if not exists idx_law_versions_current on public.law_versions(law_id, is_current);

create unique index if not exists law_versions_law_id_version_key_key
  on public.law_versions (law_id, version_key);

comment on table public.law_versions is '법령 시행·공포 버전별 본문 메타';

create table if not exists public.law_structure_nodes (
  id bigint generated always as identity primary key,
  law_version_id bigint not null references public.law_versions(id) on delete cascade,
  parent_id bigint references public.law_structure_nodes(id) on delete cascade,
  node_type text not null check (node_type in ('CHAPTER', 'SECTION')),
  node_no text,
  node_title text not null,
  full_title text not null,
  display_order int not null default 0,
  depth int not null default 0,
  article_no text,
  article_key text,
  raw_json jsonb not null default '{}'::jsonb
);

create index if not exists idx_law_structure_nodes_version
  on public.law_structure_nodes(law_version_id);

comment on table public.law_structure_nodes is '법령 버전별 장·절(TOC) 노드';

create table if not exists public.law_articles (
  id bigint generated always as identity primary key,
  law_version_id bigint not null references public.law_versions(id) on delete cascade,
  structure_node_id bigint references public.law_structure_nodes(id) on delete set null,
  article_key text not null,
  article_no bigint,
  article_title text,
  article_content text,
  article_type text,
  article_revision_type text,
  article_effective_date date,
  article_changed_yn text,
  article_moved_from text,
  article_moved_to text,
  article_reference text,
  display_order int,
  raw_json jsonb,
  unique (law_version_id, article_key)
);

create index if not exists idx_law_articles_version on public.law_articles(law_version_id);

create table if not exists public.law_article_items (
  id bigint generated always as identity primary key,
  law_article_id bigint not null references public.law_articles(id) on delete cascade,
  item_level text not null,
  parent_item_id bigint references public.law_article_items(id) on delete cascade,
  item_no text,
  item_content text,
  display_order int,
  depth int not null default 0,
  raw_json jsonb
);

create index if not exists idx_law_article_items_article
  on public.law_article_items(law_article_id);

create table if not exists public.law_chunks (
  id bigint generated always as identity primary key,
  law_id bigint not null references public.laws(id) on delete cascade,
  law_version_id bigint references public.law_versions(id) on delete cascade,
  structure_node_id bigint references public.law_structure_nodes(id) on delete set null,
  law_article_id bigint references public.law_articles(id) on delete set null,
  source_type text not null,
  source_key text not null,
  source_title text,
  chunk_text text not null,
  chunk_index int not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(768)
);

create index if not exists idx_law_chunks_version on public.law_chunks(law_version_id);
create index if not exists idx_law_chunks_law_article on public.law_chunks(law_article_id);
create index if not exists idx_law_chunks_metadata_law_id
  on public.law_chunks((metadata->>'law_id'));

comment on table public.law_chunks is 'RAG용 법령 청크 및 임베딩';

-- -----------------------------------------------------------------------------
-- 현행법령 목록 검색 저장 (law-search/save)
-- -----------------------------------------------------------------------------

create table if not exists public.law_search_histories (
  id bigint generated always as identity primary key,
  target text not null,
  keyword text,
  section text,
  total_count int,
  page int,
  num_of_rows int,
  result_code text,
  result_message text,
  requested_url text,
  raw_xml text,
  created_at timestamptz not null default now()
);

create index if not exists idx_law_search_histories_created
  on public.law_search_histories(created_at desc);

create table if not exists public.law_search_items (
  id bigint generated always as identity primary key,
  search_history_id bigint not null references public.law_search_histories(id) on delete cascade,
  item_no int,
  law_serial_no text,
  history_status_code text,
  law_name_kr text,
  law_name_short text,
  law_id text not null,
  promulgation_date text,
  promulgation_no text,
  revision_type_name text,
  ministry_code text,
  ministry_name text,
  law_type_name text,
  enforcement_date text,
  detail_link text
);

create index if not exists idx_law_search_items_history on public.law_search_items(search_history_id);

-- -----------------------------------------------------------------------------
-- 행정규칙 본문 (admrul) — sql/admrul.sql 기반
-- -----------------------------------------------------------------------------

create table if not exists public.admrul_snapshots (
  id bigint generated always as identity primary key,
  adm_serial_id text not null,
  adm_lid text,
  rule_name_kr text,
  ministry_name text,
  enforcement_date text,
  promulgation_date text,
  requested_url text,
  raw_response jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_admrul_snapshots_serial on public.admrul_snapshots(adm_serial_id);
create index if not exists idx_admrul_snapshots_created on public.admrul_snapshots(created_at desc);

comment on table public.admrul_snapshots is '국가법령정보 Open API target=admrul JSON 상세조회 응답';

create table if not exists public.admrul_chunks (
  id bigint generated always as identity primary key,
  admrul_snapshot_id bigint not null references public.admrul_snapshots(id) on delete cascade,
  source_type text not null,
  source_key text not null,
  source_title text,
  chunk_text text not null,
  chunk_index int not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(768)
);

create index if not exists idx_admrul_chunks_snapshot on public.admrul_chunks(admrul_snapshot_id);
create index if not exists idx_admrul_chunks_metadata_serial
  on public.admrul_chunks((metadata->>'adm_serial_id'));

comment on table public.admrul_chunks is '행정규칙 본문·부칙·별표 등 분할 청크 및 벡터';

-- -----------------------------------------------------------------------------
-- 행정규칙 목록 (admrul search) — sql/admrul_search_list.sql 기반
-- -----------------------------------------------------------------------------

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

comment on table public.admrul_search_runs is '행정규칙 목록 조회 Open API(AdmRulSearch) 응답';

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
  unique (search_run_id, adm_serial_id)
);

create index if not exists idx_admrul_list_items_run on public.admrul_list_items(search_run_id);
create index if not exists idx_admrul_list_items_serial on public.admrul_list_items(adm_serial_id);

comment on table public.admrul_list_items is '행정규칙 목록 조회 결과 행 + 목록 요약 임베딩';

-- -----------------------------------------------------------------------------
-- 조항호목(eflawjosub) 스냅샷 — sql/law_eflaw_josub.sql 기반
-- -----------------------------------------------------------------------------

create table if not exists public.law_eflaw_josub_snapshots (
  id bigint generated always as identity primary key,
  law_pk bigint not null references public.laws(id) on delete cascade,
  law_id_text text not null,
  mst text,
  ef_yd text not null,
  jo text not null,
  hang text,
  ho text,
  mok text,
  requested_url text,
  raw_response jsonb,
  source_title text,
  chunk_text_preview text,
  law_chunk_id bigint references public.law_chunks(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_law_eflaw_josub_snapshots_law_pk
  on public.law_eflaw_josub_snapshots(law_pk);
create index if not exists idx_law_eflaw_josub_snapshots_law_id_text
  on public.law_eflaw_josub_snapshots(law_id_text);
create index if not exists idx_law_eflaw_josub_snapshots_created
  on public.law_eflaw_josub_snapshots(created_at desc);

comment on table public.law_eflaw_josub_snapshots is
  '국가법령정보 Open API target=eflawjosub 조회 결과 및 생성된 law_chunks 참조';

-- -----------------------------------------------------------------------------
-- RPC: 벡터 검색 — sql/match_law_chunks.sql, admrul.sql, admrul_search_list.sql
-- -----------------------------------------------------------------------------

create or replace function public.match_law_chunks(
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

create or replace function public.match_admrul_chunks(
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
    c.id,
    c.chunk_text,
    c.source_title,
    c.metadata,
    (1 - (c.embedding <=> query_embedding))::float as similarity
  from admrul_chunks c
  where c.embedding is not null
    and (
      coalesce(min_similarity, 0.45) < 0
      or (1 - (c.embedding <=> query_embedding))::float
        > coalesce(min_similarity, 0.45)
    )
    and (
      filter_adm_serial_id is null
      or filter_adm_serial_id = ''
      or (c.metadata->>'adm_serial_id') = filter_adm_serial_id
    )
  order by c.embedding <=> query_embedding
  limit least(coalesce(match_count, 8), 32);
$$;

create or replace function public.match_admrul_list_items(
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

-- ---------------------------------------------------------------------------
-- Supabase PostgREST: API 역할에 스키마·테이블 접근 (로컬/복원 DB에서 누락 시 403)
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- API 관리 목록 (SQLite: smart_law_ai.db · gwanselaw_list)
-- Postgres에는 동일 스키마를 두지 않습니다. 앱은 SQLite만 사용합니다.
-- sql/gwanselaw_list.sql 참고
-- -----------------------------------------------------------------------------

grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;
grant execute on all routines in schema public to anon, authenticated, service_role;

-- 선택: 임베딩이 충분히 쌓인 뒤 HNSW 인덱스 (대용량 시 권장)
-- create index if not exists law_chunks_embedding_hnsw
--   on public.law_chunks using hnsw (embedding vector_cosine_ops);
-- create index if not exists admrul_chunks_embedding_hnsw
--   on public.admrul_chunks using hnsw (embedding vector_cosine_ops);
-- create index if not exists admrul_list_items_embedding_hnsw
--   on public.admrul_list_items using hnsw (embedding vector_cosine_ops);
