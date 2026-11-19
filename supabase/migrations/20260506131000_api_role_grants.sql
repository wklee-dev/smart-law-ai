-- PostgREST(anon / authenticated / service_role)가 public·extensions에 접근할 수 있게 권한을 맞춘다.
-- pg_restore·수동 DDL 이후에는 테이블 소유자만 권한을 갖는 경우가 많아 403 permission denied가 난다.

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;
grant execute on all routines in schema public to anon, authenticated, service_role;
