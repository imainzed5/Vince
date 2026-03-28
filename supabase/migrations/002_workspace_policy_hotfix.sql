-- Workspace insert policy hotfix
-- Allow any authenticated user to create a workspace.
drop policy if exists workspace_insert on workspaces;
create policy workspace_insert on workspaces
for insert
with check (auth.uid() is not null);

-- Workspace members insert policy hotfix
-- Allow authenticated users to insert membership rows during initial setup.
drop policy if exists members_insert on workspace_members;
create policy members_insert on workspace_members
for insert
with check (auth.uid() is not null);
