-- 0003_grants.sql
-- SQL Editor 로 테이블을 만들면 authenticated/anon 역할에 테이블 권한이 자동
-- 부여되지 않아 "permission denied for table ..." 오류가 날 수 있습니다.
-- 아래로 명시적 부여. RLS(owner_id = auth.uid())가 여전히 행 단위 접근을
-- 소유자로 제한하므로, 권한을 줘도 남의 데이터는 보이지 않습니다.

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on
  public.cards,
  public.tags,
  public.card_tags,
  public.card_edits
  to anon, authenticated;

-- 앞으로 public 스키마에 추가되는 테이블에도 동일 권한 자동 부여
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated;
