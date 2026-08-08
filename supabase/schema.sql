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
  -- See the "role set" migration below: this list grew after launch, and the
  -- alter statement is what updates an existing database.
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

-- Role set migration (safe to re-run). The club runs rotating roles that form
-- a ladder into presenting — question reader → methods checker → presenter —
-- plus standing organizer roles. `host` keeps its original meaning:
-- coordination (opens the room, posts the meeting link).
alter table public.availabilities drop constraint if exists availabilities_role_check;
alter table public.availabilities add constraint availabilities_role_check
  check (role in (
    'attendee', 'presenter', 'host',
    'methods_checker', 'question_reader',
    'scientific_lead', 'clinical_lead'
  ));

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

-- Members who signed up for a slot but did not actually attend. Recorded by the
-- organizing team when they confirm the session, so certificates and stats
-- reflect who was really there instead of who clicked "I'll attend".
create table if not exists public.session_absences (
  slot_start timestamptz not null,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  marked_by  uuid references public.profiles (id) on delete set null,
  marked_at  timestamptz not null default now(),
  primary key (slot_start, user_id)
);

alter table public.session_absences enable row level security;

drop policy if exists "absences readable by members" on public.session_absences;
create policy "absences readable by members"
  on public.session_absences for select to authenticated using (true);

-- Same trust model as the confirmations above: the UI only offers this to the
-- organizing team, and the row records who marked it.
drop policy if exists "insert absence" on public.session_absences;
create policy "insert absence"
  on public.session_absences for insert to authenticated
  with check (marked_by = auth.uid());

drop policy if exists "delete absence" on public.session_absences;
create policy "delete absence"
  on public.session_absences for delete to authenticated
  using (marked_by = auth.uid());

-- Single days a member cannot make, even though a weekly recurrence says they
-- can. One row = one calendar day off; it silently removes that member from
-- every slot falling on that day, without touching the recurrence itself.
-- `day` is a calendar date in `tz` (the timezone the member was using when they
-- added it), because the same date means different UTC instants per timezone.
create table if not exists public.availability_exceptions (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  day        date not null,
  tz         text not null default 'UTC',
  note       text,
  created_at timestamptz not null default now(),
  unique (user_id, day)
);

create index if not exists availability_exceptions_day_idx
  on public.availability_exceptions (day);

alter table public.availability_exceptions enable row level security;

-- Readable by everyone: the whole club's slot expansion has to know about them,
-- otherwise a slot would still show someone who already said they can't make it.
drop policy if exists "exceptions readable by members" on public.availability_exceptions;
create policy "exceptions readable by members"
  on public.availability_exceptions for select to authenticated using (true);

drop policy if exists "insert own exception" on public.availability_exceptions;
create policy "insert own exception"
  on public.availability_exceptions for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "delete own exception" on public.availability_exceptions;
create policy "delete own exception"
  on public.availability_exceptions for delete to authenticated
  using (user_id = auth.uid());

-- When a task was actually ticked off. `updated_at` moves on any edit, so it
-- can't answer "was this delivered before the deadline" — this can.
alter table public.research_tasks
  add column if not exists completed_at timestamptz;

-- ============================================================
-- 10. Rank scores
-- Research projects are private to their team, so a member reading the table
-- directly sees only their own — and the leaderboard would show a different
-- number to every viewer. This view runs with the owner's privileges (the
-- Postgres default for views), so it returns the same counts to everyone.
-- It exposes counts only: no titles, no descriptions, no links.
-- ============================================================
-- How much a task actually costs. The stage IS the task type here, so the
-- weight comes straight from it — no extra field for anyone to fill in or get
-- wrong. Screening a thousand abstracts and downloading PDFs are not the same
-- job, and a flat score said they were.
create or replace function public.task_weight(stage text) returns text
language sql immutable as $$
  select case
    when stage = any (array[
      'extracao_dados',        -- hours per study, across dozens of studies
      'leitura_completa',      -- full texts read against the criteria
      'revisores_1_2',         -- screening the whole search yield
      'risco_vies_1_2',        -- RoB instrument applied study by study
      'analise_estatistica',
      'analises_adicionais',   -- subgroup, sensitivity, meta-regression
      'escrever_protocolo',
      'escrever_methods',
      'escrever_results',
      'escrever_discussion',   -- the section that takes the longest
      'responder_revisores',
      'escrever_rebuttal'
    ]) then 'heavy'
    when stage = any (array[
      'nova_tarefa',           -- a placeholder, not work
      'exportar_databases',
      'desduplicar',
      'baixando_pdfs',
      'escrever_references',   -- the reference manager does it
      'ultimos_ajustes'
    ]) then 'light'
    else 'medium'
  end;
$$;

-- Dropped rather than replaced: the column set changed, and `create or replace
-- view` refuses that on a view that already exists.
drop view if exists public.research_scores;

