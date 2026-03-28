-- Fix the join-workspace onboarding RPC for databases that already applied 008.

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

revoke all on function public.join_workspace_with_invite_code(text) from public;
grant execute on function public.join_workspace_with_invite_code(text) to authenticated, service_role;