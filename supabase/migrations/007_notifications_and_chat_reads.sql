create table if not exists public.chat_read_states (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  scope_key text not null,
  last_read_at timestamptz not null default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists chat_read_states_user_id_scope_key_key
on public.chat_read_states (user_id, scope_key);

create index if not exists chat_read_states_workspace_id_user_id_idx
on public.chat_read_states (workspace_id, user_id);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  type text not null,
  title text not null,
  body text,
  metadata jsonb default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists notifications_user_id_workspace_id_created_at_idx
on public.notifications (user_id, workspace_id, created_at desc);

create index if not exists notifications_user_id_read_at_idx
on public.notifications (user_id, read_at);

alter table public.chat_read_states enable row level security;
alter table public.notifications enable row level security;

drop trigger if exists chat_read_states_set_updated_at on public.chat_read_states;
create trigger chat_read_states_set_updated_at
before update on public.chat_read_states
for each row execute function public.set_updated_at();

drop policy if exists chat_read_states_select on public.chat_read_states;
create policy chat_read_states_select on public.chat_read_states
for select
using (
  auth.uid() = user_id
  and public.is_workspace_member(workspace_id)
);

drop policy if exists chat_read_states_insert on public.chat_read_states;
create policy chat_read_states_insert on public.chat_read_states
for insert
with check (
  auth.uid() = user_id
  and public.is_workspace_member(workspace_id)
  and (
    project_id is null
    or exists (
      select 1
      from public.projects p
      where p.id = chat_read_states.project_id
        and p.workspace_id = chat_read_states.workspace_id
    )
  )
);

drop policy if exists chat_read_states_update on public.chat_read_states;
create policy chat_read_states_update on public.chat_read_states
for update
using (
  auth.uid() = user_id
  and public.is_workspace_member(workspace_id)
)
with check (
  auth.uid() = user_id
  and public.is_workspace_member(workspace_id)
  and (
    project_id is null
    or exists (
      select 1
      from public.projects p
      where p.id = chat_read_states.project_id
        and p.workspace_id = chat_read_states.workspace_id
    )
  )
);

drop policy if exists chat_read_states_delete on public.chat_read_states;
create policy chat_read_states_delete on public.chat_read_states
for delete
using (
  auth.uid() = user_id
  and public.is_workspace_member(workspace_id)
);

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
for select
using (
  auth.uid() = user_id
  and public.is_workspace_member(workspace_id)
);

drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications
for insert
with check (
  auth.uid() = actor_id
  and public.is_workspace_member(workspace_id)
  and exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = notifications.workspace_id
      and wm.user_id = notifications.user_id
  )
  and (
    project_id is null
    or exists (
      select 1
      from public.projects p
      where p.id = notifications.project_id
        and p.workspace_id = notifications.workspace_id
    )
  )
);

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
for update
using (
  auth.uid() = user_id
  and public.is_workspace_member(workspace_id)
)
with check (
  auth.uid() = user_id
  and public.is_workspace_member(workspace_id)
);

drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications
for delete
using (
  auth.uid() = user_id
  and public.is_workspace_member(workspace_id)
);