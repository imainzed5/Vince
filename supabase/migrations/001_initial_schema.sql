-- Enable UUID generation
create extension if not exists "pgcrypto";

-- Workspaces
create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

-- Workspace members
create table if not exists workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz default now(),
  unique (workspace_id, user_id)
);

-- Projects
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'archived')),
  phase text not null default 'planning' check (phase in ('planning', 'in_progress', 'in_review', 'done')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

-- Milestones
create table if not exists milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  due_date date,
  created_at timestamptz default now()
);

-- Tasks
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  identifier text not null,
  title text not null,
  description text,
  status text not null default 'backlog' check (status in ('backlog', 'todo', 'in_progress', 'in_review', 'done')),
  priority text not null default 'none' check (priority in ('urgent', 'high', 'medium', 'none')),
  assignee_id uuid references auth.users(id) on delete set null,
  due_date date,
  is_blocked boolean default false,
  blocked_reason text,
  milestone_id uuid references milestones(id) on delete set null,
  position integer default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (project_id, identifier)
);

-- Task comments
create table if not exists task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamptz default now()
);

-- Notes
create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  content text default '',
  is_pinned boolean default false,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Messages (workspace-level and project-level chat)
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamptz default now()
);

-- Standup posts
create table if not exists standups (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  done text,
  next text,
  blockers text,
  created_at timestamptz default now()
);

-- Activity log
create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Attachments
create table if not exists attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  file_url text not null,
  file_name text not null,
  created_at timestamptz default now()
);

-- Project identifier counter (for generating project-prefixed task identifiers)
create table if not exists project_identifier_seq (
  project_id uuid primary key references projects(id) on delete cascade,
  last_seq integer default 0
);

-- Keep updated_at columns current
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists tasks_set_updated_at on tasks;
create trigger tasks_set_updated_at
before update on tasks
for each row execute function set_updated_at();

drop trigger if exists notes_set_updated_at on notes;
create trigger notes_set_updated_at
before update on notes
for each row execute function set_updated_at();

-- Enable RLS on all tables
alter table workspaces enable row level security;
alter table workspace_members enable row level security;
alter table projects enable row level security;
alter table milestones enable row level security;
alter table tasks enable row level security;
alter table task_comments enable row level security;
alter table notes enable row level security;
alter table messages enable row level security;
alter table standups enable row level security;
alter table activity_log enable row level security;
alter table attachments enable row level security;
alter table project_identifier_seq enable row level security;

-- Helper function: check if current user is a member of a workspace
create or replace function is_workspace_member(ws_id uuid)
returns boolean as $$
  select exists (
    select 1 from workspace_members
    where workspace_id = ws_id and user_id = auth.uid()
  );
$$ language sql security definer set search_path = public;

-- Workspaces: members can read, owners can update/delete
drop policy if exists workspace_select on workspaces;
create policy workspace_select on workspaces for select using (is_workspace_member(id));

drop policy if exists workspace_insert on workspaces;
create policy workspace_insert on workspaces for insert with check (auth.uid() = created_by);

drop policy if exists workspace_update on workspaces;
create policy workspace_update on workspaces for update using (
  exists (
    select 1 from workspace_members
    where workspace_id = workspaces.id and user_id = auth.uid() and role = 'owner'
  )
);

drop policy if exists workspace_delete on workspaces;
create policy workspace_delete on workspaces for delete using (
  exists (
    select 1 from workspace_members
    where workspace_id = workspaces.id and user_id = auth.uid() and role = 'owner'
  )
);

-- Workspace members: members can read their own workspace's members
drop policy if exists members_select on workspace_members;
create policy members_select on workspace_members for select using (is_workspace_member(workspace_id));

drop policy if exists members_insert on workspace_members;
create policy members_insert on workspace_members for insert with check (auth.uid() = user_id);

drop policy if exists members_update on workspace_members;
create policy members_update on workspace_members for update using (
  exists (
    select 1 from workspace_members wm
    where wm.workspace_id = workspace_members.workspace_id
      and wm.user_id = auth.uid()
      and wm.role = 'owner'
  )
);

drop policy if exists members_delete on workspace_members;
create policy members_delete on workspace_members for delete using (
  exists (
    select 1 from workspace_members wm
    where wm.workspace_id = workspace_members.workspace_id
      and wm.user_id = auth.uid()
      and wm.role = 'owner'
  )
);

-- Projects: workspace members only
drop policy if exists projects_select on projects;
create policy projects_select on projects for select using (is_workspace_member(workspace_id));

