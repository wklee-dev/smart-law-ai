-- admin_rules.db 적재 벡터 — SQLite admin_rule / raw_rule 접두사와 동일하게 구분

create table if not exists public.admin_rule_snapshots (
  id bigint generated always as identity primary key,
  seq_id text not null,
  param text not null,
  rule_name_kr text,
  enforcement_date text,
  promulgation_date text,
  requested_url text,
  raw_response jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_rule_snapshots_param
  on public.admin_rule_snapshots(param);
create index if not exists idx_admin_rule_snapshots_seq
  on public.admin_rule_snapshots(seq_id);
create index if not exists idx_admin_rule_snapshots_created
  on public.admin_rule_snapshots(created_at desc);

comment on table public.admin_rule_snapshots is
  'admin_rules.db admin_rule* 본문 벡터화 스냅샷';

create table if not exists public.admin_rule_chunks (
  id bigint generated always as identity primary key,
  admin_rule_snapshot_id bigint not null
    references public.admin_rule_snapshots(id) on delete cascade,
  source_type text not null,
  source_key text not null,
  source_title text,
  chunk_text text not null,
  chunk_index int not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(768)
);

create index if not exists idx_admin_rule_chunks_snapshot
  on public.admin_rule_chunks(admin_rule_snapshot_id);
create index if not exists idx_admin_rule_chunks_metadata_param
  on public.admin_rule_chunks((metadata->>'admin_rules_param'));

comment on table public.admin_rule_chunks is
  'admin_rules.db admin_rule* RAG 청크 및 벡터';

create table if not exists public.raw_rule_snapshots (
  id bigint generated always as identity primary key,
  seq_id text not null,
  param text not null,
  rule_name_kr text,
  enforcement_date text,
  promulgation_date text,
  requested_url text,
  raw_response jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_raw_rule_snapshots_param
  on public.raw_rule_snapshots(param);
create index if not exists idx_raw_rule_snapshots_seq
  on public.raw_rule_snapshots(seq_id);
create index if not exists idx_raw_rule_snapshots_created
  on public.raw_rule_snapshots(created_at desc);

comment on table public.raw_rule_snapshots is
  'admin_rules.db raw_rule* 본문 벡터화 스냅샷';

create table if not exists public.raw_rule_chunks (
  id bigint generated always as identity primary key,
  raw_rule_snapshot_id bigint not null
    references public.raw_rule_snapshots(id) on delete cascade,
  source_type text not null,
  source_key text not null,
  source_title text,
  chunk_text text not null,
  chunk_index int not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(768)
);

create index if not exists idx_raw_rule_chunks_snapshot
  on public.raw_rule_chunks(raw_rule_snapshot_id);
create index if not exists idx_raw_rule_chunks_metadata_param
  on public.raw_rule_chunks((metadata->>'admin_rules_param'));

comment on table public.raw_rule_chunks is
  'admin_rules.db raw_rule* RAG 청크 및 벡터';

create or replace function public.match_admin_rule_chunks(
  query_embedding vector(768),
  match_count int default 8,
  filter_param text default null,
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
  from admin_rule_chunks c
  where c.embedding is not null
    and (
      coalesce(min_similarity, 0.45) < 0
      or (1 - (c.embedding <=> query_embedding))::float
        > coalesce(min_similarity, 0.45)
    )
    and (
      filter_param is null
      or filter_param = ''
      or (c.metadata->>'admin_rules_param') = filter_param
    )
  order by c.embedding <=> query_embedding
  limit least(coalesce(match_count, 8), 32);
$$;

create or replace function public.match_raw_rule_chunks(
  query_embedding vector(768),
  match_count int default 8,
  filter_param text default null,
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
  from raw_rule_chunks c
  where c.embedding is not null
    and (
      coalesce(min_similarity, 0.45) < 0
      or (1 - (c.embedding <=> query_embedding))::float
        > coalesce(min_similarity, 0.45)
    )
    and (
      filter_param is null
      or filter_param = ''
      or (c.metadata->>'admin_rules_param') = filter_param
    )
  order by c.embedding <=> query_embedding
  limit least(coalesce(match_count, 8), 32);
$$;
