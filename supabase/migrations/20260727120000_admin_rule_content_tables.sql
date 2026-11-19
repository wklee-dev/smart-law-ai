-- 행정규칙 본문 (SQLite admin_rules.db → Supabase)
-- law_crawler 설계: rule_master + admin_rule* (+ raw_rule* 예비)

create table if not exists public.rule_master (
  param text primary key,
  gubun text,
  description text,
  note text,
  reference text,
  url text,
  url_type text,
  no_body int not null default 0,
  seq_id text,
  updated_at timestamptz
);

comment on table public.rule_master is '행정규칙/법령 마스터 (SQLite rule_master 동기화)';

create table if not exists public.admin_rule (
  id bigint generated always as identity primary key,
  sqlite_id bigint,
  gubun text,
  param text not null,
  seq_id text,
  law_name text,
  promulgation_no text,
  promulgation_dt text,
  section_type text,
  article_no text,
  article_title text,
  article_content text,
  created_at text
);

create index if not exists idx_admin_rule_param on public.admin_rule(param);
create index if not exists idx_admin_rule_seq on public.admin_rule(seq_id);

comment on table public.admin_rule is '행정규칙 본문 조문 (SQLite admin_rule 동기화)';

create table if not exists public.admin_rule_addendum (
  id bigint generated always as identity primary key,
  sqlite_id bigint,
  gubun text,
  param text not null,
  seq_id text,
  law_name text,
  ar_seq text,
  addendum_no text,
  addendum_date text,
  article_no text,
  article_content text,
  created_at text
);

create index if not exists idx_admin_rule_addendum_param
  on public.admin_rule_addendum(param);

create table if not exists public.admin_rule_annex (
  id bigint generated always as identity primary key,
  sqlite_id bigint,
  gubun text,
  param text not null,
  seq_id text,
  law_name text,
  byl_seq text,
  annex_title text,
  annex_content text,
  han_fl_seq text,
  pdf_fl_seq text,
  image_fl_seqs text,
  created_at text
);

create index if not exists idx_admin_rule_annex_param
  on public.admin_rule_annex(param);

create table if not exists public.admin_rule_attachment (
  id bigint generated always as identity primary key,
  sqlite_id bigint,
  gubun text,
  param text not null,
  seq_id text,
  law_name text,
  fl_seq text,
  file_name text,
  file_type text,
  local_path text,
  download_url text,
  downloaded int default 0,
  created_at text
);

create index if not exists idx_admin_rule_attachment_param
  on public.admin_rule_attachment(param);
create unique index if not exists idx_admin_rule_attachment_fl_param
  on public.admin_rule_attachment(fl_seq, param);

create table if not exists public.crawl_meta (
  param text primary key,
  gubun text,
  description text,
  url text,
  seq_id text,
  crawled_at timestamptz,
  status text
);

comment on table public.crawl_meta is '행정규칙 크롤링 실행 이력';

-- 법령 전용 예비 (현재 SQLite에는 admin_rule만 사용 중일 수 있음)
create table if not exists public.raw_rule (
  id bigint generated always as identity primary key,
  sqlite_id bigint,
  gubun text,
  param text not null,
  seq_id text,
  law_name text,
  promulgation_no text,
  promulgation_dt text,
  section_type text,
  article_no text,
  article_title text,
  article_content text,
  created_at text
);
create index if not exists idx_raw_rule_param on public.raw_rule(param);

create table if not exists public.raw_rule_addendum (
  id bigint generated always as identity primary key,
  sqlite_id bigint,
  gubun text,
  param text not null,
  seq_id text,
  law_name text,
  ar_seq text,
  addendum_no text,
  addendum_date text,
  article_no text,
  article_content text,
  created_at text
);
create index if not exists idx_raw_rule_addendum_param on public.raw_rule_addendum(param);

create table if not exists public.raw_rule_annex (
  id bigint generated always as identity primary key,
  sqlite_id bigint,
  gubun text,
  param text not null,
  seq_id text,
  law_name text,
  byl_seq text,
  annex_title text,
  annex_content text,
  han_fl_seq text,
  pdf_fl_seq text,
  image_fl_seqs text,
  created_at text
);
create index if not exists idx_raw_rule_annex_param on public.raw_rule_annex(param);

create table if not exists public.raw_rule_attachment (
  id bigint generated always as identity primary key,
  sqlite_id bigint,
  gubun text,
  param text not null,
  seq_id text,
  law_name text,
  fl_seq text,
  file_name text,
  file_type text,
  local_path text,
  download_url text,
  downloaded int default 0,
  created_at text
);
create index if not exists idx_raw_rule_attachment_param on public.raw_rule_attachment(param);
create unique index if not exists idx_raw_rule_attachment_fl_param
  on public.raw_rule_attachment(fl_seq, param);
