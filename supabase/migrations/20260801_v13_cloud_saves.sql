-- 森循島 v1.3：使用者隔離的跨裝置雲端存檔
-- 在 Supabase SQL Editor 執行一次；前端只使用 publishable/anon key。

create table if not exists public.game_saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  client_id text
);

alter table public.game_saves enable row level security;
alter table public.game_saves force row level security;

drop policy if exists "Players can read their own save" on public.game_saves;
create policy "Players can read their own save"
  on public.game_saves
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- 玩家可以經 RLS 讀自己的資料；寫入統一由下方 RPC 做 revision 檢查。
revoke all on table public.game_saves from anon, authenticated;
grant select on table public.game_saves to authenticated;

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
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid save payload' using errcode = '22023';
  end if;

  if octet_length(p_payload::text) > 1048576 then
    raise exception 'save payload exceeds 1 MB' using errcode = '22023';
  end if;

  begin
    v_schema_version := coalesce((p_payload ->> 'schemaVersion')::integer, 0);
  exception when invalid_text_representation then
    raise exception 'invalid schema version' using errcode = '22023';
  end;

  if v_schema_version < 1 or v_schema_version > 11 then
    raise exception 'unsupported schema version' using errcode = '22023';
  end if;

  select *
    into v_current
    from public.game_saves
   where user_id = v_user_id
   for update;

  if not found then
    insert into public.game_saves (user_id, payload, revision, updated_at, client_id)
    values (v_user_id, p_payload, 1, now(), left(coalesce(p_client_id, ''), 128))
    returning revision, updated_at into v_revision, v_updated_at;
  else
    -- p_force 表示玩家已在 UI 選擇本機版本，但仍不可跳過 revision
    -- 比對；若對話框開啟後第三台裝置又寫入，回傳新的衝突。
    if coalesce(p_base_revision, 0) <> v_current.revision then
      return jsonb_build_object(
        'status', 'conflict',
        'revision', v_current.revision,
        'updated_at', v_current.updated_at,
        'client_id', v_current.client_id,
        'payload', v_current.payload
      );
    end if;

    update public.game_saves
       set payload = p_payload,
           revision = v_current.revision + 1,
           updated_at = now(),
           client_id = left(coalesce(p_client_id, ''), 128)
     where user_id = v_user_id
     returning revision, updated_at into v_revision, v_updated_at;
  end if;

  return jsonb_build_object(
    'status', 'saved',
    'revision', v_revision,
    'updated_at', v_updated_at,
    'client_id', left(coalesce(p_client_id, ''), 128)
  );
end;
$$;

revoke all on function public.sync_game_save(jsonb, bigint, text, boolean) from public;
grant execute on function public.sync_game_save(jsonb, bigint, text, boolean) to authenticated;

comment on table public.game_saves is '森循島玩家跨裝置存檔；RLS 依 auth.uid() 隔離。';
comment on function public.sync_game_save(jsonb, bigint, text, boolean) is '以樂觀鎖 revision 寫入玩家自己的存檔，衝突時回傳雲端版本。';
