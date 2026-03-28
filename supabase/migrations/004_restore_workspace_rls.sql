-- Restore strict workspace isolation after the permissive reset hotfix in 003.

grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on table public.workspaces to authenticated, service_role;
grant select, insert, update, delete on table public.workspace_members to authenticated, service_role;
grant select, insert, update, delete on table public.projects to authenticated, service_role;
grant select, insert, update, delete on table public.milestones to authenticated, service_role;
grant select, insert, update, delete on table public.tasks to authenticated, service_role;
grant select, insert, update, delete on table public.task_comments to authenticated, service_role;
grant select, insert, update, delete on table public.notes to authenticated, service_role;
grant select, insert, update, delete on table public.messages to authenticated, service_role;
grant select, insert, update, delete on table public.standups to authenticated, service_role;
grant select, insert, update, delete on table public.activity_log to authenticated, service_role;
grant select, insert, update, delete on table public.attachments to authenticated, service_role;
grant select, insert, update, delete on table public.project_identifier_seq to authenticated, service_role;

revoke all on table public.workspaces from anon;
revoke all on table public.workspace_members from anon;
revoke all on table public.projects from anon;
revoke all on table public.milestones from anon;
revoke all on table public.tasks from anon;
revoke all on table public.task_comments from anon;
revoke all on table public.notes from anon;
revoke all on table public.messages from anon;
revoke all on table public.standups from anon;
revoke all on table public.activity_log from anon;
revoke all on table public.attachments from anon;
revoke all on table public.project_identifier_seq from anon;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.projects enable row level security;
alter table public.milestones enable row level security;
alter table public.tasks enable row level security;
alter table public.task_comments enable row level security;
alter table public.notes enable row level security;
alter table public.messages enable row level security;
alter table public.standups enable row level security;
alter table public.activity_log enable row level security;
alter table public.attachments enable row level security;
alter table public.project_identifier_seq enable row level security;

create or replace function public.is_workspace_member(ws_id uuid)
returns boolean as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = ws_id
      and user_id = auth.uid()
  );
$$ language sql security definer set search_path = public;

grant execute on function public.is_workspace_member(uuid) to authenticated, service_role;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'workspaces',
        'workspace_members',
        'projects',
        'milestones',
        'tasks',
        'task_comments',
        'notes',
        'messages',
        'standups',
        'activity_log',
        'attachments',
        'project_identifier_seq'
      )
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      policy_record.policyname,
      policy_record.tablename
    );
  end loop;
end;
$$;

drop policy if exists workspace_insert_authenticated on public.workspaces;
drop policy if exists workspace_select_authenticated on public.workspaces;
drop policy if exists members_insert_authenticated on public.workspace_members;
drop policy if exists members_select_authenticated on public.workspace_members;

drop policy if exists workspace_select on public.workspaces;
create policy workspace_select on public.workspaces
for select
using (public.is_workspace_member(id));

drop policy if exists workspace_insert on public.workspaces;
create policy workspace_insert on public.workspaces
for insert
with check (auth.uid() = created_by);

drop policy if exists workspace_update on public.workspaces;
create policy workspace_update on public.workspaces
for update
using (
  exists (
    select 1
    from public.workspace_members
    where workspace_id = workspaces.id
      and user_id = auth.uid()
      and role = 'owner'
  )
);

drop policy if exists workspace_delete on public.workspaces;
create policy workspace_delete on public.workspaces
for delete
using (
  exists (
    select 1
    from public.workspace_members
    where workspace_id = workspaces.id
      and user_id = auth.uid()
      and role = 'owner'
  )
);

drop policy if exists members_select on public.workspace_members;
create policy members_select on public.workspace_members
for select
using (public.is_workspace_member(workspace_id));

drop policy if exists members_insert on public.workspace_members;
create policy members_insert on public.workspace_members
for insert
with check (auth.uid() = user_id);

drop policy if exists members_update on public.workspace_members;
create policy members_update on public.workspace_members
for update
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspace_members.workspace_id
      and wm.user_id = auth.uid()
      and wm.role = 'owner'
  )
);

drop policy if exists members_delete on public.workspace_members;
create policy members_delete on public.workspace_members
for delete
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspace_members.workspace_id
      and wm.user_id = auth.uid()
      and wm.role = 'owner'
  )
);

create policy projects_select on public.projects
for select
using (public.is_workspace_member(workspace_id));

create policy projects_insert on public.projects
for insert
with check (public.is_workspace_member(workspace_id));

create policy projects_update on public.projects
for update
using (public.is_workspace_member(workspace_id));

create policy projects_delete on public.projects
for delete
using (public.is_workspace_member(workspace_id));

create policy milestones_select on public.milestones
for select
using (
  exists (
    select 1
    from public.projects p
    where p.id = milestones.project_id
      and public.is_workspace_member(p.workspace_id)
  )
);

create policy milestones_insert on public.milestones
for insert
with check (
  exists (
    select 1
    from public.projects p
    where p.id = milestones.project_id
      and public.is_workspace_member(p.workspace_id)
  )
);

create policy milestones_update on public.milestones
for update
using (
  exists (
    select 1
    from public.projects p
    where p.id = milestones.project_id
      and public.is_workspace_member(p.workspace_id)
  )
);

create policy milestones_delete on public.milestones
for delete
using (
  exists (
    select 1
    from public.projects p
    where p.id = milestones.project_id
      and public.is_workspace_member(p.workspace_id)
  )
);

create policy tasks_select on public.tasks
for select
using (
  exists (
    select 1
    from public.projects p
    where p.id = tasks.project_id
      and public.is_workspace_member(p.workspace_id)
  )
);

