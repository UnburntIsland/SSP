-- 森循島 v1.4：教師後台 MVP
-- 班級代碼、派作業、學生自動送驗、教師驗收與班級總覽。

create table if not exists public.game_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '守護者' check (char_length(display_name) between 1 and 60),
  role text not null default 'student' check (role in ('student', 'teacher')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.game_classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.game_profiles(user_id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.game_class_members (
  class_id uuid not null references public.game_classes(id) on delete cascade,
  student_id uuid not null references public.game_profiles(user_id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'removed')),
  joined_at timestamptz not null default now(),
  primary key (class_id, student_id)
);

create table if not exists public.game_assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.game_classes(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 80),
  description text not null default '' check (char_length(description) <= 300),
  kind text not null check (kind in ('stage', 'quiz_count', 'correction_count')),
  target jsonb not null default '{}'::jsonb,
  due_at timestamptz,
  published_at timestamptz not null default now(),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.game_assignment_submissions (
  assignment_id uuid not null references public.game_assignments(id) on delete cascade,
  student_id uuid not null references public.game_profiles(user_id) on delete cascade,
  status text not null default 'in_progress' check (status in ('in_progress', 'pending_review', 'accepted', 'needs_revision')),
  progress integer not null default 0 check (progress >= 0),
  evidence jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references public.game_profiles(user_id) on delete set null,
  feedback text not null default '' check (char_length(feedback) <= 300),
  updated_at timestamptz not null default now(),
  primary key (assignment_id, student_id)
);

create index if not exists game_classes_teacher_idx on public.game_classes(teacher_id);
create index if not exists game_members_student_idx on public.game_class_members(student_id) where status = 'active';
create index if not exists game_assignments_class_idx on public.game_assignments(class_id, published_at desc) where active;
create index if not exists game_submissions_student_idx on public.game_assignment_submissions(student_id, updated_at desc);

alter table public.game_profiles enable row level security;
alter table public.game_profiles force row level security;
alter table public.game_classes enable row level security;
alter table public.game_classes force row level security;
alter table public.game_class_members enable row level security;
alter table public.game_class_members force row level security;
alter table public.game_assignments enable row level security;
alter table public.game_assignments force row level security;
alter table public.game_assignment_submissions enable row level security;
alter table public.game_assignment_submissions force row level security;

create or replace function public.game_teacher_owns_class(p_class_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.game_classes c
    where c.id = p_class_id and c.teacher_id = p_user_id and c.active
  );
$$;

create or replace function public.game_student_in_class(p_class_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.game_class_members m
    where m.class_id = p_class_id and m.student_id = p_user_id and m.status = 'active'
  );
$$;

create or replace function public.game_can_view_profile(p_profile_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_profile_id = p_user_id or exists (
    select 1
      from public.game_class_members m
      join public.game_classes c on c.id = m.class_id
     where m.student_id = p_profile_id
       and m.status = 'active'
       and c.teacher_id = p_user_id
       and c.active
  );
$$;

revoke all on function public.game_teacher_owns_class(uuid, uuid) from public;
revoke all on function public.game_student_in_class(uuid, uuid) from public;
revoke all on function public.game_can_view_profile(uuid, uuid) from public;
grant execute on function public.game_teacher_owns_class(uuid, uuid) to authenticated;
grant execute on function public.game_student_in_class(uuid, uuid) to authenticated;
grant execute on function public.game_can_view_profile(uuid, uuid) to authenticated;

drop policy if exists "Game profiles are visible to self or class teacher" on public.game_profiles;
create policy "Game profiles are visible to self or class teacher"
  on public.game_profiles for select to authenticated
  using (public.game_can_view_profile(user_id));

drop policy if exists "Classes are visible to teacher or active students" on public.game_classes;
create policy "Classes are visible to teacher or active students"
  on public.game_classes for select to authenticated
  using (teacher_id = (select auth.uid()) or public.game_student_in_class(id));

drop policy if exists "Memberships are visible to student or class teacher" on public.game_class_members;
create policy "Memberships are visible to student or class teacher"
  on public.game_class_members for select to authenticated
  using (student_id = (select auth.uid()) or public.game_teacher_owns_class(class_id));

drop policy if exists "Assignments are visible inside the class" on public.game_assignments;
create policy "Assignments are visible inside the class"
  on public.game_assignments for select to authenticated
  using (public.game_teacher_owns_class(class_id) or public.game_student_in_class(class_id));

drop policy if exists "Submissions are visible to student or class teacher" on public.game_assignment_submissions;
create policy "Submissions are visible to student or class teacher"
  on public.game_assignment_submissions for select to authenticated
  using (
    student_id = (select auth.uid()) or exists (
      select 1 from public.game_assignments a
      where a.id = assignment_id and public.game_teacher_owns_class(a.class_id)
    )
  );

revoke all on table public.game_profiles from anon, authenticated;
revoke all on table public.game_classes from anon, authenticated;
revoke all on table public.game_class_members from anon, authenticated;
revoke all on table public.game_assignments from anon, authenticated;
revoke all on table public.game_assignment_submissions from anon, authenticated;
grant select on table public.game_profiles to authenticated;
grant select on table public.game_classes to authenticated;
grant select on table public.game_class_members to authenticated;
grant select on table public.game_assignments to authenticated;
grant select on table public.game_assignment_submissions to authenticated;

create or replace function public.handle_new_game_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.game_profiles(user_id, display_name)
  values (
    new.id,
    left(coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(coalesce(new.email, '守護者'), '@', 1), '守護者'), 60)
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_game_profile on auth.users;
create trigger on_auth_user_created_game_profile
  after insert on auth.users
  for each row execute procedure public.handle_new_game_profile();

revoke all on function public.handle_new_game_profile() from public;

insert into public.game_profiles(user_id, display_name)
select id, left(coalesce(split_part(email, '@', 1), '守護者'), 60)
from auth.users
on conflict (user_id) do nothing;

create or replace function public.ensure_game_profile()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_email text;
  v_profile public.game_profiles%rowtype;
begin
  if v_user_id is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select email into v_email from auth.users where id = v_user_id;
  insert into public.game_profiles(user_id, display_name)
  values (v_user_id, left(coalesce(split_part(v_email, '@', 1), '守護者'), 60))
  on conflict (user_id) do nothing;
  select * into v_profile from public.game_profiles where user_id = v_user_id;
  return to_jsonb(v_profile);
end;
$$;

create or replace function public.create_game_class(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_role text;
  v_code text;
  v_row public.game_classes%rowtype;
  v_attempt integer := 0;
begin
  if v_user_id is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select role into v_role from public.game_profiles where user_id = v_user_id;
  if v_role <> 'teacher' then raise exception 'teacher role required' using errcode = '42501'; end if;
  p_name := trim(coalesce(p_name, ''));
  if char_length(p_name) < 2 or char_length(p_name) > 60 then raise exception 'class name must be 2 to 60 characters' using errcode = '22023'; end if;
  loop
    v_attempt := v_attempt + 1;
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text || v_user_id::text), 1, 6));
    exit when not exists (select 1 from public.game_classes where code = v_code);
    if v_attempt >= 20 then raise exception 'unable to create class code'; end if;
  end loop;
  insert into public.game_classes(teacher_id, name, code)
  values (v_user_id, p_name, v_code) returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.join_game_class(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_class public.game_classes%rowtype;
begin
  if v_user_id is null then raise exception 'authentication required' using errcode = '42501'; end if;
  p_code := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  select * into v_class from public.game_classes where code = p_code and active;
  if not found then raise exception 'class code not found' using errcode = '22023'; end if;
  if v_class.teacher_id = v_user_id then raise exception 'teacher already owns this class' using errcode = '22023'; end if;
  insert into public.game_class_members(class_id, student_id, status, joined_at)
  values (v_class.id, v_user_id, 'active', now())
  on conflict (class_id, student_id) do update set status = 'active', joined_at = now();
  return to_jsonb(v_class);
end;
$$;

create or replace function public.create_game_assignment(
  p_class_id uuid,
  p_title text,
  p_description text,
  p_kind text,
  p_target jsonb,
  p_due_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.game_assignments%rowtype;
  v_count integer;
  v_stage text;
begin
  if not public.game_teacher_owns_class(p_class_id) then raise exception 'class teacher required' using errcode = '42501'; end if;
  p_title := trim(coalesce(p_title, ''));
  p_description := trim(coalesce(p_description, ''));
  if char_length(p_title) < 2 or char_length(p_title) > 80 then raise exception 'assignment title must be 2 to 80 characters' using errcode = '22023'; end if;
  if char_length(p_description) > 300 then raise exception 'assignment description too long' using errcode = '22023'; end if;
  if p_kind = 'stage' then
    v_stage := p_target ->> 'stageId';
    if v_stage is null or v_stage !~ '^[a-z0-9_]{2,40}$' then raise exception 'invalid stage target' using errcode = '22023'; end if;
  elsif p_kind in ('quiz_count', 'correction_count') then
    begin v_count := (p_target ->> 'count')::integer;
    exception when others then raise exception 'invalid count target' using errcode = '22023'; end;
    if v_count < 1 or v_count > 100 then raise exception 'target count must be 1 to 100' using errcode = '22023'; end if;
  else
    raise exception 'unsupported assignment kind' using errcode = '22023';
  end if;
  insert into public.game_assignments(class_id, title, description, kind, target, due_at)
  values (p_class_id, p_title, p_description, p_kind, p_target, p_due_at)
  returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.report_game_assignment_progress(
  p_assignment_id uuid,
  p_progress integer,
  p_evidence jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_assignment public.game_assignments%rowtype;
  v_goal integer;
  v_goal_met boolean;
  v_row public.game_assignment_submissions%rowtype;
begin
  select * into v_assignment from public.game_assignments where id = p_assignment_id and active;
  if not found or not public.game_student_in_class(v_assignment.class_id, v_user_id) then
    raise exception 'active class membership required' using errcode = '42501';
  end if;
  p_progress := greatest(0, least(coalesce(p_progress, 0), 100000));
  if octet_length(coalesce(p_evidence, '{}'::jsonb)::text) > 8192 then raise exception 'evidence too large' using errcode = '22023'; end if;
  if v_assignment.kind = 'stage' then v_goal := 1;
  else v_goal := greatest(1, coalesce((v_assignment.target ->> 'count')::integer, 1)); end if;
  v_goal_met := p_progress >= v_goal;

  insert into public.game_assignment_submissions(
    assignment_id, student_id, status, progress, evidence, completed_at, updated_at
  ) values (
    p_assignment_id, v_user_id,
    case when v_goal_met then 'pending_review' else 'in_progress' end,
    p_progress, coalesce(p_evidence, '{}'::jsonb),
    case when v_goal_met then now() else null end, now()
  )
  on conflict (assignment_id, student_id) do update set
    progress = greatest(public.game_assignment_submissions.progress, excluded.progress),
    evidence = excluded.evidence,
    status = case
      when public.game_assignment_submissions.status = 'accepted' then 'accepted'
      when v_goal_met then 'pending_review'
      else public.game_assignment_submissions.status
    end,
    completed_at = case
      when public.game_assignment_submissions.completed_at is not null then public.game_assignment_submissions.completed_at
      when v_goal_met then now() else null
    end,
    reviewed_at = case when v_goal_met and public.game_assignment_submissions.status = 'needs_revision' then null else public.game_assignment_submissions.reviewed_at end,
    reviewed_by = case when v_goal_met and public.game_assignment_submissions.status = 'needs_revision' then null else public.game_assignment_submissions.reviewed_by end,
    feedback = case when v_goal_met and public.game_assignment_submissions.status = 'needs_revision' then '' else public.game_assignment_submissions.feedback end,
    updated_at = now()
  returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.review_game_assignment(
  p_assignment_id uuid,
  p_student_id uuid,
  p_decision text,
  p_feedback text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_class_id uuid;
  v_row public.game_assignment_submissions%rowtype;
begin
  select class_id into v_class_id from public.game_assignments where id = p_assignment_id and active;
  if v_class_id is null or not public.game_teacher_owns_class(v_class_id) then raise exception 'class teacher required' using errcode = '42501'; end if;
  if p_decision not in ('accepted', 'needs_revision') then raise exception 'invalid review decision' using errcode = '22023'; end if;
  p_feedback := left(trim(coalesce(p_feedback, '')), 300);
  update public.game_assignment_submissions
     set status = p_decision,
         reviewed_at = now(),
         reviewed_by = (select auth.uid()),
         feedback = p_feedback,
         updated_at = now()
   where assignment_id = p_assignment_id
     and student_id = p_student_id
     and status in ('pending_review', 'accepted', 'needs_revision')
  returning * into v_row;
  if not found then raise exception 'submission not ready for review' using errcode = '22023'; end if;
  return to_jsonb(v_row);
end;
$$;

revoke all on function public.ensure_game_profile() from public;
revoke all on function public.create_game_class(text) from public;
revoke all on function public.join_game_class(text) from public;
revoke all on function public.create_game_assignment(uuid, text, text, text, jsonb, timestamptz) from public;
revoke all on function public.report_game_assignment_progress(uuid, integer, jsonb) from public;
revoke all on function public.review_game_assignment(uuid, uuid, text, text) from public;
grant execute on function public.ensure_game_profile() to authenticated;
grant execute on function public.create_game_class(text) to authenticated;
grant execute on function public.join_game_class(text) to authenticated;
grant execute on function public.create_game_assignment(uuid, text, text, text, jsonb, timestamptz) to authenticated;
grant execute on function public.report_game_assignment_progress(uuid, integer, jsonb) to authenticated;
grant execute on function public.review_game_assignment(uuid, uuid, text, text) to authenticated;

comment on table public.game_classes is 'v1.4 教師建立的班級與六位班級代碼。';
comment on table public.game_assignments is 'v1.4 關卡、答題次數與訂正次數作業。';
comment on table public.game_assignment_submissions is 'v1.4 學生進度、自動送驗與教師驗收結果。';
