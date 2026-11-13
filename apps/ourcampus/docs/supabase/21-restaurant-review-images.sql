-- Restaurant review photo attachments — reviewed release SQL.
-- Prerequisites: 11-restaurant-reviews.sql and 18-community-images.sql.
-- Status 2026-11-13: DEPLOYED as restaurant_review_private_photos (success=true).
-- 21-restaurant-review-images-regression.sql returned PASS and rolled back all
-- fixtures; 21-restaurant-review-images-preflight.sql confirms column/RPC/CHECK.
-- Actual Storage HTTP signing and phone photo upload acceptance remain pending.
-- Old text-only RPC, bucket privacy, grants and parent RLS remain valid.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $$ begin
  if to_regprocedure('public.campus_submit_restaurant_review(uuid,uuid,text,integer,text,text[],numeric)') is null
    or not exists(select 1 from storage.buckets where id='post-images' and not public
      and file_size_limit=5242880 and allowed_mime_types @> array['image/jpeg']) then
    raise exception 'Run the restaurant-review and private community-image prerequisites first';
  end if;
end $$;

alter table public.restaurant_reviews
  add column if not exists image_paths text[] not null default '{}'::text[];
comment on column public.restaurant_reviews.image_paths is
  'Up to 3 immutable owner-scoped private post-images paths, never public URLs or base64.';

-- NOT VALID first avoids an immediate validation scan while adding the rule.
-- New/updated rows are checked immediately; validate before this transaction
-- commits so a partially deployed/legacy column cannot silently bypass it.
alter table public.restaurant_reviews
  drop constraint if exists restaurant_reviews_image_paths_shape_check;
alter table public.restaurant_reviews
  add constraint restaurant_reviews_image_paths_shape_check check (
    image_paths is not null
    and cardinality(image_paths)<=3
    and coalesce(array_ndims(image_paths),1)=1
    and (cardinality(image_paths)=0 or array_lower(image_paths,1)=1)
  ) not valid;
alter table public.restaurant_reviews
  validate constraint restaurant_reviews_image_paths_shape_check;

create or replace function campus_private.validate_restaurant_review_images()
returns trigger language plpgsql security definer set search_path='' as $$
declare image_path text;
begin
  if tg_table_schema<>'public' or tg_table_name<>'restaurant_reviews' then
    raise exception 'Unsupported restaurant attachment parent' using errcode='23514';
  end if;
  if new.image_paths is null or coalesce(array_ndims(new.image_paths),1)<>1
    or (cardinality(new.image_paths)>0 and array_lower(new.image_paths,1)<>1)
    or cardinality(new.image_paths)>3
    or cardinality(new.image_paths)<>(select count(distinct p) from unnest(new.image_paths) t(p)) then
    raise exception '每条评价最多添加 3 张不同的照片' using errcode='23514';
  end if;
  if tg_op='UPDATE' then
    if new.image_paths is distinct from old.image_paths
      or (cardinality(new.image_paths)>0 and new.author_id is distinct from old.author_id) then
      raise exception '已发布评价不能更换照片，请撤回后重新发布' using errcode='23514';
    end if;
    return new;
  end if;
  foreach image_path in array new.image_paths loop
    if image_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]jpg$'
      or split_part(image_path,'/',1)<>new.author_id::text then
      raise exception '照片无效，或不属于当前发布者' using errcode='23514';
    end if;
    if not exists(select 1 from storage.objects o where o.bucket_id='post-images' and o.name=image_path) then
      raise exception '照片尚未上传完成，请重试' using errcode='23514';
    end if;
  end loop;
  return new;
end $$;
revoke all on function campus_private.validate_restaurant_review_images() from public,anon,authenticated;
drop trigger if exists restaurant_validate_review_images on public.restaurant_reviews;
create trigger restaurant_validate_review_images
  before insert or update of image_paths,author_id on public.restaurant_reviews
  for each row execute function campus_private.validate_restaurant_review_images();

