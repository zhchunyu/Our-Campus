-- Community attachments. Additive for Android 1.18 and older text-only clients.
-- Run after 01 and 09. Keep campus_submit_report's existing signature:
-- report attachments are stored in p_details.image_paths (JSON string array).
-- Storage is private: never store public/signed URLs in parent records.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-images', 'post-images', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.hall_messages
  add column if not exists image_paths text[] not null default '{}'::text[];
alter table public.hall_messages drop constraint if exists hall_messages_content_check;
alter table public.hall_messages add constraint hall_messages_content_check check (
  char_length(btrim(content)) <= 200
  and (char_length(btrim(content)) >= 1 or cardinality(image_paths) > 0)
);
-- Existing column-level grants remain restricted: no UPDATE to content/images.
grant insert(image_paths) on public.hall_messages to authenticated;
comment on column public.hall_messages.image_paths is
  'Up to 3 immutable private post-images object paths; text may be empty when images exist.';

-- Not an RPC. Only parent-table triggers can invoke this privileged validator.
-- Definer is necessary to check Storage object existence without its read policy
-- recursively querying the parent row being inserted. Authorization is still
-- enforced by the existing parent RLS/RPC and the author-prefixed object path.
create or replace function campus_private.validate_community_images()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  paths text[] := '{}'::text[];
  previous_paths text[] := '{}'::text[];
  item jsonb;
  image_path text;
  path_pattern constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|jpeg|png|webp)$';
begin
  if tg_table_schema <> 'public' or tg_table_name not in ('hall_messages', 'campus_reports') then
    raise exception 'Unsupported attachment parent' using errcode = '23514';
  end if;
  if tg_table_name = 'hall_messages' then
    paths := new.image_paths;
    if tg_op = 'UPDATE' then previous_paths := old.image_paths; end if;
    if paths is null or coalesce(array_ndims(paths), 1) <> 1
      or (cardinality(paths) > 0 and array_lower(paths, 1) <> 1) then
      raise exception '图片列表格式无效' using errcode = '23514';
    end if;
  else
    if new.details ? 'image_paths' then
      if jsonb_typeof(new.details) is distinct from 'object'
        or jsonb_typeof(new.details->'image_paths') is distinct from 'array' then
        raise exception '图片列表须为数组' using errcode = '23514';
      end if;
      if jsonb_array_length(new.details->'image_paths') > 3 then
        raise exception '每条发布最多添加 3 张图片' using errcode = '23514';
      end if;
      for item in select value from jsonb_array_elements(new.details->'image_paths') loop
        if jsonb_typeof(item) is distinct from 'string' then
          raise exception '图片路径须为字符串' using errcode = '23514';
        end if;
        paths := array_append(paths, item #>> '{}');
      end loop;
    end if;
    if tg_op = 'UPDATE' and old.details ? 'image_paths' then
      -- New valid arrays are immutable. Legacy text-only details remain valid.
      if jsonb_typeof(old.details->'image_paths') is distinct from 'array' then
        raise exception '原图片列表格式无效，请联系管理员' using errcode = '23514';
      end if;
      select coalesce(array_agg(value #>> '{}'), '{}'::text[]) into previous_paths
        from jsonb_array_elements(old.details->'image_paths');
    end if;
  end if;

  if cardinality(paths) > 3
    or cardinality(paths) <> (select count(distinct p) from unnest(paths) as t(p)) then
    raise exception '图片最多 3 张，不能包含空值或重复项' using errcode = '23514';
  end if;
  -- Also blocks a privileged update from swapping, appending, or removing images.
  -- Existing text-only rows cannot acquire images through a later UPDATE.
  if tg_op = 'UPDATE' then
    if paths is distinct from previous_paths
      or (cardinality(paths) > 0 and new.author_id is distinct from old.author_id) then
      raise exception '已发布内容不能更换图片，请重新发布' using errcode = '23514';
    end if;
    return new;
  end if;

  foreach image_path in array paths loop
    if image_path !~ path_pattern
      or split_part(image_path, '/', 1) <> new.author_id::text then
      raise exception '图片路径无效，或图片不属于当前发布者' using errcode = '23514';
    end if;
    if not exists (select 1 from storage.objects o
      where o.bucket_id = 'post-images' and o.name = image_path) then
      raise exception '图片尚未上传成功，请重试' using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function campus_private.validate_community_images() from public, anon, authenticated;

drop trigger if exists hall_validate_community_images on public.hall_messages;
create trigger hall_validate_community_images
  before insert or update of image_paths, author_id on public.hall_messages
  for each row execute function campus_private.validate_community_images();
drop trigger if exists report_validate_community_images on public.campus_reports;
create trigger report_validate_community_images
  before insert or update of details, author_id on public.campus_reports
  for each row execute function campus_private.validate_community_images();

-- Separate bucket-specific policies leave avatars/app-releases/legacy buckets alone.
-- No UPDATE policy: each upload uses a new random name and upsert:false.
drop policy if exists post_images_upload_own on storage.objects;
create policy post_images_upload_own on storage.objects for insert to authenticated
with check (
  bucket_id = 'post-images'
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|jpeg|png|webp)$'
  and split_part(name, '/', 1) = (select auth.uid())::text
);
drop policy if exists post_images_read_visible_parent on storage.objects;
create policy post_images_read_visible_parent on storage.objects for select to authenticated
using (
  bucket_id = 'post-images'
  and (
    split_part(name, '/', 1) = (select auth.uid())::text
    or exists (select 1 from public.hall_messages m
      where m.deleted_at is null and m.image_paths @> array[objects.name])
    or exists (select 1 from public.campus_reports r
      where r.details->'image_paths' ? objects.name)
  )
);
-- Both parent subqueries execute with caller RLS. Draft report images remain
-- available only to their author/manager, except lost/found statuses intentionally
-- visible under the existing campus_reports policy. No parent policy is changed.
drop policy if exists post_images_delete_unreferenced_own on storage.objects;
create policy post_images_delete_unreferenced_own on storage.objects for delete to authenticated
using (
  bucket_id = 'post-images'
  and split_part(name, '/', 1) = (select auth.uid())::text
  and not exists (select 1 from public.hall_messages m
    where m.image_paths @> array[objects.name])
  and not exists (select 1 from public.campus_reports r
    where r.details->'image_paths' ? objects.name)
);

-- Keep old text-only clients and all existing RPC signatures intact.
notify pgrst, 'reload schema';
commit;
