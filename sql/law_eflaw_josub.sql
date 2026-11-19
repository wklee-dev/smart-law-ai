-- Supabase SQL Editor에서 실행하세요.
-- 현행법령(시행일) 본문 조항호목 조회 API(eflawjosub) 저장 이력 + law_chunks 연계

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
