-- Transactional release regression with synthetic fixture metadata only.
-- Run as postgres AFTER 21-restaurant-review-images.sql.
-- Status 2026-11-13: deployed; this complete regression returned PASS in
-- production, with all fixture writes rolled back. No real HTTP/blob test run.
-- Synthetic Auth users, windows, reviews and Storage METADATA only. No HTTP or
-- real object bytes. Run the entire file in one fail-on-error call; never remove
-- BEGIN/ROLLBACK, or run the final PASS SELECT independently after an error.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $$
declare
  owner_id uuid := gen_random_uuid();
  peer_id uuid := gen_random_uuid();
  window_ids uuid[] := array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  paths text[];
  peer_path text;
  missing_path text;
  image_path text;
  invalid_paths text[];
  legacy_client uuid := gen_random_uuid();
  photo_client uuid := gen_random_uuid();
  legacy_id uuid;
  photo_id uuid;
  multi_id uuid;
  result_id uuid;
  failed boolean;
  affected integer;
  i integer;
begin
  if to_regprocedure('public.campus_submit_restaurant_review(uuid,uuid,text,integer,text,text[],numeric)') is null
    or (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='campus_submit_restaurant_review')<>1 then
    raise exception 'Regression: old text-only RPC signature changed/overloaded';
  end if;
  if has_function_privilege('anon','public.campus_submit_restaurant_review_with_images(uuid,uuid,text,integer,text,text[],numeric,text[])','execute')
    or not has_function_privilege('authenticated','public.campus_submit_restaurant_review_with_images(uuid,uuid,text,integer,text,text[],numeric,text[])','execute')
    or has_function_privilege('authenticated','campus_private.validate_restaurant_review_images()','execute') then
    raise exception 'Regression: photo RPC or internal trigger execution grants';
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.restaurant_reviews'::regclass
    and conname='restaurant_reviews_image_paths_shape_check' and convalidated) then
    raise exception 'Regression: image array constraint was not validated';
  end if;
  if not exists(select 1 from storage.buckets where id='post-images' and not public
    and file_size_limit=5242880 and allowed_mime_types @> array['image/jpeg']) then
    raise exception 'Regression: expected private image bucket missing';
  end if;
  -- These are synthetic accounts; no email/password of a real account is read.
  insert into auth.users(id,email,raw_user_meta_data) values
    (owner_id,'review-image-owner-'||owner_id::text||'@example.invalid','{"nickname":"Review fixture owner"}'),
    (peer_id,'review-image-peer-'||peer_id::text||'@example.invalid','{"nickname":"Review fixture peer"}');
  for i in 1..3 loop
    insert into public.restaurant_windows(id,restaurant_id,number,name,category)
      values(window_ids[i],'canteen','rf-'||left(window_ids[i]::text,8),'Synthetic review fixture','其他');
  end loop;
  paths := array[owner_id::text||'/'||gen_random_uuid()::text||'.jpg',
    owner_id::text||'/'||gen_random_uuid()::text||'.jpg',
    owner_id::text||'/'||gen_random_uuid()::text||'.jpg',
    owner_id::text||'/'||gen_random_uuid()::text||'.jpg',
    owner_id::text||'/'||gen_random_uuid()::text||'.jpg'];
  peer_path := peer_id::text||'/'||gen_random_uuid()::text||'.jpg';
  missing_path := owner_id::text||'/'||gen_random_uuid()::text||'.jpg';
  foreach image_path in array paths||peer_path loop
    insert into storage.objects(bucket_id,name,owner_id,metadata) values
      ('post-images',image_path,split_part(image_path,'/',1),'{"mimetype":"image/jpeg","size":1}'::jsonb);
  end loop;

  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  -- The original five-argument/default-argument call remains valid.
  legacy_id := public.campus_submit_restaurant_review(legacy_client,window_ids[1],'canteen',4,'Synthetic text-only review');
  if not exists(select 1 from public.restaurant_reviews where id=legacy_id and image_paths='{}'::text[]) then
    raise exception 'Regression: old RPC did not create empty photo list';
  end if;
  result_id := public.campus_submit_restaurant_review_with_images(legacy_client,window_ids[1],'canteen',4,'Synthetic text-only review');
  if result_id is distinct from legacy_id then raise exception 'Regression: empty-photo retry contract'; end if;

  -- Invalid payload attempts fail before leaving any review row behind.
  for i in 1..8 loop
    invalid_paths := case i
      when 1 then null::text[]
      when 2 then array[null]::text[]
      when 3 then array[paths[1],paths[1]]
      when 4 then paths[1:4]
      when 5 then array[peer_path]
      when 6 then array[missing_path]
      when 7 then array['https://outside.invalid/photo.jpg']
      when 8 then array[[paths[1],paths[2]]]
    end;
    failed := false;
    begin
      perform public.campus_submit_restaurant_review_with_images(gen_random_uuid(),window_ids[2],'canteen',4,'Invalid synthetic review','{}',null,invalid_paths);
    exception when check_violation or raise_exception then failed := true; end;
    if not failed then raise exception 'Regression: invalid photo case % accepted',i; end if;
  end loop;
  failed := false;
  begin
    perform public.campus_submit_restaurant_review_with_images(gen_random_uuid(),window_ids[2],'canteen',4,'Noncanonical array','{}',null,
      ('[0:0]={"'||paths[1]||'"}')::text[]);
  exception when check_violation then failed := true; end;
  if not failed then raise exception 'Regression: non-1-based array accepted'; end if;

  photo_id := public.campus_submit_restaurant_review_with_images(photo_client,window_ids[2],'canteen',4,'Synthetic one-photo review','{}',null,array[paths[1]]);
  result_id := public.campus_submit_restaurant_review_with_images(photo_client,window_ids[2],'canteen',4,'Synthetic one-photo review','{}',null,array[paths[1]]);
  if result_id is distinct from photo_id then raise exception 'Regression: identical photo retry duplicated row'; end if;
  failed := false;
  begin
    perform public.campus_submit_restaurant_review_with_images(photo_client,window_ids[2],'canteen',4,'Synthetic one-photo review','{}',null,array[paths[2]]);
  exception when raise_exception then failed := true; end;
  if not failed then raise exception 'Regression: changed retry paths accepted'; end if;
  -- Old clients can retry/read/withdraw a photo review without clearing its paths.
  result_id := public.campus_submit_restaurant_review(photo_client,window_ids[2],'canteen',4,'Synthetic one-photo review');
  if result_id is distinct from photo_id then raise exception 'Regression: old retry lost photo parent'; end if;
  if not exists(select 1 from public.restaurant_reviews where id=photo_id and image_paths=array[paths[1]]) then
    raise exception 'Regression: old retry cleared photo references';
  end if;
  multi_id := public.campus_submit_restaurant_review_with_images(gen_random_uuid(),window_ids[3],'canteen',5,'Synthetic three-photo review','{}',null,paths[1:3]);
  if not exists(select 1 from public.restaurant_reviews where id=multi_id and image_paths=paths[1:3]) then
    raise exception 'Regression: three canonical photos not persisted';
  end if;
  failed := false;
  begin
    insert into public.restaurant_reviews(window_id,restaurant_id,author_id,author_name,client_id,rating,content,image_paths)
      values(window_ids[1],'canteen',peer_id,'Forged author',gen_random_uuid(),4,'Synthetic forged author',array[paths[1]]);
  exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'Regression: direct review insertion granted'; end if;
  failed := false;
  begin
    update public.restaurant_reviews set image_paths='{}' where id=photo_id;
  exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'Regression: direct review update granted'; end if;

  perform set_config('storage.allow_delete_query','true',true);
  delete from storage.objects where bucket_id='post-images' and name=paths[1];
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'Regression: visible review photo deletable'; end if;
  delete from storage.objects where bucket_id='post-images' and name=paths[4];
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'Regression: owner cannot delete unused upload'; end if;
  perform set_config('storage.allow_delete_query','false',true);
  execute 'reset role';

  -- Even privileged parent updates cannot swap paths or assign another author.
  failed := false;
  begin update public.restaurant_reviews set image_paths=array[paths[2]] where id=photo_id;
  exception when check_violation then failed := true; end;
  if not failed then raise exception 'Regression: privileged image swap accepted'; end if;
  failed := false;
  begin update public.restaurant_reviews set author_id=peer_id where id=photo_id;
  exception when check_violation then failed := true; end;
  if not failed then raise exception 'Regression: privileged photo author swap accepted'; end if;

  perform set_config('request.jwt.claim.sub',peer_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',peer_id,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  if not exists(select 1 from storage.objects where bucket_id='post-images' and name=paths[1]) then
    raise exception 'Regression: peer cannot read visible review photo metadata';
  end if;
  if exists(select 1 from storage.objects where bucket_id='post-images' and name=paths[5]) then
    raise exception 'Regression: unreferenced foreign upload leaked';
  end if;
  failed := false;
  begin perform public.campus_withdraw_restaurant_review(photo_id);
  exception when raise_exception then failed := true; end;
  if not failed then raise exception 'Regression: peer can withdraw another author review'; end if;
  perform set_config('storage.allow_delete_query','true',true);
  delete from storage.objects where bucket_id='post-images' and name=paths[1];
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'Regression: peer can delete foreign photo'; end if;
  perform set_config('storage.allow_delete_query','false',true);
  execute 'reset role';

  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  perform public.campus_withdraw_restaurant_review(photo_id);
  -- Shared first photo still has the visible three-photo parent.
  perform set_config('storage.allow_delete_query','true',true);
  delete from storage.objects where bucket_id='post-images' and name=paths[1];
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'Regression: shared visible review reference ignored'; end if;
  perform set_config('storage.allow_delete_query','false',true);
  perform public.campus_withdraw_restaurant_review(multi_id);
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',peer_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',peer_id,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  if exists(select 1 from storage.objects where bucket_id='post-images' and name=paths[1]) then
    raise exception 'Regression: fully withdrawn review photo metadata leaked to peer';
  end if;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  if not exists(select 1 from storage.objects where bucket_id='post-images' and name=paths[1]) then
    raise exception 'Regression: owner lost own withdrawn upload access';
  end if;
  perform set_config('storage.allow_delete_query','true',true);
  delete from storage.objects where bucket_id='post-images' and name=paths[1];
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'Regression: withdrawn photos cannot be cleaned by owner'; end if;
  perform set_config('storage.allow_delete_query','false',true);
  execute 'reset role';
  -- Anonymous users keep text-only reads, with neither photo signing nor RPC.
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  execute 'set local role anon';
  failed := false;
  begin perform public.campus_submit_restaurant_review_with_images(gen_random_uuid(),window_ids[1],'canteen',4,'Synthetic anonymous');
  exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'Regression: anonymous photo RPC permitted'; end if;
  if exists(select 1 from storage.objects where bucket_id='post-images' and name=paths[2]) then
    raise exception 'Regression: anonymous private photo metadata access';
  end if;
  execute 'reset role';
  delete from public.restaurant_windows where id=any(window_ids);
  if exists(select 1 from public.restaurant_reviews where window_id=any(window_ids)) then
    raise exception 'Regression: synthetic window deletion did not cascade';
  end if;
  raise notice 'Restaurant photo SQL regression passed; fixture transaction will roll back';
end $$;
rollback;
-- This final SELECT remains visible even when the SQL connector returns only
-- its last result. Submit the WHOLE script in one fail-on-error call: never
-- resume at this statement after an earlier exception.
select 'PASS: restaurant photo ownership, shape, immutable references, legacy RPC, retry, read/delete RLS and withdrawal'::text as regression_result,
  'Fixture transaction rolled back. No Storage HTTP/blob validation performed.'::text as scope;
