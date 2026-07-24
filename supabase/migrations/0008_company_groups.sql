-- 0008_company_groups.sql
-- 회사 묶음: 명함에 찍힌 원래 회사명은 보존하고, 관리용 그룹만 따로 만든다.

create table if not exists public.company_groups (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid()
                references auth.users(id) on delete cascade,
  name        text not null,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (owner_id, name)
);

drop trigger if exists trg_company_groups_updated_at on public.company_groups;
create trigger trg_company_groups_updated_at
  before update on public.company_groups
  for each row execute function public.set_updated_at();

create table if not exists public.company_group_members (
  group_id            uuid not null references public.company_groups(id) on delete cascade,
  owner_id            uuid not null default auth.uid()
                        references auth.users(id) on delete cascade,
  company_normalized  text not null,
  display_name        text not null,
  created_at          timestamptz not null default now(),
  primary key (group_id, company_normalized),
  unique (owner_id, company_normalized)
);

create index if not exists idx_company_groups_owner
  on public.company_groups (owner_id, name);

create index if not exists idx_company_group_members_owner
  on public.company_group_members (owner_id, company_normalized);

create index if not exists idx_company_group_members_group
  on public.company_group_members (group_id);

alter table public.company_groups enable row level security;
alter table public.company_group_members enable row level security;

drop policy if exists company_groups_owner_all on public.company_groups;
create policy company_groups_owner_all on public.company_groups
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists company_group_members_owner_all on public.company_group_members;
create policy company_group_members_owner_all on public.company_group_members
  for all
  using (
    owner_id = auth.uid()
    and exists (
      select 1 from public.company_groups g
      where g.id = company_group_members.group_id
        and g.owner_id = auth.uid()
    )
  )
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.company_groups g
      where g.id = company_group_members.group_id
        and g.owner_id = auth.uid()
    )
  );

grant select, insert, update, delete on
  public.company_groups,
  public.company_group_members
  to anon, authenticated;
