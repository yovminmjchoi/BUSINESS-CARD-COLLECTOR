-- 0006_name.sql
-- 이름 성/이름 분리: 명함마다 표기가 제각각(민정 최 / 최민정 / Choi Min-jeong 등)이라
-- 성(family)·이름(given)을 별도 저장해 연락처(vCard) 정렬·표시를 정확히 함.
-- 한글 이름이 있으면 한글 기준, 없으면 영문 기준으로 Gemini 가 분리.

alter table public.cards
  add column if not exists family_name text,
  add column if not exists given_name text;
