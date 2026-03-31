alter table public.attachments
add column if not exists content_type text;
