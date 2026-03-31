alter table public.task_comments
  add column if not exists is_decision boolean not null default false,
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

create index if not exists task_comments_task_id_created_at_idx
on public.task_comments (task_id, created_at);

create index if not exists task_comments_task_id_deleted_at_idx
on public.task_comments (task_id, deleted_at);