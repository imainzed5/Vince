alter table public.tasks
  drop constraint if exists tasks_status_check;

create table if not exists public.workspace_task_statuses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  key text not null,
  label text not null,
  kind text not null check (kind in ('open', 'done')),
  color text not null check (color in ('slate', 'blue', 'amber', 'violet', 'emerald', 'rose', 'orange', 'cyan')),
  position integer not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_task_statuses_label_length_check check (char_length(btrim(label)) between 1 and 32),
  constraint workspace_task_statuses_key_length_check check (char_length(btrim(key)) between 1 and 48),
  constraint workspace_task_statuses_workspace_key_key unique (workspace_id, key),
  constraint workspace_task_statuses_workspace_position_key unique (workspace_id, position)
);

create index if not exists workspace_task_statuses_workspace_id_idx
on public.workspace_task_statuses (workspace_id, position asc, created_at asc);

create or replace function public.seed_workspace_task_statuses(p_workspace_id uuid)
returns void
language plpgsql
as $$
begin
  insert into public.workspace_task_statuses (workspace_id, created_by, key, label, kind, color, position, is_default)
  values
    (p_workspace_id, null, 'backlog', 'Backlog', 'open', 'slate', 0, true),
    (p_workspace_id, null, 'todo', 'Todo', 'open', 'blue', 1, true),
    (p_workspace_id, null, 'in_progress', 'In Progress', 'open', 'amber', 2, true),
    (p_workspace_id, null, 'in_review', 'In Review', 'open', 'violet', 3, true),
    (p_workspace_id, null, 'done', 'Done', 'done', 'emerald', 4, true)
  on conflict (workspace_id, key) do nothing;
end;
$$;

select public.seed_workspace_task_statuses(id)
from public.workspaces;

create or replace function public.ensure_workspace_task_status_seeded()
returns trigger
language plpgsql
as $$
begin
  perform public.seed_workspace_task_statuses(new.id);
  return new;
end;
$$;

drop trigger if exists workspaces_seed_task_statuses on public.workspaces;
create trigger workspaces_seed_task_statuses
after insert on public.workspaces
for each row execute function public.ensure_workspace_task_status_seeded();

create or replace function public.enforce_workspace_task_status_limit()
returns trigger
language plpgsql
as $$
begin
  if (
    select count(*)
    from public.workspace_task_statuses wts
    where wts.workspace_id = new.workspace_id
      and wts.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) >= 7 then
    raise exception 'A workspace can have at most 7 task statuses.';
  end if;

  return new;
end;
$$;

create or replace function public.prevent_last_task_status_delete()
returns trigger
language plpgsql
as $$
declare
  remaining_kind_count integer;
begin
  select count(*)
  into remaining_kind_count
  from public.workspace_task_statuses wts
  where wts.workspace_id = old.workspace_id
    and wts.kind = old.kind
    and wts.id <> old.id;

  if remaining_kind_count = 0 then
    raise exception 'A workspace must keep at least one % task status.', old.kind;
  end if;

  return old;
end;
$$;

create or replace function public.validate_task_status_membership()
returns trigger
language plpgsql
as $$
declare
  project_workspace_id uuid;
begin
  select p.workspace_id
  into project_workspace_id
  from public.projects p
  where p.id = new.project_id;

  if project_workspace_id is null then
    raise exception 'Task project is invalid.';
  end if;

  if not exists (
    select 1
    from public.workspace_task_statuses wts
    where wts.workspace_id = project_workspace_id
      and wts.key = new.status
  ) then
    raise exception 'Task status % is not configured for this workspace.', new.status;
  end if;

  return new;
end;
$$;

drop trigger if exists workspace_task_statuses_limit on public.workspace_task_statuses;
create trigger workspace_task_statuses_limit
before insert on public.workspace_task_statuses
for each row execute function public.enforce_workspace_task_status_limit();

drop trigger if exists workspace_task_statuses_set_updated_at on public.workspace_task_statuses;
create trigger workspace_task_statuses_set_updated_at
before update on public.workspace_task_statuses
for each row execute function public.set_updated_at();

drop trigger if exists workspace_task_statuses_guard_delete on public.workspace_task_statuses;
create trigger workspace_task_statuses_guard_delete
before delete on public.workspace_task_statuses
for each row execute function public.prevent_last_task_status_delete();

drop trigger if exists tasks_validate_status_membership on public.tasks;
create trigger tasks_validate_status_membership
before insert or update of status, project_id on public.tasks
for each row execute function public.validate_task_status_membership();

alter table public.workspace_task_statuses enable row level security;

drop policy if exists workspace_task_statuses_select on public.workspace_task_statuses;
create policy workspace_task_statuses_select on public.workspace_task_statuses
for select
using (public.is_workspace_member(workspace_id));

drop policy if exists workspace_task_statuses_insert on public.workspace_task_statuses;
create policy workspace_task_statuses_insert on public.workspace_task_statuses
for insert
with check (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspace_task_statuses.workspace_id
      and wm.user_id = auth.uid()
      and wm.role = 'owner'
  )
);

drop policy if exists workspace_task_statuses_update on public.workspace_task_statuses;
create policy workspace_task_statuses_update on public.workspace_task_statuses
for update
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspace_task_statuses.workspace_id
      and wm.user_id = auth.uid()
      and wm.role = 'owner'
  )
)
with check (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspace_task_statuses.workspace_id
      and wm.user_id = auth.uid()
      and wm.role = 'owner'
  )
);

drop policy if exists workspace_task_statuses_delete on public.workspace_task_statuses;
create policy workspace_task_statuses_delete on public.workspace_task_statuses
for delete
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspace_task_statuses.workspace_id
      and wm.user_id = auth.uid()
      and wm.role = 'owner'
  )
);