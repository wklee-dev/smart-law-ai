-- version_key(공포번호-공포일자)는 법령(law_id)마다 독립적으로 쓰일 수 있다.
-- 클라우드·복원 DB에 남아 있을 수 있는 전역 UNIQUE(version_key)는 제거하고 (law_id, version_key)로 맞춘다.

alter table public.law_versions
  drop constraint if exists law_versions_version_key_key;

drop index if exists law_versions_version_key_key;

create unique index if not exists law_versions_law_id_version_key_key
  on public.law_versions (law_id, version_key);