create view public.research_scores as
with t as (
  select
    tk.assigned_to as user_id,
    -- A finished task carries its type in original_stage; stage is by then
    -- just 'tarefa_concluida'.
    public.task_weight(coalesce(nullif(tk.original_stage, ''), tk.stage)) as weight,
    tk.stage = 'tarefa_concluida' as done,
    case
      when tk.deadline is null then true
      else (coalesce(tk.completed_at, tk.updated_at))::date <= tk.deadline
    end as on_time,
    tk.deadline is not null and tk.deadline < current_date as past_due
  from public.research_tasks tk
  where tk.assigned_to is not null
),
pr as (
  select
    rp.id, rp.created_by, rp.participants, rp.status,
    -- One click creates a row; this is what makes it a project. Until it has
    -- work in it or someone else on it, starting it earns nothing.
    (exists (select 1 from public.research_tasks x where x.project_id = rp.id)
     or coalesce(array_length(rp.participants, 1), 0) > 1) as real_project
  from public.research_projects rp
)
select
  p.id as user_id,
  (select count(*) from pr where pr.created_by = p.id and pr.real_project) as projects_created,
  (select count(*) from pr where p.id = any (pr.participants)
     and pr.created_by is distinct from p.id) as projects_joined,
  (select count(*) from pr where pr.created_by = p.id and pr.real_project
     and pr.status = 'completed') as projects_completed_created,
  (select count(*) from pr where p.id = any (pr.participants)
     and pr.created_by is distinct from p.id and pr.status = 'completed') as projects_completed_joined,
  (select count(*) from t where t.user_id = p.id and t.done and t.on_time and t.weight = 'light') as tasks_light_on_time,
  (select count(*) from t where t.user_id = p.id and t.done and not t.on_time and t.weight = 'light') as tasks_light_late,
  (select count(*) from t where t.user_id = p.id and t.done and t.on_time and t.weight = 'medium') as tasks_medium_on_time,
  (select count(*) from t where t.user_id = p.id and t.done and not t.on_time and t.weight = 'medium') as tasks_medium_late,
  (select count(*) from t where t.user_id = p.id and t.done and t.on_time and t.weight = 'heavy') as tasks_heavy_on_time,
  (select count(*) from t where t.user_id = p.id and t.done and not t.on_time and t.weight = 'heavy') as tasks_heavy_late,
  (select count(*) from t where t.user_id = p.id and not t.done and t.past_due) as tasks_overdue
from public.profiles p;

grant select on public.research_scores to authenticated;
grant execute on function public.task_weight(text) to authenticated;

-- "Not yet" on the presenter queue. One row per member who asked to skip their
-- turn; they drop off the list until another session is actually held, then
-- come back in the same position. Deleting the row means "I'm ready now".
create table if not exists public.presenter_passes (
  user_id   uuid primary key references public.profiles (id) on delete cascade,
  passed_at timestamptz not null default now(),
  note      text
);

alter table public.presenter_passes enable row level security;

-- Readable by everyone: the queue is a shared list, so it has to look the same
-- to the whole club.
drop policy if exists "passes readable by members" on public.presenter_passes;
create policy "passes readable by members"
  on public.presenter_passes for select to authenticated using (true);

drop policy if exists "insert own pass" on public.presenter_passes;
create policy "insert own pass"
  on public.presenter_passes for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "update own pass" on public.presenter_passes;
create policy "update own pass"
  on public.presenter_passes for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "delete own pass" on public.presenter_passes;
create policy "delete own pass"
  on public.presenter_passes for delete to authenticated
  using (user_id = auth.uid());

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

-- Projects are PRIVATE to their team: only the creator and accepted co-authors
-- (listed in participants) can read or edit a project. Others discover work only
-- through the open-positions board (see section 9). Only the creator can delete.
drop policy if exists "research projects readable" on public.research_projects;
drop policy if exists "read own research projects" on public.research_projects;
create policy "read own research projects"
  on public.research_projects for select to authenticated
  using (created_by = auth.uid() or auth.uid() = any (participants));
drop policy if exists "insert own research project" on public.research_projects;
create policy "insert own research project"
  on public.research_projects for insert to authenticated with check (created_by = auth.uid());
drop policy if exists "update research project" on public.research_projects;
create policy "update research project"
  on public.research_projects for update to authenticated
  using (created_by = auth.uid() or auth.uid() = any (participants))
  with check (created_by = auth.uid() or auth.uid() = any (participants));
drop policy if exists "delete own research project" on public.research_projects;
create policy "delete own research project"
  on public.research_projects for delete to authenticated using (created_by = auth.uid());

