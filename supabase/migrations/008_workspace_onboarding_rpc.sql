-- Keep workspace onboarding compatible with strict workspace RLS.

create or replace function public.generate_workspace_invite_code(p_length integer default 8)
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  generated_code text := '';
  position integer;
begin
  if p_length is null or p_length < 4 then
    p_length := 8;
  end if;

  for position in 1..p_length loop
    generated_code := generated_code || substr(
      alphabet,
      1 + floor(random() * length(alphabet))::integer,
      1
    );
  end loop;

  return generated_code;
end;
$$;

create or replace function public.create_workspace_with_owner(p_name text)
returns table (workspace_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_name text := btrim(coalesce(p_name, ''));
  new_workspace_id uuid;
  generated_code text;
begin
  if current_user_id is null then
    raise exception 'Authentication required.' using errcode = 'P0001';
  end if;

  if normalized_name = '' then
    raise exception 'Workspace name is required.' using errcode = 'P0001';
  end if;

  loop
    generated_code := public.generate_workspace_invite_code();

    begin
      insert into public.workspaces (name, invite_code, created_by)
      values (normalized_name, generated_code, current_user_id)
      returning id into new_workspace_id;

      exit;
    exception
      when unique_violation then
        continue;
    end;
  end loop;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_workspace_id, current_user_id, 'owner');

  insert into public.activity_log (workspace_id, actor_id, action, metadata)
  values (
    new_workspace_id,
    current_user_id,
    'member.joined',
    jsonb_build_object('userId', current_user_id::text)
  );

  return query select new_workspace_id;
end;
$$;

create or replace function public.join_workspace_with_invite_code(p_invite_code text)
returns table (workspace_id uuid, already_member boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_invite_code text := upper(btrim(coalesce(p_invite_code, '')));
  matched_workspace_id uuid;
  membership_row_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'Authentication required.' using errcode = 'P0001';
  end if;

  if normalized_invite_code = '' then
    raise exception 'Invite code is required.' using errcode = 'P0001';
  end if;

  select workspaces.id
  into matched_workspace_id
  from public.workspaces
  where workspaces.invite_code = normalized_invite_code
  limit 1;

  if matched_workspace_id is null then
    raise exception 'Invite code not found.' using errcode = 'P0001';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (matched_workspace_id, current_user_id, 'member')
  on conflict on constraint workspace_members_workspace_id_user_id_key do nothing;

  get diagnostics membership_row_count = row_count;

  if membership_row_count > 0 then
    insert into public.activity_log (workspace_id, actor_id, action, metadata)
    values (
      matched_workspace_id,
      current_user_id,
      'member.joined',
      jsonb_build_object('userId', current_user_id::text)
    );
  end if;

  return query
  select matched_workspace_id, membership_row_count = 0;
end;
$$;

revoke all on function public.generate_workspace_invite_code(integer) from public, anon, authenticated;

revoke all on function public.create_workspace_with_owner(text) from public;
grant execute on function public.create_workspace_with_owner(text) to authenticated, service_role;

revoke all on function public.join_workspace_with_invite_code(text) from public;
grant execute on function public.join_workspace_with_invite_code(text) to authenticated, service_role;