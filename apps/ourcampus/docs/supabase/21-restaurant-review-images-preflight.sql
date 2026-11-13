-- READ ONLY. No user/account content or object names. Run before and after deploy.
-- Companion migration: 21-restaurant-review-images.sql.
-- Status 2026-11-13: deployed; column/RPC/CHECK and RLS/private bucket checks
-- are true, direct-write checks false. Legacy RPC fingerprints are unchanged.
with checks as (select jsonb_build_object(
  'photo_column_present',exists(select 1 from information_schema.columns
    where table_schema='public' and table_name='restaurant_reviews' and column_name='image_paths'
      and udt_name='_text' and is_nullable='NO'),
  'array_constraint_validated',exists(select 1 from pg_constraint
    where conrelid='public.restaurant_reviews'::regclass
      and conname='restaurant_reviews_image_paths_shape_check' and convalidated),
  'old_rpc_present',to_regprocedure('public.campus_submit_restaurant_review(uuid,uuid,text,integer,text,text[],numeric)') is not null,
  'old_rpc_overload_count',(select count(*) from pg_proc p join pg_namespace n on p.pronamespace=n.oid
    where n.nspname='public' and p.proname='campus_submit_restaurant_review'),
  'new_rpc_present',to_regprocedure('public.campus_submit_restaurant_review_with_images(uuid,uuid,text,integer,text,text[],numeric,text[])') is not null,
  'private_jpeg_bucket',exists(select 1 from storage.buckets where id='post-images' and not public
    and file_size_limit=5242880 and allowed_mime_types @> array['image/jpeg']),
  'review_rls_enabled',(select relrowsecurity from pg_class where oid='public.restaurant_reviews'::regclass),
  'anonymous_direct_insert',has_table_privilege('anon','public.restaurant_reviews','insert'),
  'authenticated_direct_insert',has_table_privilege('authenticated','public.restaurant_reviews','insert'),
  'authenticated_direct_update',has_table_privilege('authenticated','public.restaurant_reviews','update')
) as value),

functions as (select p.oid::regprocedure::text as function_name,p.prosecdef as security_definer,
  p.proconfig as settings,p.proacl as execute_grants,md5(pg_get_functiondef(p.oid)) as definition_fingerprint
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where (n.nspname='public' and p.proname in ('campus_submit_restaurant_review',
  'campus_submit_restaurant_review_with_images','campus_withdraw_restaurant_review'))
  or (n.nspname='campus_private' and p.proname='validate_restaurant_review_images')
order by function_name),

-- Inspect every storage policy: permissive rules are ORed, so a separate
-- unrestricted DELETE/UPDATE/ALL policy would defeat a stricter photo policy.
policies as (select policyname,cmd,roles,qual,with_check from pg_policies
where schemaname='storage' and tablename='objects' order by policyname)
select jsonb_build_object('checks',(select value from checks),
  'functions',(select jsonb_agg(to_jsonb(functions)) from functions),
  'storage_policies',(select jsonb_agg(to_jsonb(policies)) from policies)
) as restaurant_photo_deployment;