drop policy if exists projects_insert on projects;
create policy projects_insert on projects for insert with check (is_workspace_member(workspace_id));

drop policy if exists projects_update on projects;
create policy projects_update on projects for update using (is_workspace_member(workspace_id));

drop policy if exists projects_delete on projects;
create policy projects_delete on projects for delete using (is_workspace_member(workspace_id));

-- Milestones

drop policy if exists milestones_select on milestones;
create policy milestones_select on milestones for select using (
  exists (
    select 1 from projects p
    where p.id = milestones.project_id and is_workspace_member(p.workspace_id)
  )
);

drop policy if exists milestones_insert on milestones;
create policy milestones_insert on milestones for insert with check (
  exists (
    select 1 from projects p
    where p.id = milestones.project_id and is_workspace_member(p.workspace_id)
  )
);

drop policy if exists milestones_update on milestones;
create policy milestones_update on milestones for update using (
  exists (
    select 1 from projects p
    where p.id = milestones.project_id and is_workspace_member(p.workspace_id)
  )
);

drop policy if exists milestones_delete on milestones;
create policy milestones_delete on milestones for delete using (
  exists (
    select 1 from projects p
    where p.id = milestones.project_id and is_workspace_member(p.workspace_id)
  )
);

-- Tasks

drop policy if exists tasks_select on tasks;
create policy tasks_select on tasks for select using (
  exists (
    select 1 from projects p
    where p.id = tasks.project_id and is_workspace_member(p.workspace_id)
  )
);

drop policy if exists tasks_insert on tasks;
create policy tasks_insert on tasks for insert with check (
  exists (
    select 1 from projects p
    where p.id = tasks.project_id and is_workspace_member(p.workspace_id)
  )
);

drop policy if exists tasks_update on tasks;
create policy tasks_update on tasks for update using (
  exists (
    select 1 from projects p
    where p.id = tasks.project_id and is_workspace_member(p.workspace_id)
  )
);

drop policy if exists tasks_delete on tasks;
create policy tasks_delete on tasks for delete using (
  exists (
    select 1 from projects p
    where p.id = tasks.project_id and is_workspace_member(p.workspace_id)
  )
);

-- Task comments

drop policy if exists task_comments_select on task_comments;
create policy task_comments_select on task_comments for select using (
  exists (
    select 1
    from tasks t
    join projects p on p.id = t.project_id
    where t.id = task_comments.task_id and is_workspace_member(p.workspace_id)
  )
);

drop policy if exists task_comments_insert on task_comments;
create policy task_comments_insert on task_comments for insert with check (
  auth.uid() = user_id and
  exists (
    select 1
    from tasks t
    join projects p on p.id = t.project_id
    where t.id = task_comments.task_id and is_workspace_member(p.workspace_id)
  )
);

drop policy if exists task_comments_update on task_comments;
create policy task_comments_update on task_comments for update using (
  auth.uid() = user_id and
  exists (
    select 1
    from tasks t
    join projects p on p.id = t.project_id
    where t.id = task_comments.task_id and is_workspace_member(p.workspace_id)
  )
);

drop policy if exists task_comments_delete on task_comments;
create policy task_comments_delete on task_comments for delete using (
  auth.uid() = user_id or
  exists (
    select 1
    from tasks t
    join projects p on p.id = t.project_id
    where t.id = task_comments.task_id and is_workspace_member(p.workspace_id)
  )
);

-- Notes

drop policy if exists notes_select on notes;
create policy notes_select on notes for select using (
  exists (
    select 1 from projects p
    where p.id = notes.project_id and is_workspace_member(p.workspace_id)
  )
);

drop policy if exists notes_insert on notes;
create policy notes_insert on notes for insert with check (
  exists (
    select 1 from projects p
    where p.id = notes.project_id and is_workspace_member(p.workspace_id)
  )
);

drop policy if exists notes_update on notes;
create policy notes_update on notes for update using (
  exists (
    select 1 from projects p
    where p.id = notes.project_id and is_workspace_member(p.workspace_id)
  )
);

drop policy if exists notes_delete on notes;
create policy notes_delete on notes for delete using (
  exists (
    select 1 from projects p
    where p.id = notes.project_id and is_workspace_member(p.workspace_id)
  )
);

-- Messages

drop policy if exists messages_select on messages;
create policy messages_select on messages for select using (
  is_workspace_member(messages.workspace_id)
);

drop policy if exists messages_insert on messages;
create policy messages_insert on messages for insert with check (
  auth.uid() = user_id and is_workspace_member(messages.workspace_id)
);

