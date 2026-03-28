insert into storage.buckets (id, name, public, file_size_limit)
values ('task-attachments', 'task-attachments', false, 52428800)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists task_attachments_select on storage.objects;
create policy task_attachments_select on storage.objects
for select
to authenticated
using (
  bucket_id = 'task-attachments'
  and exists (
    select 1
    from public.tasks t
    join public.projects p on p.id = t.project_id
    where t.id::text = (storage.foldername(name))[3]
      and public.is_workspace_member(p.workspace_id)
  )
);

drop policy if exists task_attachments_insert on storage.objects;
create policy task_attachments_insert on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'task-attachments'
  and auth.uid()::text = (storage.foldername(name))[4]
  and exists (
    select 1
    from public.tasks t
    join public.projects p on p.id = t.project_id
    where t.id::text = (storage.foldername(name))[3]
      and public.is_workspace_member(p.workspace_id)
  )
);

drop policy if exists task_attachments_delete on storage.objects;
create policy task_attachments_delete on storage.objects
for delete
to authenticated
using (
  bucket_id = 'task-attachments'
  and auth.uid()::text = (storage.foldername(name))[4]
  and exists (
    select 1
    from public.tasks t
    join public.projects p on p.id = t.project_id
    where t.id::text = (storage.foldername(name))[3]
      and public.is_workspace_member(p.workspace_id)
  )
);