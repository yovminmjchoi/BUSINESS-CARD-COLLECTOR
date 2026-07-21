-- 0005_primary.sql
-- 사람(person_id) 그룹에서 "현재 명함" 지정용 플래그.
--   등록순(created_at)만으로는 실제 최신 명함을 알 수 없으므로(옛 명함을 나중에 넣을 수 있음)
--   사용자가 대표(현재) 명함을 직접 지정할 수 있게 함. 그룹당 하나만 true 로 유지(앱 로직).

alter table public.cards
  add column if not exists is_primary boolean not null default false;