drop policy if exists messages_update on messages;
create policy messages_update on messages for update using (
  auth.uid() = user_id and is_workspace_member(messages.workspace_id)
);

drop policy if exists messages_delete on messages;
create policy messages_delete on messages for delete using (
  auth.uid() = user_id and is_workspace_member(messages.workspace_id)
);

-- Standups

drop policy if exists standups_select on standups;
create policy standups_select on standups for select using (
  exists (
    select 1 from projects p
    where p.id = standups.project_id and is_workspace_member(p.workspace_id)
  )
);

drop policy if exists standups_insert on standups;
create policy standups_insert on standups for insert with check (
  auth.uid() = user_id and
  exists (
    select 1 from projects p
    where p.id = standups.project_id and is_workspace_member(p.workspace_id)
  )
);

drop policy if exists standups_update on standups;
create policy standups_update on standups for update using (
  auth.uid() = user_id and
  exists (
    select 1 from projects p
    where p.id = standups.project_id and is_workspace_member(p.workspace_id)
  )
);

drop policy if exists standups_delete on standups;
create policy standups_delete on standups for delete using (
  auth.uid() = user_id and
  exists (
    select 1 from projects p
    where p.id = standups.project_id and is_workspace_member(p.workspace_id)
  )
);

-- Activity log

drop policy if exists activity_log_select on activity_log;
create policy activity_log_select on activity_log for select using (
  is_workspace_member(activity_log.workspace_id)
);

drop policy if exists activity_log_insert on activity_log;
create policy activity_log_insert on activity_log for insert with check (
  is_workspace_member(activity_log.workspace_id)
);

drop policy if exists activity_log_update on activity_log;
create policy activity_log_update on activity_log for update using (
  false
);

drop policy if exists activity_log_delete on activity_log;
create policy activity_log_delete on activity_log for delete using (
  false
);

-- Attachments

drop policy if exists attachments_select on attachments;
create policy attachments_select on attachments for select using (
  exists (
    select 1
    from tasks t
    join projects p on p.id = t.project_id
    where t.id = attachments.task_id and is_workspace_member(p.workspace_id)
  )
);

drop policy if exists attachments_insert on attachments;
create policy attachments_insert on attachments for insert with check (
  auth.uid() = user_id and
  exists (
    select 1
    from tasks t
    join projects p on p.id = t.project_id
    where t.id = attachments.task_id and is_workspace_member(p.workspace_id)
  )
);

drop policy if exists attachments_update on attachments;
create policy attachments_update on attachments for update using (
  auth.uid() = user_id and
  exists (
    select 1
    from tasks t
    join projects p on p.id = t.project_id
    where t.id = attachments.task_id and is_workspace_member(p.workspace_id)
  )
);

drop policy if exists attachments_delete on attachments;
create policy attachments_delete on attachments for delete using (
  auth.uid() = user_id and
  exists (
    select 1
    from tasks t
    join projects p on p.id = t.project_id
    where t.id = attachments.task_id and is_workspace_member(p.workspace_id)
  )
);

-- Project identifier sequence

drop policy if exists identifier_seq_select on project_identifier_seq;
create policy identifier_seq_select on project_identifier_seq for select using (
  exists (
    select 1
    from projects p
    where p.id = project_identifier_seq.project_id
      and is_workspace_member(p.workspace_id)
  )
);

drop policy if exists identifier_seq_insert on project_identifier_seq;
create policy identifier_seq_insert on project_identifier_seq for insert with check (
  exists (
    select 1
    from projects p
    where p.id = project_identifier_seq.project_id
      and is_workspace_member(p.workspace_id)
  )
);

drop policy if exists identifier_seq_update on project_identifier_seq;
create policy identifier_seq_update on project_identifier_seq for update using (
  exists (
    select 1
    from projects p
    where p.id = project_identifier_seq.project_id
      and is_workspace_member(p.workspace_id)
  )
);

drop policy if exists identifier_seq_delete on project_identifier_seq;
create policy identifier_seq_delete on project_identifier_seq for delete using (
  false
);

-- Task identifier generator (for example CWR-01, DGP-02)
create or replace function generate_task_identifier(p_project_id uuid, p_prefix text)
returns text as $$
declare
  next_seq integer;
begin
  insert into project_identifier_seq (project_id, last_seq)
  values (p_project_id, 1)
  on conflict (project_id) do update
    set last_seq = project_identifier_seq.last_seq + 1
  returning last_seq into next_seq;

  return p_prefix || '-' || lpad(next_seq::text, 2, '0');
end;
$$ language plpgsql security definer set search_path = public;
