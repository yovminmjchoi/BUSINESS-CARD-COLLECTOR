-- 0007_name_bilingual.sql
-- 성/이름 분리를 한글·영문 각각으로. 0006 의 family_name/given_name 을 *_ko 로 바꾸고
-- 영문 분리 컬럼 추가. 여러 번 실행해도 안전(rename 은 존재할 때만).

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_name = 'cards' and column_name = 'family_name') then
    alter table public.cards rename column family_name to family_name_ko;
  end if;
  if exists (select 1 from information_schema.columns
             where table_name = 'cards' and column_name = 'given_name') then
    alter table public.cards rename column given_name to given_name_ko;
  end if;
end $$;

alter table public.cards
  add column if not exists family_name_ko text,
  add column if not exists given_name_ko  text,
  add column if not exists family_name_en text,
  add column if not exists given_name_en  text;
