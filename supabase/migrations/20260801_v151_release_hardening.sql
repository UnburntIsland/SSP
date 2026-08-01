-- 森循島 v1.5.1：伺服器校時、學習事件稽核與 schema 12 雲端存檔。

create table if not exists public.game_learning_events (
  student_id uuid not null references public.game_profiles(user_id) on delete cascade,
  event_id text not null check (char_length(event_id) between 8 and 80),
  kind text not null check (kind in ('stage_clear', 'quiz_answer', 'correction')),
  subject_id text not null check (char_length(subject_id) between 1 and 80),
  correct boolean not null default false,
  amount integer not null default 1 check (amount between 1 and 100),
  legacy boolean not null default false,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  primary key (student_id, event_id)
);

create index if not exists game_learning_events_student_kind_idx
  on public.game_learning_events(student_id, kind, received_at desc);

alter table public.game_learning_events enable row level security;
alter table public.game_learning_events force row level security;
revoke all on table public.game_learning_events from anon, authenticated;

create or replace function public.get_game_server_time()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$ select now(); $$;

revoke all on function public.get_game_server_time() from public;
grant execute on function public.get_game_server_time() to authenticated;

create or replace function public.record_game_learning_events(p_events jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_event jsonb;
  v_event_id text;
  v_kind text;
  v_subject_id text;
  v_correct boolean;
  v_amount integer;
  v_legacy boolean;
  v_occurred_at timestamptz;
  v_daily_count integer;
  v_inserted integer := 0;
  v_row_count integer;
begin
  if v_user_id is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if jsonb_typeof(p_events) <> 'array' then raise exception 'events must be an array' using errcode = '22023'; end if;
  if jsonb_array_length(p_events) > 100 then raise exception 'too many learning events' using errcode = '22023'; end if;

  select count(*) into v_daily_count
    from public.game_learning_events
   where student_id = v_user_id and received_at >= date_trunc('day', now());
  if v_daily_count + jsonb_array_length(p_events) > 500 then
    raise exception 'daily learning event limit reached' using errcode = '22023';
  end if;

  for v_event in select value from jsonb_array_elements(p_events)
  loop
    v_event_id := left(coalesce(v_event ->> 'id', ''), 80);
    v_kind := coalesce(v_event ->> 'kind', '');
    v_subject_id := left(coalesce(v_event ->> 'subjectId', ''), 80);
    v_correct := coalesce((v_event ->> 'correct')::boolean, false);
    v_legacy := coalesce((v_event ->> 'legacy')::boolean, false);
    begin v_amount := coalesce((v_event ->> 'amount')::integer, 1);
    exception when invalid_text_representation then v_amount := 1; end;
    v_amount := case when v_legacy then greatest(1, least(v_amount, 100)) else 1 end;

    if char_length(v_event_id) < 8 or v_kind not in ('stage_clear', 'quiz_answer', 'correction') or char_length(v_subject_id) < 1 then
      raise exception 'invalid learning event' using errcode = '22023';
    end if;
    begin v_occurred_at := (v_event ->> 'occurredAt')::timestamptz;
    exception when others then v_occurred_at := now(); end;
    if not v_legacy and (v_occurred_at > now() + interval '5 minutes' or v_occurred_at < now() - interval '7 days') then
      v_occurred_at := now();
    end if;

    insert into public.game_learning_events(
      student_id, event_id, kind, subject_id, correct, amount, legacy, occurred_at
    ) values (
      v_user_id, v_event_id, v_kind, v_subject_id, v_correct, v_amount, v_legacy, v_occurred_at
    ) on conflict (student_id, event_id) do nothing;
    get diagnostics v_row_count = row_count;
    v_inserted := v_inserted + v_row_count;
  end loop;

  return jsonb_build_object('accepted', v_inserted, 'received', jsonb_array_length(p_events), 'server_time', now());
end;
$$;

revoke all on function public.record_game_learning_events(jsonb) from public;
grant execute on function public.record_game_learning_events(jsonb) to authenticated;

create or replace function public.refresh_game_assignment_progress(
  p_assignment_id uuid,
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
  v_progress integer := 0;
  v_goal_met boolean;
  v_event_count integer := 0;
  v_legacy_count integer := 0;
  v_evidence jsonb;
  v_row public.game_assignment_submissions%rowtype;
begin
  select * into v_assignment from public.game_assignments where id = p_assignment_id and active;
  if not found or not public.game_student_in_class(v_assignment.class_id, v_user_id) then
    raise exception 'active class membership required' using errcode = '42501';
  end if;

  if v_assignment.kind = 'stage' then
    v_goal := 1;
    select case when exists (
      select 1 from public.game_learning_events
       where student_id = v_user_id and kind = 'stage_clear'
         and subject_id = coalesce(v_assignment.target ->> 'stageId', '')
    ) then 1 else 0 end into v_progress;
  elsif v_assignment.kind = 'correction_count' then
    v_goal := greatest(1, coalesce((v_assignment.target ->> 'count')::integer, 1));
    select coalesce(sum(amount), 0)::integer into v_progress
      from public.game_learning_events where student_id = v_user_id and kind = 'correction';
  else
    v_goal := greatest(1, coalesce((v_assignment.target ->> 'count')::integer, 1));
    select coalesce(sum(amount), 0)::integer into v_progress
      from public.game_learning_events where student_id = v_user_id and kind = 'quiz_answer';
  end if;

  select count(*), count(*) filter (where legacy)
    into v_event_count, v_legacy_count
    from public.game_learning_events where student_id = v_user_id;
  v_goal_met := v_progress >= v_goal;
  v_evidence := coalesce(p_evidence, '{}'::jsonb) || jsonb_build_object(
    'source', 'server_event_log',
    'eventCount', v_event_count,
    'legacyEventCount', v_legacy_count,
    'serverVerifiedAt', now()
  );
  if octet_length(v_evidence::text) > 8192 then raise exception 'evidence too large' using errcode = '22023'; end if;

  insert into public.game_assignment_submissions(
    assignment_id, student_id, status, progress, evidence, completed_at, updated_at
  ) values (
    p_assignment_id, v_user_id,
    case when v_goal_met then 'pending_review' else 'in_progress' end,
    v_progress, v_evidence, case when v_goal_met then now() else null end, now()
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

revoke all on function public.refresh_game_assignment_progress(uuid, jsonb) from public;
grant execute on function public.refresh_game_assignment_progress(uuid, jsonb) to authenticated;

-- 舊版客戶端仍可呼叫原 RPC，但 p_progress 不再被信任，改由伺服器事件重新計算。
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
begin
  return public.refresh_game_assignment_progress(p_assignment_id, p_evidence);
end;
$$;

revoke all on function public.report_game_assignment_progress(uuid, integer, jsonb) from public;
grant execute on function public.report_game_assignment_progress(uuid, integer, jsonb) to authenticated;

create or replace function public.sync_game_save(
  p_payload jsonb,
  p_base_revision bigint,
  p_client_id text,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_current public.game_saves%rowtype;
  v_revision bigint;
  v_updated_at timestamptz;
  v_schema_version integer;
begin
  if v_user_id is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'invalid save payload' using errcode = '22023'; end if;
  if octet_length(p_payload::text) > 1048576 then raise exception 'save payload exceeds 1 MB' using errcode = '22023'; end if;
  begin v_schema_version := coalesce((p_payload ->> 'schemaVersion')::integer, 0);
  exception when invalid_text_representation then raise exception 'invalid schema version' using errcode = '22023'; end;
  if v_schema_version < 1 or v_schema_version > 12 then raise exception 'unsupported schema version' using errcode = '22023'; end if;

  select * into v_current from public.game_saves where user_id = v_user_id for update;
  if not found then
    insert into public.game_saves(user_id, payload, revision, updated_at, client_id)
    values(v_user_id, p_payload, 1, now(), left(coalesce(p_client_id, ''), 128))
    returning revision, updated_at into v_revision, v_updated_at;
  else
    if coalesce(p_base_revision, 0) <> v_current.revision and not p_force then
      return jsonb_build_object('status', 'conflict', 'revision', v_current.revision, 'updated_at', v_current.updated_at, 'client_id', v_current.client_id, 'payload', v_current.payload);
    end if;
    update public.game_saves
       set payload = p_payload, revision = v_current.revision + 1, updated_at = now(), client_id = left(coalesce(p_client_id, ''), 128)
     where user_id = v_user_id
     returning revision, updated_at into v_revision, v_updated_at;
  end if;
  return jsonb_build_object('status', 'saved', 'revision', v_revision, 'updated_at', v_updated_at, 'client_id', left(coalesce(p_client_id, ''), 128));
end;
$$;

revoke all on function public.sync_game_save(jsonb, bigint, text, boolean) from public;
grant execute on function public.sync_game_save(jsonb, bigint, text, boolean) to authenticated;

comment on table public.game_learning_events is 'v1.5.1：伺服器保存的關卡、答題與訂正事件；作業進度由此表計算。';
comment on function public.refresh_game_assignment_progress(uuid, jsonb) is 'v1.5.1：忽略前端累積數字，從學習事件重新計算作業進度。';
comment on function public.sync_game_save(jsonb, bigint, text, boolean) is 'v1.5.1：以 revision 樂觀鎖寫入 schema 1–12 玩家存檔。';
