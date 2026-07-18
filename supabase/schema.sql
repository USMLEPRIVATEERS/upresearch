-- ============================================================
-- Ward Academy Journal Club — Supabase schema
-- Run this whole file in the Supabase SQL Editor (Dashboard →
-- SQL Editor → New query → paste → Run). It is idempotent-ish:
-- safe to re-run on a fresh project.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Profiles (one row per registered member)
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  specialty   text not null default '',
  institution text not null default '',
  bio         text not null default '',
  avatar      text,   -- tiny base64 data URL (128px JPEG, ~4-8 KB), or null for initials
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Existing databases: add the avatar column if it isn't there yet.
alter table public.profiles add column if not exists avatar text;

-- Auto-create a profile when a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- 2. Articles (submitted by presenters)
-- ------------------------------------------------------------
create table if not exists public.articles (
  id           uuid primary key default gen_random_uuid(),
  presenter_id uuid not null references public.profiles (id) on delete cascade,
  title        text not null,
  article_url  text not null,          -- full manuscript link (journal, PMC, or Google Drive share link)
  study_design text not null,
  specialty    text not null,
  subspecialty text not null default '',
  summary      text not null,          -- "what caught your attention about this article"
  created_at   timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 3. Availabilities
--    One row = one member, one role, one 1-hour slot pattern.
--    kind = 'single'    → a specific date+hour (slot_start, UTC)
--    kind = 'recurring' → weekly pattern (weekday_utc 0=Sun, hour_utc 0-23)
--    open_ended = true  → member committed until they edit/remove it
--    open_ended = false → expires_at is set (~1 month after creation)
-- ------------------------------------------------------------
create table if not exists public.availabilities (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        text not null check (role in ('attendee', 'presenter', 'host')),
  kind        text not null check (kind in ('single', 'recurring')),
  slot_start  timestamptz,
  weekday_utc smallint,
  hour_utc    smallint,
  open_ended  boolean not null default false,
  expires_at  timestamptz,
  article_id  uuid references public.articles (id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint availability_shape check (
    (kind = 'single'    and slot_start is not null)
    or
    (kind = 'recurring' and weekday_utc between 0 and 6 and hour_utc between 0 and 23)
  ),
  constraint presenter_needs_article check (role <> 'presenter' or article_id is not null)
);

create index if not exists availabilities_user_idx  on public.availabilities (user_id);
create index if not exists availabilities_slot_idx  on public.availabilities (slot_start);

-- ------------------------------------------------------------
-- 4. Meetings (call link posted by a host for a specific slot)
--    The host can post the link days before OR the minute the
--    call starts — the home page picks it up on refresh.
-- ------------------------------------------------------------
create table if not exists public.meetings (
  id          uuid primary key default gen_random_uuid(),
  host_id     uuid not null references public.profiles (id) on delete cascade,
  slot_start  timestamptz not null unique,
  meeting_url text not null,
  notes       text not null default '',
  updated_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 5. Shared board (a single rich-text "mural" every member can edit;
--    changes stream to everyone via Supabase Realtime)
-- ------------------------------------------------------------
create table if not exists public.board (
  id         smallint primary key default 1 check (id = 1), -- single row
  content    text not null default '',
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.board (id) values (1) on conflict do nothing;

-- Stream board updates to connected members (idempotent).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'board'
  ) then
    alter publication supabase_realtime add table public.board;
  end if;
end $$;

-- ------------------------------------------------------------
-- 6. Session confirmations
--    A host confirms that a specific session actually took place.
--    A presenter's certificate is only issued once the session is
--    confirmed. One confirmation per slot (first host wins).
-- ------------------------------------------------------------
create table if not exists public.session_confirmations (
  slot_start   timestamptz primary key,
  confirmed_by uuid references public.profiles (id) on delete set null,
  confirmed_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 7. Row Level Security
--    Everything is readable by signed-in members only; each
--    member can only write their own rows.
-- ------------------------------------------------------------
alter table public.profiles              enable row level security;
alter table public.articles              enable row level security;
alter table public.availabilities        enable row level security;
alter table public.meetings              enable row level security;
alter table public.board                 enable row level security;
alter table public.session_confirmations enable row level security;

-- session confirmations (readable by all; a member records their own
-- confirmation — the UI only offers it to a host of that slot)
drop policy if exists "confirmations readable by members" on public.session_confirmations;
create policy "confirmations readable by members"
  on public.session_confirmations for select to authenticated using (true);

drop policy if exists "insert own confirmation" on public.session_confirmations;
create policy "insert own confirmation"
  on public.session_confirmations for insert to authenticated
  with check (confirmed_by = auth.uid());

drop policy if exists "delete own confirmation" on public.session_confirmations;
create policy "delete own confirmation"
  on public.session_confirmations for delete to authenticated
  using (confirmed_by = auth.uid());

-- board (the single row is seeded above; members can read and edit it)
drop policy if exists "board readable by members" on public.board;
create policy "board readable by members"
  on public.board for select to authenticated using (true);

drop policy if exists "board editable by members" on public.board;
create policy "board editable by members"
  on public.board for update to authenticated using (true) with check (true);

-- profiles
drop policy if exists "profiles readable by members" on public.profiles;
create policy "profiles readable by members"
  on public.profiles for select to authenticated using (true);

drop policy if exists "insert own profile" on public.profiles;
create policy "insert own profile"
  on public.profiles for insert to authenticated with check (id = auth.uid());

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- articles
drop policy if exists "articles readable by members" on public.articles;
create policy "articles readable by members"
  on public.articles for select to authenticated using (true);

drop policy if exists "insert own article" on public.articles;
create policy "insert own article"
  on public.articles for insert to authenticated with check (presenter_id = auth.uid());

drop policy if exists "update own article" on public.articles;
create policy "update own article"
  on public.articles for update to authenticated
  using (presenter_id = auth.uid()) with check (presenter_id = auth.uid());

drop policy if exists "delete own article" on public.articles;
create policy "delete own article"
  on public.articles for delete to authenticated using (presenter_id = auth.uid());

-- availabilities
drop policy if exists "availabilities readable by members" on public.availabilities;
create policy "availabilities readable by members"
  on public.availabilities for select to authenticated using (true);

drop policy if exists "insert own availability" on public.availabilities;
create policy "insert own availability"
  on public.availabilities for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "update own availability" on public.availabilities;
create policy "update own availability"
  on public.availabilities for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "delete own availability" on public.availabilities;
create policy "delete own availability"
  on public.availabilities for delete to authenticated using (user_id = auth.uid());

-- meetings
drop policy if exists "meetings readable by members" on public.meetings;
create policy "meetings readable by members"
  on public.meetings for select to authenticated using (true);

drop policy if exists "insert own meeting" on public.meetings;
create policy "insert own meeting"
  on public.meetings for insert to authenticated with check (host_id = auth.uid());

drop policy if exists "update own meeting" on public.meetings;
create policy "update own meeting"
  on public.meetings for update to authenticated
  using (host_id = auth.uid()) with check (host_id = auth.uid());

drop policy if exists "delete own meeting" on public.meetings;
create policy "delete own meeting"
  on public.meetings for delete to authenticated using (host_id = auth.uid());

-- ============================================================
-- 8. Research projects (collaborative research management)
--    Any signed-in member can create projects and collaborate.
--    Numeric (bigint) IDs keep the client code simple.
-- ============================================================
create table if not exists public.research_projects (
  id           bigint generated always as identity primary key,
  title        text not null,
  description  text not null default '',
  project_type text not null default 'double-arm',
  status       text not null default 'active',   -- active | completed
  tags         text[] not null default '{}',
  deadline     date,
  drive_link   text,
  participants uuid[] not null default '{}',
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.research_tasks (
  id             bigint generated always as identity primary key,
  project_id     bigint not null references public.research_projects (id) on delete cascade,
  title          text not null,
  stage          text not null default 'nova_tarefa',
  original_stage text,
  assigned_to    uuid references public.profiles (id) on delete set null,
  deadline       date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists research_tasks_project_idx on public.research_tasks (project_id);

create table if not exists public.research_project_folders (
  id                 bigint generated always as identity primary key,
  project_id         bigint not null references public.research_projects (id) on delete cascade,
  folder_name        text not null,
  folder_id          text not null,
  parent_folder_name text,
  folder_url         text,
  created_at         timestamptz not null default now()
);
create index if not exists research_folders_project_idx on public.research_project_folders (project_id);

create table if not exists public.research_project_files (
  id          bigint generated always as identity primary key,
  project_id  bigint not null references public.research_projects (id) on delete cascade,
  folder_id   bigint references public.research_project_folders (id) on delete cascade,
  file_name   text not null,
  file_id     text,
  file_url    text,
  mime_type   text,
  file_size   bigint,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists research_files_project_idx on public.research_project_files (project_id);

alter table public.research_projects       enable row level security;
alter table public.research_tasks          enable row level security;
alter table public.research_project_folders enable row level security;
alter table public.research_project_files   enable row level security;

-- Projects: everyone reads; you insert your own; participants/creator edit
-- (enforced in the UI); only the creator can delete.
drop policy if exists "research projects readable" on public.research_projects;
create policy "research projects readable"
  on public.research_projects for select to authenticated using (true);
drop policy if exists "insert own research project" on public.research_projects;
create policy "insert own research project"
  on public.research_projects for insert to authenticated with check (created_by = auth.uid());
drop policy if exists "update research project" on public.research_projects;
create policy "update research project"
  on public.research_projects for update to authenticated using (true) with check (true);
drop policy if exists "delete own research project" on public.research_projects;
create policy "delete own research project"
  on public.research_projects for delete to authenticated using (created_by = auth.uid());

-- Tasks / folders / files: collaborative — members read and write all.
do $$
declare t text;
begin
  foreach t in array array['research_tasks','research_project_folders','research_project_files'] loop
    execute format('drop policy if exists "read %1$s" on public.%1$s;', t);
    execute format('create policy "read %1$s" on public.%1$s for select to authenticated using (true);', t);
    execute format('drop policy if exists "insert %1$s" on public.%1$s;', t);
    execute format('create policy "insert %1$s" on public.%1$s for insert to authenticated with check (true);', t);
    execute format('drop policy if exists "update %1$s" on public.%1$s;', t);
    execute format('create policy "update %1$s" on public.%1$s for update to authenticated using (true) with check (true);', t);
    execute format('drop policy if exists "delete %1$s" on public.%1$s;', t);
    execute format('create policy "delete %1$s" on public.%1$s for delete to authenticated using (true);', t);
  end loop;
end $$;