-- Named separately instead of overloading/replacing the deployed text-only RPC.
create or replace function public.campus_submit_restaurant_review_with_images(
  p_client_id uuid,p_window_id uuid,p_restaurant_id text,p_rating integer,p_content text,
  p_tags text[] default '{}',p_price numeric default null,p_image_paths text[] default '{}')
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; nickname text; previous public.restaurant_reviews;
begin
  if auth.uid() is null then raise exception '请先登录，再发布评价'; end if;
  if p_image_paths is null then raise exception '照片引用无效'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,1));
  select * into previous from public.restaurant_reviews where author_id=auth.uid() and client_id=p_client_id;
  if found then
    if previous.window_id is distinct from p_window_id or previous.restaurant_id is distinct from p_restaurant_id
      or previous.rating is distinct from p_rating or previous.content is distinct from btrim(p_content)
      or previous.tags is distinct from coalesce(p_tags,'{}') or previous.price is distinct from round(p_price,2)
      or previous.image_paths is distinct from p_image_paths then
      raise exception '这次评价已保存；更改内容请重新打开评价表单';
    end if;
    return previous.id;
  end if;
  if not exists(select 1 from public.restaurant_windows where id=p_window_id and restaurant_id=p_restaurant_id) then raise exception '窗口已移除，请重新选择'; end if;
  if (select count(*) from public.restaurant_reviews where author_id=auth.uid() and created_at>now()-interval '1 minute')>=5 then raise exception '评价提交过于频繁，请稍后重试'; end if;
  select left(coalesce(nullif(btrim(p.nickname),''),'校园同学'),40) into nickname from public.profiles p where user_id=auth.uid();
  insert into public.restaurant_reviews(window_id,restaurant_id,author_id,author_name,client_id,rating,content,tags,price,image_paths)
    values(p_window_id,p_restaurant_id,auth.uid(),coalesce(nickname,'校园同学'),p_client_id,p_rating,btrim(p_content),coalesce(p_tags,'{}'),round(p_price,2),p_image_paths)
    returning id into result;
  return result;
end $$;
revoke all on function public.campus_submit_restaurant_review_with_images(uuid,uuid,text,integer,text,text[],numeric,text[]) from public,anon;
grant execute on function public.campus_submit_restaurant_review_with_images(uuid,uuid,text,integer,text,text[],numeric,text[]) to authenticated;

-- Add a parent-visible read path. Existing owner/hall/report policies are retained.
-- Review RLS only exposes visible reviews; withdrawn photos cannot gain a new URL
-- through this policy. Our client requests 300-second URLs; previously issued
-- URLs remain valid until their own expiry. RLS does not cap signer expiry and
-- cannot revoke a signed URL (or a copy already downloaded).
drop policy if exists post_images_read_visible_review on storage.objects;
create policy post_images_read_visible_review on storage.objects for select to authenticated
using(bucket_id='post-images' and exists(select 1 from public.restaurant_reviews r
  where r.status='visible' and r.image_paths @> array[objects.name]));

-- REPLACE the existing permissive delete policy, rather than adding another one:
-- permissive policies are ORed, so an extra rule would not protect referenced files.
drop policy if exists post_images_delete_unreferenced_own on storage.objects;
create policy post_images_delete_unreferenced_own on storage.objects for delete to authenticated
using(bucket_id='post-images' and split_part(name,'/',1)=(select auth.uid())::text
  and not exists(select 1 from public.hall_messages m where m.image_paths @> array[objects.name])
  and not exists(select 1 from public.campus_reports r where r.details->'image_paths' ? objects.name)
  and not exists(select 1 from public.restaurant_reviews r where r.image_paths @> array[objects.name]));
-- No direct review INSERT/UPDATE grants. No storage UPDATE/upsert. No public bucket.
notify pgrst,'reload schema';
commit;

-- Staging regression checklist (synthetic accounts/fixtures, always ROLLBACK):
-- 1. Old RPC creates a text-only row with image_paths={}; old read/withdraw still work.
-- 2. Upload 1/3 owned files, invoke new RPC, retry same client ID => same UUID/one row.
-- 3. Same client ID with changed paths fails; invalid/missing/foreign/duplicate/4 paths fail.
-- 4. Anonymous invoke/direct insert/update denied; caller cannot choose another author.
-- 5. Logged-in peer can sign visible review photos; cannot sign unreferenced foreign files.
-- 6. Peer signing is denied after withdrawal; original owner access remains as before.
-- 7. Owner cannot delete a visible review image; can delete an unreferenced upload.
--    As with the existing parent-RLS policies, a withdrawn row is invisible to
--    callers and no longer blocks owner deletion. Hall/report policies are unchanged.
-- 8. Service-role attempts to change image_paths/author on attached review fail trigger.
-- 9. Deleting a window removes its review references; any orphan cleanup remains owner-only.
