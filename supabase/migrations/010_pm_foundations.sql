alter table public.projects
  add column if not exists owner_id uuid references auth.users(id) on delete set null,
  add column if not exists target_date date,
  add column if not exists success_metric text,
  add column if not exists scope_summary text;

update public.projects
set owner_id = created_by
where owner_id is null;

create index if not exists projects_workspace_id_owner_id_idx
on public.projects (workspace_id, owner_id);

create table if not exists public.task_dependencies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  blocking_task_id uuid not null references public.tasks(id) on delete cascade,
  blocked_task_id uuid not null references public.tasks(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  unique (blocking_task_id, blocked_task_id),
  check (blocking_task_id <> blocked_task_id)
);

create index if not exists task_dependencies_project_id_idx
on public.task_dependencies (project_id);

create index if not exists task_dependencies_blocked_task_id_idx
on public.task_dependencies (blocked_task_id);

create index if not exists task_dependencies_blocking_task_id_idx
on public.task_dependencies (blocking_task_id);

create table if not exists public.project_shares (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  share_token text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists project_shares_project_id_idx
on public.project_shares (project_id, created_at desc);

alter table public.task_dependencies enable row level security;
alter table public.project_shares enable row level security;

drop policy if exists task_dependencies_select on public.task_dependencies;
create policy task_dependencies_select on public.task_dependencies
for select
using (
  exists (
    select 1
    from public.projects p
    where p.id = task_dependencies.project_id
      and public.is_workspace_member(p.workspace_id)
  )
);

drop policy if exists task_dependencies_insert on public.task_dependencies;
create policy task_dependencies_insert on public.task_dependencies
for insert
with check (
  auth.uid() = created_by
  and exists (
    select 1
    from public.projects p
    where p.id = task_dependencies.project_id
      and public.is_workspace_member(p.workspace_id)
  )
);

drop policy if exists task_dependencies_update on public.task_dependencies;
create policy task_dependencies_update on public.task_dependencies
for update
using (
  exists (
    select 1
    from public.projects p
    where p.id = task_dependencies.project_id
      and public.is_workspace_member(p.workspace_id)
  )
)
with check (
  exists (
    select 1
    from public.projects p
    where p.id = task_dependencies.project_id
      and public.is_workspace_member(p.workspace_id)
  )
);

drop policy if exists task_dependencies_delete on public.task_dependencies;
create policy task_dependencies_delete on public.task_dependencies
for delete
using (
  exists (
    select 1
    from public.projects p
    where p.id = task_dependencies.project_id
      and public.is_workspace_member(p.workspace_id)
  )
);

drop policy if exists project_shares_select on public.project_shares;
create policy project_shares_select on public.project_shares
for select
using (
  exists (
    select 1
    from public.projects p
    where p.id = project_shares.project_id
      and public.is_workspace_member(p.workspace_id)
  )
);

drop policy if exists project_shares_insert on public.project_shares;
create policy project_shares_insert on public.project_shares
for insert
with check (
  auth.uid() = created_by
  and exists (
    select 1
    from public.projects p
    where p.id = project_shares.project_id
      and public.is_workspace_member(p.workspace_id)
  )
);

drop policy if exists project_shares_update on public.project_shares;
create policy project_shares_update on public.project_shares
for update
using (
  exists (
    select 1
    from public.projects p
    where p.id = project_shares.project_id
      and public.is_workspace_member(p.workspace_id)
  )
)
with check (
  exists (
    select 1
    from public.projects p
    where p.id = project_shares.project_id
      and public.is_workspace_member(p.workspace_id)
  )
);

drop policy if exists project_shares_delete on public.project_shares;
create policy project_shares_delete on public.project_shares
for delete
using (
  exists (
    select 1
    from public.projects p
    where p.id = project_shares.project_id
      and public.is_workspace_member(p.workspace_id)
  )
);