-- Ensure table privileges and explicit policies exist after manual schema resets.

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on table public.workspaces to anon, authenticated, service_role;
grant select, insert, update, delete on table public.workspace_members to anon, authenticated, service_role;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

drop policy if exists workspace_insert_authenticated on public.workspaces;
create policy workspace_insert_authenticated on public.workspaces
for insert
to authenticated
with check (true);

drop policy if exists workspace_select_authenticated on public.workspaces;
create policy workspace_select_authenticated on public.workspaces
for select
to authenticated
using (true);

drop policy if exists members_insert_authenticated on public.workspace_members;
create policy members_insert_authenticated on public.workspace_members
for insert
to authenticated
with check (true);

drop policy if exists members_select_authenticated on public.workspace_members;
create policy members_select_authenticated on public.workspace_members
for select
to authenticated
using (true);
