-- 조문 인라인 이미지 (크롤러 article_image)

create table if not exists public.article_image (
  id bigint generated always as identity primary key,
  gubun text,
  param text,
  seq_id text,
  law_name text,
  article_no text,
  fl_seq text,
  img_order int default 1,
  mime_type text,
  file_ext text,
  image_data bytea,
  download_url text,
  created_at text
);

create index if not exists idx_article_image_param on public.article_image(param);
create index if not exists idx_article_image_seq on public.article_image(seq_id);
create unique index if not exists idx_article_image_fl_param
  on public.article_image(fl_seq, param);

comment on table public.article_image is '행정규칙/법령 조문 인라인 이미지';
