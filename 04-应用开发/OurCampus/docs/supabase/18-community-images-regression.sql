-- Transactional regression: no CREATE/ALTER/DROP and no external requests.
-- Run as postgres after 18-community-images.sql. Synthetic Auth users and Storage
-- metadata exist ONLY inside this transaction. Real objects/users are not touched.
-- Do not remove BEGIN/ROLLBACK, or run fragments independently.
begin;
do $$
declare
  owner_id uuid := ('c0190001-' || substring(gen_random_uuid()::text from 10))::uuid;
  peer_id uuid := ('c0190002-' || substring(gen_random_uuid()::text from 10))::uuid;
  manager_id uuid := ('c0190003-' || substring(gen_random_uuid()::text from 10))::uuid;
  region text;
  hall_path text;
  three_paths text[];
  lost_path text;
  notice_path text;
  unused_path text;
  peer_path text;
  image_path text;
  message_id uuid;
  lost_id uuid;
  notice_id uuid;
  request_id uuid;
  result_id uuid;
  failed boolean;
  affected integer;
begin
  select id into region from public.campus_regions order by id limit 1;
  if region is null then raise exception 'Load campus region seed before this regression'; end if;
  if not exists(select 1 from storage.buckets where id='post-images' and not public
    and file_size_limit=5242880
    and allowed_mime_types @> array['image/jpeg','image/png','image/webp']) then
    raise exception 'Regression: private image bucket configuration';
  end if;
  if has_function_privilege('anon','campus_private.validate_community_images()','execute')
    or has_function_privilege('authenticated','campus_private.validate_community_images()','execute') then
    raise exception 'Regression: private validator exposed as callable API';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='campus_submit_report') <> 1
    or to_regprocedure('public.campus_submit_report(uuid,text,text,text,text,jsonb,uuid)') is null then
    raise exception 'Regression: legacy report RPC signature changed';
  end if;

  insert into auth.users(id,email,raw_user_meta_data) values
    (owner_id,'post-images-owner-'||owner_id::text||'@example.invalid','{"nickname":"Attachment fixture owner"}'),
    (peer_id,'post-images-peer-'||peer_id::text||'@example.invalid','{"nickname":"Attachment fixture peer"}'),
    (manager_id,'post-images-manager-'||manager_id::text||'@example.invalid','{"nickname":"Attachment fixture manager"}');
  update campus_private.user_roles set role='manager' where user_id=manager_id;
  hall_path := owner_id::text||'/'||gen_random_uuid()::text||'.jpg';
  three_paths := array[owner_id::text||'/'||gen_random_uuid()::text||'.jpg',
    owner_id::text||'/'||gen_random_uuid()::text||'.jpeg',owner_id::text||'/'||gen_random_uuid()::text||'.webp'];
  lost_path := owner_id::text||'/'||gen_random_uuid()::text||'.jpg';
  notice_path := owner_id::text||'/'||gen_random_uuid()::text||'.png';
  unused_path := owner_id::text||'/'||gen_random_uuid()::text||'.jpg';
  peer_path := peer_id::text||'/'||gen_random_uuid()::text||'.png';
  foreach image_path in array array[hall_path,lost_path,notice_path,unused_path,peer_path]||three_paths loop
    insert into storage.objects(bucket_id,name,owner_id,metadata) values
      ('post-images',image_path,split_part(image_path,'/',1),'{"mimetype":"image/jpeg","size":1}'::jsonb);
  end loop;

  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  insert into public.hall_messages(region_id,content,client_message_id)
    values(region,'Legacy text-only fixture',gen_random_uuid());
  insert into public.hall_messages(region_id,content,image_paths,client_message_id)
    values(region,'',array[hall_path],gen_random_uuid()) returning id into message_id;
  insert into public.hall_messages(region_id,content,image_paths,client_message_id)
    values(region,'Three attached photos',three_paths,gen_random_uuid());

  failed := false;
  begin
    insert into public.hall_messages(region_id,content,client_message_id)
      values(region,' ',gen_random_uuid());
  exception when check_violation then failed := true; end;
  if not failed then raise exception 'Regression: empty Hall post accepted'; end if;
  failed := false;
  begin
    insert into public.hall_messages(region_id,content,image_paths,client_message_id)
      values(region,'Duplicate',array[hall_path,hall_path],gen_random_uuid());
  exception when check_violation then failed := true; end;
  if not failed then raise exception 'Regression: duplicate Hall paths accepted'; end if;
  failed := false;
  begin
    insert into public.hall_messages(region_id,content,image_paths,client_message_id)
      values(region,'Too many',three_paths||hall_path,gen_random_uuid());
  exception when check_violation then failed := true; end;
  if not failed then raise exception 'Regression: four Hall images accepted'; end if;
  failed := false;
  begin
    insert into public.hall_messages(region_id,content,image_paths,client_message_id)
      values(region,'NULL path',array[null]::text[],gen_random_uuid());
  exception when check_violation then failed := true; end;
  if not failed then raise exception 'Regression: NULL Hall path accepted'; end if;
  failed := false;
  begin
    insert into public.hall_messages(region_id,content,image_paths,client_message_id)
      values(region,'Multidimensional',array[[hall_path,hall_path],[hall_path,hall_path]],gen_random_uuid());
  exception when check_violation then failed := true; end;
  if not failed then raise exception 'Regression: multidimensional array accepted'; end if;
  failed := false;
  begin
    insert into public.hall_messages(region_id,content,image_paths,client_message_id)
      values(region,'Stolen',array[peer_path],gen_random_uuid());
  exception when check_violation then failed := true; end;
  if not failed then raise exception 'Regression: other user object attached'; end if;
  failed := false;
  begin
    insert into public.hall_messages(region_id,content,image_paths,client_message_id)
      values(region,'Missing',array[owner_id::text||'/'||gen_random_uuid()::text||'.jpg'],gen_random_uuid());
  exception when check_violation then failed := true; end;
  if not failed then raise exception 'Regression: nonexistent object attached'; end if;
  failed := false;
  begin
    insert into public.hall_messages(region_id,content,image_paths,client_message_id)
      values(region,'Nested',array[owner_id::text||'/nested/'||gen_random_uuid()::text||'.jpg'],gen_random_uuid());
  exception when check_violation then failed := true; end;
  if not failed then raise exception 'Regression: nested object path accepted'; end if;
  failed := false;
  begin
    update public.hall_messages set image_paths=three_paths where id=message_id;
  exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'Regression: client can UPDATE Hall images'; end if;

  -- Four-argument callers rely on the unchanged default parameters.
  perform public.campus_submit_report(gen_random_uuid(),'notice','Legacy report','Text only report');
  request_id := gen_random_uuid();
  lost_id := public.campus_submit_report(request_id,'lost','Fixture lost item','Fixture description',
    null,jsonb_build_object('image_paths',array[lost_path],'contact','Synthetic fixture only'),null);
  result_id := public.campus_submit_report(request_id,'lost','Fixture lost item','Fixture description',
    null,jsonb_build_object('image_paths',array[lost_path],'contact','Synthetic fixture only'),null);
  if result_id is distinct from lost_id then raise exception 'Regression: retry was not idempotent'; end if;
  notice_id := public.campus_submit_report(gen_random_uuid(),'notice','Fixture notice','Awaiting approval',
    null,jsonb_build_object('image_paths',array[notice_path]),null);
  failed := false;
  begin
    perform public.campus_submit_report(gen_random_uuid(),'lost','Invalid list','Fixture description',
      null,'{"image_paths":"not-an-array"}'::jsonb,null);
  exception when check_violation then failed := true; end;
  if not failed then raise exception 'Regression: non-array report images accepted'; end if;
  failed := false;
  begin
    perform public.campus_submit_report(gen_random_uuid(),'lost','Invalid value','Fixture description',
      null,'{"image_paths":[null]}'::jsonb,null);
  exception when check_violation then failed := true; end;
  if not failed then raise exception 'Regression: non-string report image accepted'; end if;
  failed := false;
  begin
    perform public.campus_submit_report(gen_random_uuid(),'lost','Duplicate images','Fixture description',
      null,jsonb_build_object('image_paths',array[lost_path,lost_path]),null);
  exception when check_violation then failed := true; end;
  if not failed then raise exception 'Regression: duplicate report images accepted'; end if;
  failed := false;
  begin
    perform public.campus_submit_report(gen_random_uuid(),'lost','Too many images','Fixture description',
      null,jsonb_build_object('image_paths',three_paths||hall_path),null);
  exception when check_violation then failed := true; end;
  if not failed then raise exception 'Regression: four report images accepted'; end if;
  failed := false;
  begin
    perform public.campus_submit_report(request_id,'lost','Fixture lost item','Fixture description',
      null,jsonb_build_object('image_paths',array[hall_path]),null);
  exception when raise_exception then failed := true; end;
  if not failed then raise exception 'Regression: changed retry payload accepted'; end if;

  insert into storage.objects(bucket_id,name,owner_id,metadata) values
    ('post-images',owner_id::text||'/'||gen_random_uuid()::text||'.webp',owner_id::text,
      '{"mimetype":"image/webp","size":1}');
  failed := false;
  begin
    insert into storage.objects(bucket_id,name) values
      ('post-images',peer_id::text||'/'||gen_random_uuid()::text||'.jpg');
  exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'Regression: uploaded using other user prefix'; end if;
  failed := false;
  begin
    insert into storage.objects(bucket_id,name) values
      ('post-images',owner_id::text||'/nested/'||gen_random_uuid()::text||'.jpg');
  exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'Regression: nested upload accepted'; end if;
  update storage.objects set metadata='{}'::jsonb where bucket_id='post-images' and name=hall_path;
  get diagnostics affected = row_count;
  if affected<>0 then raise exception 'Regression: Storage overwrite allowed'; end if;
  -- The Storage server normally sets this flag itself. Enable it only locally
  -- for exact synthetic metadata names, to exercise DELETE RLS without HTTP.
  perform set_config('storage.allow_delete_query','true',true);
  delete from storage.objects where bucket_id='post-images' and name=hall_path;
  get diagnostics affected = row_count;
  if affected<>0 then raise exception 'Regression: referenced object could be deleted'; end if;
  delete from storage.objects where bucket_id='post-images' and name=unused_path;
  get diagnostics affected = row_count;
  if affected<>1 then raise exception 'Regression: own unreferenced upload could not be deleted'; end if;
  perform set_config('storage.allow_delete_query','false',true);

  execute 'reset role';
  failed := false;
  begin
    update public.hall_messages set image_paths=three_paths where id=message_id;
  exception when check_violation then failed := true; end;
  if not failed then raise exception 'Regression: privileged Hall image swap accepted'; end if;
  failed := false;
  begin
    update public.campus_reports set details=details-'image_paths' where id=lost_id;
  exception when check_violation then failed := true; end;
  if not failed then raise exception 'Regression: report image removal accepted'; end if;

  perform set_config('request.jwt.claim.sub',peer_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',peer_id,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  if not exists(select 1 from storage.objects where bucket_id='post-images' and name=hall_path) then
    raise exception 'Regression: visible Hall image unavailable'; end if;
  if not exists(select 1 from storage.objects where bucket_id='post-images' and name=lost_path) then
    raise exception 'Regression: submitted lost/found image unavailable'; end if;
  if exists(select 1 from storage.objects where bucket_id='post-images' and name=notice_path) then
    raise exception 'Regression: unreviewed notice image leaked'; end if;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub',manager_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',manager_id,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  if not exists(select 1 from storage.objects where bucket_id='post-images' and name=notice_path) then
    raise exception 'Regression: manager cannot review image'; end if;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  update public.hall_messages set deleted_at=now() where id=message_id;
  get diagnostics affected = row_count;
  if affected<>1 then raise exception 'Regression: owner cannot withdraw Hall message'; end if;
  if not exists(select 1 from storage.objects where bucket_id='post-images' and name=hall_path)
    or not exists(select 1 from storage.objects where bucket_id='post-images' and name=notice_path) then
    raise exception 'Regression: owner cannot read own draft/withdrawn object'; end if;
  execute 'reset role';

  update public.campus_reports set status='resolved' where id=lost_id;
  perform set_config('request.jwt.claim.sub',peer_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',peer_id,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  if exists(select 1 from storage.objects where bucket_id='post-images' and name=hall_path) then
    raise exception 'Regression: withdrawn Hall image leaked'; end if;
  if not exists(select 1 from storage.objects where bucket_id='post-images' and name=lost_path) then
    raise exception 'Regression: existing resolved lost/found visibility changed'; end if;
  execute 'reset role';
  update public.campus_reports set status='withdrawn' where id=lost_id;
  update public.campus_reports set status='published' where id=notice_id;
  execute 'set local role authenticated';
  if exists(select 1 from storage.objects where bucket_id='post-images' and name=lost_path) then
    raise exception 'Regression: withdrawn report image leaked'; end if;
  if not exists(select 1 from storage.objects where bucket_id='post-images' and name=notice_path) then
    raise exception 'Regression: published report image unavailable'; end if;
  execute 'reset role';
  execute 'set local role anon';
  if exists(select 1 from storage.objects where bucket_id='post-images') then
    raise exception 'Regression: anonymous image read permitted'; end if;
  execute 'reset role';
  raise notice 'Community image permissions, validation, withdrawal and legacy compatibility passed';
exception when others then
  execute 'reset role';
  raise;
end $$;
rollback;
select 'Community image SQL regression passed; synthetic fixtures rolled back' as result;
