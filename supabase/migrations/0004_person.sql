-- 0004_person.sql
-- 사람 연결: 같은 사람의 명함(이직·부서이동 등)을 person_id 로 묶음.
--   각 명함은 기본적으로 자기만의 person_id(그룹 1개)를 가짐.
--   같은 person_id = 같은 사람. "같은 사람으로 연결" 시 기존 명함의 person_id 를 공유.
-- gen_random_uuid() 는 volatile 이라 기존 행마다 서로 다른 값이 채워짐(각자 독립 그룹).

alter table public.cards
  add column if not exists person_id uuid not null default gen_random_uuid();

create index if not exists idx_cards_person on public.cards (person_id);
