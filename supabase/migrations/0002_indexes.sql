-- 0002_indexes.sql
-- 조회 인덱스 + 부분 일치 검색(pg_trgm) + 전문검색(tsvector, simple).
-- 0001_init.sql 실행 후 이 파일을 실행하세요.
-- 한국어 형태소 분석기는 세팅이 무거우므로 simple + trigram 조합으로 처리합니다.

create extension if not exists pg_trgm;

-- ─────────────────────────────────────────────────────────────
-- 기본 조회 인덱스 (스키마 §3 명세)
-- ─────────────────────────────────────────────────────────────
create index if not exists idx_cards_owner        on public.cards (owner_id);
create index if not exists idx_cards_company_norm  on public.cards (company_normalized);
create index if not exists idx_cards_email_lower    on public.cards (lower(email));
create index if not exists idx_cards_mobile        on public.cards (mobile);
create index if not exists idx_cards_status        on public.cards (status);
create index if not exists idx_cards_created_at    on public.cards (created_at desc);

create index if not exists idx_card_tags_tag   on public.card_tags (tag_id);
create index if not exists idx_card_edits_card on public.card_edits (card_id, edited_at desc);

-- ─────────────────────────────────────────────────────────────
-- 부분 일치 검색 (pg_trgm GIN): 이름·회사·직함·이메일
--   검색바에서 ILIKE %q% / similarity() 둘 다 이 인덱스를 사용
-- ─────────────────────────────────────────────────────────────
create index if not exists idx_cards_name_ko_trgm      on public.cards using gin (name_ko            gin_trgm_ops);
create index if not exists idx_cards_name_en_trgm      on public.cards using gin (name_en            gin_trgm_ops);
create index if not exists idx_cards_company_ko_trgm    on public.cards using gin (company_ko          gin_trgm_ops);
create index if not exists idx_cards_company_en_trgm    on public.cards using gin (company_en          gin_trgm_ops);
create index if not exists idx_cards_company_norm_trgm  on public.cards using gin (company_normalized  gin_trgm_ops);
create index if not exists idx_cards_title_ko_trgm      on public.cards using gin (title_ko            gin_trgm_ops);
create index if not exists idx_cards_email_trgm        on public.cards using gin (email              gin_trgm_ops);

-- ─────────────────────────────────────────────────────────────
-- 전문검색 tsvector (생성 컬럼): name·company·title·notes 묶음
--   simple 사전 사용(언어 무관 토큰화). 부분 일치는 위 trgm 이 담당.
-- ─────────────────────────────────────────────────────────────
alter table public.cards
  add column if not exists search_tsv tsvector
  generated always as (
    to_tsvector('simple',
      coalesce(name_ko, '')      || ' ' ||
      coalesce(name_en, '')      || ' ' ||
      coalesce(company_ko, '')   || ' ' ||
      coalesce(company_en, '')   || ' ' ||
      coalesce(title_ko, '')     || ' ' ||
      coalesce(title_en, '')     || ' ' ||
      coalesce(person_note, '')  || ' ' ||
      coalesce(company_note, '')
    )
  ) stored;

create index if not exists idx_cards_search_tsv on public.cards using gin (search_tsv);