create policy tasks_insert on public.tasks
for insert
with check (
  exists (
    select 1
    from public.projects p
    where p.id = tasks.project_id
      and public.is_workspace_member(p.workspace_id)
  )
);

create policy tasks_update on public.tasks
for update
using (
  exists (
    select 1
    from public.projects p
    where p.id = tasks.project_id
      and public.is_workspace_member(p.workspace_id)
  )
);

create policy tasks_delete on public.tasks
for delete
using (
  exists (
    select 1
    from public.projects p
    where p.id = tasks.project_id
      and public.is_workspace_member(p.workspace_id)
  )
);

create policy task_comments_select on public.task_comments
for select
using (
  exists (
    select 1
    from public.tasks t
    join public.projects p on p.id = t.project_id
    where t.id = task_comments.task_id
      and public.is_workspace_member(p.workspace_id)
  )
);

create policy task_comments_insert on public.task_comments
for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.tasks t
    join public.projects p on p.id = t.project_id
    where t.id = task_comments.task_id
      and public.is_workspace_member(p.workspace_id)
  )
);

create policy task_comments_update on public.task_comments
for update
using (
  auth.uid() = user_id
  and exists (
    select 1
    from public.tasks t
    join public.projects p on p.id = t.project_id
    where t.id = task_comments.task_id
      and public.is_workspace_member(p.workspace_id)
  )
);

create policy task_comments_delete on public.task_comments
for delete
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.tasks t
    join public.projects p on p.id = t.project_id
    where t.id = task_comments.task_id
      and public.is_workspace_member(p.workspace_id)
  )
);

create policy notes_select on public.notes
for select
using (
  exists (
    select 1
    from public.projects p
    where p.id = notes.project_id
      and public.is_workspace_member(p.workspace_id)
  )
);

create policy notes_insert on public.notes
for insert
with check (
  exists (
    select 1
    from public.projects p
    where p.id = notes.project_id
      and public.is_workspace_member(p.workspace_id)
  )
);

create policy notes_update on public.notes
for update
using (
  exists (
    select 1
    from public.projects p
    where p.id = notes.project_id
      and public.is_workspace_member(p.workspace_id)
  )
);

create policy notes_delete on public.notes
for delete
using (
  exists (
    select 1
    from public.projects p
    where p.id = notes.project_id
      and public.is_workspace_member(p.workspace_id)
  )
);

create policy messages_select on public.messages
for select
using (public.is_workspace_member(messages.workspace_id));

create policy messages_insert on public.messages
for insert
with check (
  auth.uid() = user_id
  and public.is_workspace_member(messages.workspace_id)
);

create policy messages_update on public.messages
for update
using (
  auth.uid() = user_id
  and public.is_workspace_member(messages.workspace_id)
);

create policy messages_delete on public.messages
for delete
using (
  auth.uid() = user_id
  and public.is_workspace_member(messages.workspace_id)
);

create policy standups_select on public.standups
for select
using (
  exists (
    select 1
    from public.projects p
    where p.id = standups.project_id
      and public.is_workspace_member(p.workspace_id)
  )
);

create policy standups_insert on public.standups
for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.projects p
    where p.id = standups.project_id
      and public.is_workspace_member(p.workspace_id)
  )
);

create policy standups_update on public.standups
for update
using (
  auth.uid() = user_id
  and exists (
    select 1
    from public.projects p
    where p.id = standups.project_id
      and public.is_workspace_member(p.workspace_id)
  )
);

create policy standups_delete on public.standups
for delete
using (
  auth.uid() = user_id
  and exists (
    select 1
    from public.projects p
    where p.id = standups.project_id
      and public.is_workspace_member(p.workspace_id)
  )
);

create policy activity_log_select on public.activity_log
for select
using (public.is_workspace_member(activity_log.workspace_id));

create policy activity_log_insert on public.activity_log
for insert
with check (public.is_workspace_member(activity_log.workspace_id));

create policy activity_log_update on public.activity_log
for update
using (false);

create policy activity_log_delete on public.activity_log
for delete
using (false);

create policy attachments_select on public.attachments
for select
using (
  exists (
    select 1
    from public.tasks t
    join public.projects p on p.id = t.project_id
    where t.id = attachments.task_id
      and public.is_workspace_member(p.workspace_id)
  )
);

create policy attachments_insert on public.attachments
for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.tasks t
    join public.projects p on p.id = t.project_id
    where t.id = attachments.task_id
      and public.is_workspace_member(p.workspace_id)
  )
);

create policy attachments_update on public.attachments
for update
using (
  auth.uid() = user_id
  and exists (
    select 1
    from public.tasks t
    join public.projects p on p.id = t.project_id
    where t.id = attachments.task_id
      and public.is_workspace_member(p.workspace_id)
  )
);

create policy attachments_delete on public.attachments
for delete
using (
  auth.uid() = user_id
  and exists (
    select 1
    from public.tasks t
    join public.projects p on p.id = t.project_id
    where t.id = attachments.task_id
      and public.is_workspace_member(p.workspace_id)
  )
);

create policy identifier_seq_select on public.project_identifier_seq
for select
using (
  exists (
    select 1
    from public.projects p
    where p.id = project_identifier_seq.project_id
      and public.is_workspace_member(p.workspace_id)
  )
);

create policy identifier_seq_insert on public.project_identifier_seq
for insert
with check (
  exists (
    select 1
    from public.projects p
    where p.id = project_identifier_seq.project_id
      and public.is_workspace_member(p.workspace_id)
  )
);

create policy identifier_seq_update on public.project_identifier_seq
for update
using (
  exists (
    select 1
    from public.projects p
    where p.id = project_identifier_seq.project_id
      and public.is_workspace_member(p.workspace_id)
  )
);

create policy identifier_seq_delete on public.project_identifier_seq
for delete
using (false);