-- Tasks / folders / files: readable and writable only by members of the parent
-- project (creator or a participant). Mirrors the project's privacy.
do $$
declare t text;
  member_check text := 'exists (select 1 from public.research_projects p '
                    || 'where p.id = %1$s.project_id '
                    || 'and (p.created_by = auth.uid() or auth.uid() = any (p.participants)))';
begin
  foreach t in array array['research_tasks','research_project_folders','research_project_files'] loop
    execute format('drop policy if exists "read %1$s" on public.%1$s;', t);
    execute format('create policy "read %1$s" on public.%1$s for select to authenticated using (' || member_check || ');', t);
    execute format('drop policy if exists "insert %1$s" on public.%1$s;', t);
    execute format('create policy "insert %1$s" on public.%1$s for insert to authenticated with check (' || member_check || ');', t);
    execute format('drop policy if exists "update %1$s" on public.%1$s;', t);
    execute format('create policy "update %1$s" on public.%1$s for update to authenticated using (' || member_check || ') with check (' || member_check || ');', t);
    execute format('drop policy if exists "delete %1$s" on public.%1$s;', t);
    execute format('create policy "delete %1$s" on public.%1$s for delete to authenticated using (' || member_check || ');', t);
  end loop;
end $$;


-- ============================================================================
-- 9. Co-author recruitment ("open positions" board)
--    A project owner can post an anonymous call for co-authors that shows only
--    their name + specialty + what help is needed — never the project title or
--    links. Members apply with a WhatsApp number and a short pitch; the owner
--    reviews applications and, on acceptance, adds the applicant to the project
--    (which is the only way the applicant then gains access to it).
-- ============================================================================

create table if not exists public.research_recruitments (
  id           bigint generated always as identity primary key,
  project_id   bigint not null references public.research_projects (id) on delete cascade,
  created_by   uuid not null references public.profiles (id) on delete cascade,
  specialty    text not null,
  help_area    text,
  status       text not null default 'open',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists research_recruitments_status_idx on public.research_recruitments (status);
create index if not exists research_recruitments_project_idx on public.research_recruitments (project_id);

create table if not exists public.research_applications (
  id             bigint generated always as identity primary key,
  recruitment_id bigint not null references public.research_recruitments (id) on delete cascade,
  project_id     bigint not null references public.research_projects (id) on delete cascade,
  applicant_id   uuid not null references public.profiles (id) on delete cascade,
  whatsapp       text,
  pitch          text,
  status         text not null default 'pending',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (recruitment_id, applicant_id)
);
create index if not exists research_applications_recruitment_idx on public.research_applications (recruitment_id);
create index if not exists research_applications_applicant_idx on public.research_applications (applicant_id);

alter table public.research_recruitments enable row level security;
alter table public.research_applications enable row level security;

-- Recruitments: any signed-in member can read the board; only a project's
-- creator can post/edit/close/remove a call for that project.
drop policy if exists "read recruitments" on public.research_recruitments;
create policy "read recruitments"
  on public.research_recruitments for select to authenticated using (true);
drop policy if exists "insert own recruitment" on public.research_recruitments;
create policy "insert own recruitment"
  on public.research_recruitments for insert to authenticated
  with check (created_by = auth.uid()
              and exists (select 1 from public.research_projects p
                          where p.id = project_id and p.created_by = auth.uid()));
drop policy if exists "update own recruitment" on public.research_recruitments;
create policy "update own recruitment"
  on public.research_recruitments for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());
drop policy if exists "delete own recruitment" on public.research_recruitments;
create policy "delete own recruitment"
  on public.research_recruitments for delete to authenticated using (created_by = auth.uid());

-- Applications: the applicant sees their own; the recruitment owner sees the
-- applications to their calls. Applicants create their own; only the owner
-- changes status (accept/reject). Either side may delete (withdraw / dismiss).
drop policy if exists "read relevant applications" on public.research_applications;
create policy "read relevant applications"
  on public.research_applications for select to authenticated
  using (applicant_id = auth.uid()
         or exists (select 1 from public.research_recruitments r
                    where r.id = recruitment_id and r.created_by = auth.uid()));
drop policy if exists "insert own application" on public.research_applications;
create policy "insert own application"
  on public.research_applications for insert to authenticated
  with check (applicant_id = auth.uid());
drop policy if exists "owner updates application" on public.research_applications;
create policy "owner updates application"
  on public.research_applications for update to authenticated
  using (exists (select 1 from public.research_recruitments r
                 where r.id = recruitment_id and r.created_by = auth.uid()))
  with check (exists (select 1 from public.research_recruitments r
                      where r.id = recruitment_id and r.created_by = auth.uid()));
drop policy if exists "applicant or owner deletes application" on public.research_applications;
create policy "applicant or owner deletes application"
  on public.research_applications for delete to authenticated
  using (applicant_id = auth.uid()
         or exists (select 1 from public.research_recruitments r
                    where r.id = recruitment_id and r.created_by = auth.uid()));
