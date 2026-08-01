-- 森循島 v1.5：允許 schema 11 的土地擴張與島嶼空間存檔。
-- 保留 v1.3 的使用者隔離、1 MB 上限與 revision 樂觀鎖。

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
    if coalesce(p_base_revision, 0) <> v_current.revision and not p_force then
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

comment on function public.sync_game_save(jsonb, bigint, text, boolean) is
  'v1.5：以 revision 樂觀鎖寫入 schema 1–11 的玩家存檔。';
