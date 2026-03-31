create table if not exists public.saved_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check (scope in ('project', 'my_tasks')),
  project_id uuid references public.projects(id) on delete cascade,
  name text not null,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint saved_views_scope_project_id_check check (
    (scope = 'project' and project_id is not null) or
    (scope = 'my_tasks' and project_id is null)
  ),
  unique (user_id, scope, project_id, name)
);

create index if not exists saved_views_user_id_scope_idx
on public.saved_views (user_id, scope, created_at desc);

create index if not exists saved_views_project_id_idx
on public.saved_views (project_id);

drop trigger if exists saved_views_set_updated_at on public.saved_views;
create trigger saved_views_set_updated_at
before update on public.saved_views
for each row execute function public.set_updated_at();

alter table public.saved_views enable row level security;

drop policy if exists saved_views_select on public.saved_views;
create policy saved_views_select on public.saved_views
for select
using (
  auth.uid() = user_id and (
    scope = 'my_tasks' or exists (
      select 1
      from public.projects p
      where p.id = saved_views.project_id
        and public.is_workspace_member(p.workspace_id)
    )
  )
);

drop policy if exists saved_views_insert on public.saved_views;
create policy saved_views_insert on public.saved_views
for insert
with check (
  auth.uid() = user_id and (
    scope = 'my_tasks' or exists (
      select 1
      from public.projects p
      where p.id = saved_views.project_id
        and public.is_workspace_member(p.workspace_id)
    )
  )
);

drop policy if exists saved_views_update on public.saved_views;
create policy saved_views_update on public.saved_views
for update
using (
  auth.uid() = user_id and (
    scope = 'my_tasks' or exists (
      select 1
      from public.projects p
      where p.id = saved_views.project_id
        and public.is_workspace_member(p.workspace_id)
    )
  )
)
with check (
  auth.uid() = user_id and (
    scope = 'my_tasks' or exists (
      select 1
      from public.projects p
      where p.id = saved_views.project_id
        and public.is_workspace_member(p.workspace_id)
    )
  )
);

drop policy if exists saved_views_delete on public.saved_views;
create policy saved_views_delete on public.saved_views
for delete
using (
  auth.uid() = user_id and (
    scope = 'my_tasks' or exists (
      select 1
      from public.projects p
      where p.id = saved_views.project_id
        and public.is_workspace_member(p.workspace_id)
    )
  )
);

create table if not exists public.project_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (workspace_id, name)
);

create index if not exists project_templates_workspace_id_idx
on public.project_templates (workspace_id, created_at desc);

drop trigger if exists project_templates_set_updated_at on public.project_templates;
create trigger project_templates_set_updated_at
before update on public.project_templates
for each row execute function public.set_updated_at();

alter table public.project_templates enable row level security;

drop policy if exists project_templates_select on public.project_templates;
create policy project_templates_select on public.project_templates
for select
using (public.is_workspace_member(workspace_id));

drop policy if exists project_templates_insert on public.project_templates;
create policy project_templates_insert on public.project_templates
for insert
with check (
  auth.uid() = created_by and exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = project_templates.workspace_id
      and wm.user_id = auth.uid()
      and wm.role = 'owner'
  )
);

drop policy if exists project_templates_update on public.project_templates;
create policy project_templates_update on public.project_templates
for update
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = project_templates.workspace_id
      and wm.user_id = auth.uid()
      and wm.role = 'owner'
  )
)
with check (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = project_templates.workspace_id
      and wm.user_id = auth.uid()
      and wm.role = 'owner'
  )
);

drop policy if exists project_templates_delete on public.project_templates;
create policy project_templates_delete on public.project_templates
for delete
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = project_templates.workspace_id
      and wm.user_id = auth.uid()
      and wm.role = 'owner'
  )
);