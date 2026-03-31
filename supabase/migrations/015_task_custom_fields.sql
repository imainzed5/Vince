alter table public.tasks
  add column if not exists custom_fields jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_custom_fields_object_check'
  ) then
    alter table public.tasks
      add constraint tasks_custom_fields_object_check
      check (jsonb_typeof(custom_fields) = 'object');
  end if;
end
$$;

create table if not exists public.workspace_task_fields (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  name text not null,
  field_type text not null check (field_type in ('text', 'number', 'date', 'select')),
  options jsonb not null default '[]'::jsonb,
  position integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_task_fields_name_length_check check (char_length(btrim(name)) between 1 and 40),
  constraint workspace_task_fields_options_array_check check (jsonb_typeof(options) = 'array'),
  constraint workspace_task_fields_select_options_check check (
    (field_type = 'select' and jsonb_array_length(options) between 1 and 8) or
    (field_type <> 'select' and jsonb_array_length(options) = 0)
  ),
  constraint workspace_task_fields_workspace_position_key unique (workspace_id, position)
);

create index if not exists workspace_task_fields_workspace_id_idx
on public.workspace_task_fields (workspace_id, position asc, created_at asc);

create or replace function public.enforce_workspace_task_field_limit()
returns trigger
language plpgsql
as $$
begin
  if (
    select count(*)
    from public.workspace_task_fields wtf
    where wtf.workspace_id = new.workspace_id
      and wtf.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) >= 8 then
    raise exception 'A workspace can have at most 8 custom task fields.';
  end if;

  return new;
end;
$$;

drop trigger if exists workspace_task_fields_limit on public.workspace_task_fields;
create trigger workspace_task_fields_limit
before insert or update on public.workspace_task_fields
for each row execute function public.enforce_workspace_task_field_limit();

drop trigger if exists workspace_task_fields_set_updated_at on public.workspace_task_fields;
create trigger workspace_task_fields_set_updated_at
before update on public.workspace_task_fields
for each row execute function public.set_updated_at();

alter table public.workspace_task_fields enable row level security;

drop policy if exists workspace_task_fields_select on public.workspace_task_fields;
create policy workspace_task_fields_select on public.workspace_task_fields
for select
using (public.is_workspace_member(workspace_id));

drop policy if exists workspace_task_fields_insert on public.workspace_task_fields;
create policy workspace_task_fields_insert on public.workspace_task_fields
for insert
with check (
  auth.uid() = created_by and exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspace_task_fields.workspace_id
      and wm.user_id = auth.uid()
      and wm.role = 'owner'
  )
);

drop policy if exists workspace_task_fields_update on public.workspace_task_fields;
create policy workspace_task_fields_update on public.workspace_task_fields
for update
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspace_task_fields.workspace_id
      and wm.user_id = auth.uid()
      and wm.role = 'owner'
  )
)
with check (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspace_task_fields.workspace_id
      and wm.user_id = auth.uid()
      and wm.role = 'owner'
  )
);

drop policy if exists workspace_task_fields_delete on public.workspace_task_fields;
create policy workspace_task_fields_delete on public.workspace_task_fields
for delete
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspace_task_fields.workspace_id
      and wm.user_id = auth.uid()
      and wm.role = 'owner'
  )
);