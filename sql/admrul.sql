-- Supabase SQL Editor에서 실행하세요.
-- 행정규칙(admrul) Open API 응답 저장 · 청크 · 벡터 검색
-- 벡터 차원은 EMBEDDING_OUTPUT_DIMENSIONALITY(기본 768)와 맞춥니다. 다르면 vector(768)을 수정하세요.

create extension if not exists vector;

-- API 응답 원본 (이력 보관)
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

create index if not exists idx_admrul_snapshots_serial
  on public.admrul_snapshots(adm_serial_id);

create index if not exists idx_admrul_snapshots_created
  on public.admrul_snapshots(created_at desc);

comment on table public.admrul_snapshots is
  '국가법령정보 Open API target=admrul JSON 상세조회 응답';

-- RAG용 청크 + 임베딩
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

create index if not exists idx_admrul_chunks_snapshot
  on public.admrul_chunks(admrul_snapshot_id);

create index if not exists idx_admrul_chunks_metadata_serial
  on public.admrul_chunks((metadata->>'adm_serial_id'));

-- 벡터 인덱스(선택): 임베딩 데이터가 생긴 뒤 Supabase SQL Editor에서 실행 권장
-- create index if not exists admrul_chunks_embedding_hnsw
--   on public.admrul_chunks
--   using hnsw (embedding vector_cosine_ops);

comment on table public.admrul_chunks is
  '행정규칙 본문·부칙·별표 등 분할 청크 및 벡터';

-- LangChain / 앱에서 사용할 유사도 검색
create or replace function match_admrul_chunks(
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
