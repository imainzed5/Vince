create table if not exists public.project_status_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  health text not null check (health in ('on_track', 'at_risk', 'off_track')),
  headline text not null,
  summary text not null,
  risks text,
  next_steps text,
  created_at timestamptz not null default now()
);

create index if not exists project_status_updates_project_id_created_at_idx
on public.project_status_updates (project_id, created_at desc);

alter table public.project_status_updates enable row level security;

drop policy if exists project_status_updates_select on public.project_status_updates;
create policy project_status_updates_select on public.project_status_updates
for select
using (
  exists (
    select 1
    from public.projects p
    where p.id = project_status_updates.project_id
      and public.is_workspace_member(p.workspace_id)
  )
);

drop policy if exists project_status_updates_insert on public.project_status_updates;
create policy project_status_updates_insert on public.project_status_updates
for insert
with check (
  auth.uid() = user_id and exists (
    select 1
    from public.projects p
    join public.workspace_members wm
      on wm.workspace_id = p.workspace_id
    where p.id = project_status_updates.project_id
      and wm.user_id = auth.uid()
      and wm.role = 'owner'
  )
);

drop policy if exists project_status_updates_delete on public.project_status_updates;
create policy project_status_updates_delete on public.project_status_updates
for delete
using (
  exists (
    select 1
    from public.projects p
    join public.workspace_members wm
      on wm.workspace_id = p.workspace_id
    where p.id = project_status_updates.project_id
      and wm.user_id = auth.uid()
      and wm.role = 'owner'
  )
);