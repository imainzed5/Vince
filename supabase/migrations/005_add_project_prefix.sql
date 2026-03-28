create or replace function public.derive_project_prefix(project_name text)
returns text as $$
declare
  words text[];
  candidate text := '';
  compact text;
  idx integer;
begin
  words := array_remove(regexp_split_to_array(upper(coalesce(project_name, '')), '[^A-Z0-9]+'), '');

  if coalesce(array_length(words, 1), 0) >= 2 then
    for idx in 1..least(array_length(words, 1), 4) loop
      candidate := candidate || substr(words[idx], 1, 1);
    end loop;
  elsif coalesce(array_length(words, 1), 0) = 1 then
    candidate := substr(words[1], 1, 4);
  end if;

  compact := regexp_replace(upper(coalesce(project_name, '')), '[^A-Z0-9]+', '', 'g');

  if length(candidate) < 2 then
    candidate := substr(compact || 'PRJ', 1, 3);
  end if;

  if candidate = '' then
    candidate := 'PRJ';
  end if;

  return candidate;
end;
$$ language plpgsql immutable;

alter table public.projects add column if not exists prefix text;

with generated as (
  select
    id,
    workspace_id,
    public.derive_project_prefix(name) as base_prefix,
    row_number() over (
      partition by workspace_id, public.derive_project_prefix(name)
      order by created_at nulls first, id
    ) as prefix_ordinal
  from public.projects
), resolved as (
  select
    id,
    case
      when prefix_ordinal = 1 then base_prefix
      else left(base_prefix, greatest(2, 6 - length(prefix_ordinal::text))) || prefix_ordinal::text
    end as resolved_prefix
  from generated
)
update public.projects as projects
set prefix = resolved.resolved_prefix
from resolved
where projects.id = resolved.id
  and (projects.prefix is null or projects.prefix = '');

alter table public.projects alter column prefix set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'projects_prefix_format_check'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_prefix_format_check
      check (prefix ~ '^[A-Z0-9]{2,6}$');
  end if;
end;
$$;

create unique index if not exists projects_workspace_id_prefix_key
on public.projects (workspace_id, prefix);