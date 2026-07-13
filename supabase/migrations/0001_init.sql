-- 0001_init.sql
-- BUSINESS-CARD-COLLECTOR 초기 스키마
--   테이블(cards / tags / card_tags / card_edits) + updated_at 트리거
--   + 전체 RLS(소유자 1명만 접근) + Storage 버킷(card-images) RLS
-- Supabase 대시보드 → SQL Editor 에 붙여넣어 실행하세요.
-- IF NOT EXISTS / OR REPLACE / DROP-CREATE 로 여러 번 실행해도 안전합니다.

-- ─────────────────────────────────────────────────────────────
-- 확장 & 공용 함수
-- ─────────────────────────────────────────────────────────────
create extension if not exists pgcrypto;   -- gen_random_uuid()

-- updated_at 자동 갱신
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- cards — 명함 본체
-- ─────────────────────────────────────────────────────────────
create table if not exists public.cards (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null default auth.uid()
                        references auth.users(id) on delete cascade,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  status              text not null default 'review_needed'
                        check (status in ('confirmed','review_needed','failed')),
  name_ko             text,
  name_en             text,
  company_ko          text,
  company_en          text,
  company_normalized  text,               -- 회사 그룹핑 키 (lib/normalize.ts)
  department          text,
  title_ko            text,
  title_en            text,
  mobile              text,               -- E.164
  office_phone        text,               -- E.164
  fax                 text,               -- E.164
  email               text,               -- 소문자 정규화
  website             text,
  address_ko          text,
  address_en          text,
  language            text check (language in ('ko','en','mixed')),
  confidence          text check (confidence in ('high','medium','low')),
  person_note         text,
  company_note        text,
  image_front_path    text,               -- Storage 경로: {owner_id}/{card_id}/front.jpg
  image_back_path     text,
  extraction_notes    text,               -- AI 판독 사유
  extraction_raw      jsonb               -- 원본 추출 JSON (재분석용)
);

drop trigger if exists trg_cards_updated_at on public.cards;
create trigger trg_cards_updated_at
  before update on public.cards
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- tags — 사용자 정의 태그
-- ─────────────────────────────────────────────────────────────
create table if not exists public.tags (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid()
                references auth.users(id) on delete cascade,
  name        text not null,
  color       text,
  created_at  timestamptz not null default now(),
  unique (owner_id, name)
);

-- ─────────────────────────────────────────────────────────────
-- card_tags — 명함 ↔ 태그 (다대다)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.card_tags (
  card_id  uuid not null references public.cards(id) on delete cascade,
  tag_id   uuid not null references public.tags(id)  on delete cascade,
  primary key (card_id, tag_id)
);

-- ─────────────────────────────────────────────────────────────
-- card_edits — 편집 이력
-- ─────────────────────────────────────────────────────────────
create table if not exists public.card_edits (
  id         uuid primary key default gen_random_uuid(),
  card_id    uuid not null references public.cards(id) on delete cascade,
  field      text not null,
  old_value  text,
  new_value  text,
  edited_at  timestamptz not null default now(),
  source     text not null default 'user_edit'
               check (source in ('ai_extract','user_edit'))
);

-- ─────────────────────────────────────────────────────────────
-- RLS — 모든 테이블. 소유자(auth.uid())만 접근.
--   cards·tags 는 owner_id 직접 비교.
--   card_tags·card_edits 는 부모 cards 의 소유권으로 판정.
-- ─────────────────────────────────────────────────────────────
alter table public.cards      enable row level security;
alter table public.tags       enable row level security;
alter table public.card_tags  enable row level security;
alter table public.card_edits enable row level security;

drop policy if exists cards_owner_all on public.cards;
create policy cards_owner_all on public.cards
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists tags_owner_all on public.tags;
create policy tags_owner_all on public.tags
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists card_tags_owner_all on public.card_tags;
create policy card_tags_owner_all on public.card_tags
  for all
  using (
    exists (select 1 from public.cards c
            where c.id = card_tags.card_id and c.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.cards c
            where c.id = card_tags.card_id and c.owner_id = auth.uid())
  );

drop policy if exists card_edits_owner_all on public.card_edits;
create policy card_edits_owner_all on public.card_edits
  for all
  using (
    exists (select 1 from public.cards c
            where c.id = card_edits.card_id and c.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.cards c
            where c.id = card_edits.card_id and c.owner_id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────
-- Storage: card-images 버킷 (Private) + RLS
--   경로 첫 세그먼트를 owner_id 로 강제 → {owner_id}/{card_id}/front.jpg
-- ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('card-images', 'card-images', false)
on conflict (id) do nothing;

drop policy if exists card_images_owner_select on storage.objects;
create policy card_images_owner_select on storage.objects
  for select
  using (
    bucket_id = 'card-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists card_images_owner_insert on storage.objects;
create policy card_images_owner_insert on storage.objects
  for insert
  with check (
    bucket_id = 'card-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists card_images_owner_update on storage.objects;
create policy card_images_owner_update on storage.objects
  for update
  using (
    bucket_id = 'card-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists card_images_owner_delete on storage.objects;
create policy card_images_owner_delete on storage.objects
  for delete
  using (
    bucket_id = 'card-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
