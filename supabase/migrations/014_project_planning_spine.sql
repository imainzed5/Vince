alter table public.projects
  add column if not exists goal_statement text,
  add column if not exists key_outcomes jsonb not null default '[]'::jsonb;