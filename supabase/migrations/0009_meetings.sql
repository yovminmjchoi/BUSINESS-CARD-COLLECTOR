-- 0009_meetings.sql
-- 미팅/활동 기록: 명함(사람)과 만난 일정 + Salesforce 식 활동기록 텍스트를 저장.
-- 명함 데이터는 그대로 두고, 미팅은 별도 레이어.

create table if not exists public.meetings (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid()
                 references auth.users(id) on delete cascade,
  card_id      uuid references public.cards(id) on delete set null,
  meeting_date date not null default current_date,
  activity     text not null default 'meeting',   -- dinner meeting / lunch / call / site visit ...
  raw_notes    text,                              -- 사용자가 적은 거친 메모
  sf_note      text,                              -- 생성된 Salesforce 활동기록(영문)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists trg_meetings_updated_at on public.meetings;
create trigger trg_meetings_updated_at
  before update on public.meetings
  for each row execute function public.set_updated_at();

create index if not exists idx_meetings_owner_date
  on public.meetings (owner_id, meeting_date desc);
create index if not exists idx_meetings_card
  on public.meetings (card_id);

alter table public.meetings enable row level security;

drop policy if exists meetings_owner_all on public.meetings;
create policy meetings_owner_all on public.meetings
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

grant select, insert, update, delete on public.meetings to anon, authenticated;
