-- Run only after reviewing/applying 19-hall-message-notifications.sql.
-- REAL producer, fixture-only accounts, no sends, no deployment. Always ROLLBACK.
-- Fails closed if any real hall-message subscription exists. Holds subscription
-- writes briefly to prevent concurrent real opt-in while these fixture checks run.
begin;
lock table public.campus_subscriptions in share row exclusive mode;
do $guard$
begin
  if exists(select 1 from public.campus_subscriptions where kind='hall-message') then
    raise exception 'Stop: real hall-message subscriptions exist; use an isolated database for this regression';
  end if;
end
$guard$;
-- The notification -> job trigger stays enabled. Only the external worker wake
-- is transactionally disabled; this ALTER is also reverted by ROLLBACK.
alter table campus_private.information_jobs disable trigger information_job_wake;
create temporary table hall_push_fixture(
  author_id uuid not null default gen_random_uuid(),
  target_id uuid not null default gen_random_uuid(),
  other_id uuid not null default gen_random_uuid(),
  legacy_id uuid not null default gen_random_uuid(),
  none_id uuid not null default gen_random_uuid(),
  message_id uuid not null default gen_random_uuid(),
  other_message_id uuid not null default gen_random_uuid(),
  client_id uuid not null default gen_random_uuid(),
  notice_id uuid,
  other_notice_id uuid,
  job_id uuid,
  other_job_id uuid
) on commit drop;
insert into hall_push_fixture default values;
grant select on hall_push_fixture to authenticated,service_role;

do $setup$
declare f hall_push_fixture%rowtype; blocked boolean:=false; context jsonb;
begin
  select * into strict f from hall_push_fixture;
  insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  select id,'authenticated','authenticated','hall-fixture-' || id::text || '@example.invalid',
    '{}'::jsonb,'{}'::jsonb,now(),now()
  from unnest(array[f.author_id,f.target_id,f.other_id,f.legacy_id,f.none_id]) id;

  insert into public.campus_subscriptions(user_id,location_id,kind)
  values (f.author_id,'hall-region:teaching','hall-message'),
    (f.target_id,'hall-region:teaching','hall-message'),
    (f.other_id,'hall-region:living','hall-message'),
    (f.legacy_id,'','');

  insert into public.hall_messages(id,author_id,region_id,content,client_message_id,created_at)
  values(f.message_id,f.author_id,'teaching','Synthetic regression fixture; no personal data.',f.client_id,clock_timestamp());
  if (select count(*) from public.notifications where related_type='message' and related_id=f.message_id::text)<>1
    or not exists(select 1 from public.notifications where related_type='message'
      and related_id=f.message_id::text and recipient_id=f.target_id and type='hall-message'
      and dedupe_key='hall-message:' || f.message_id::text)
  then raise exception 'Incorrect audience: expected one exact-region subscriber, excluding author/legacy/none/other region'; end if;
  if exists(select 1 from public.notifications where related_type='message' and related_id=f.message_id::text
    and body like '%Synthetic regression%')
  then raise exception 'Chat plaintext leaked into generic notification body'; end if;

  select id into strict f.notice_id from public.notifications
    where recipient_id=f.target_id and related_type='message' and related_id=f.message_id::text;
  select id into strict f.job_id from campus_private.information_jobs where kind='push' and target_id=f.notice_id;

  begin
    insert into public.hall_messages(author_id,region_id,content,client_message_id,created_at)
    values(f.author_id,'teaching','Synthetic retry fixture.',f.client_id,clock_timestamp());
  exception when unique_violation then blocked:=true;
  end;
  if not blocked then raise exception 'Duplicate author/client_message_id was accepted'; end if;
  update public.hall_messages set content='Synthetic updated fixture.' where id=f.message_id;
  if (select count(*) from public.notifications where related_type='message' and related_id=f.message_id::text)<>1
    or (select count(*) from campus_private.information_jobs where kind='push' and target_id=f.notice_id)<>1
  then raise exception 'Retry/update created duplicate notice or job'; end if;

  insert into public.hall_messages(id,author_id,region_id,content,client_message_id,created_at)
  values(f.other_message_id,f.author_id,'living','Synthetic other-region fixture.',gen_random_uuid(),clock_timestamp());
  if (select count(*) from public.notifications where related_type='message' and related_id=f.other_message_id::text)<>1
    or not exists(select 1 from public.notifications where related_type='message'
      and related_id=f.other_message_id::text and recipient_id=f.other_id)
  then raise exception 'Region isolation failed'; end if;
  select id into strict f.other_notice_id from public.notifications
    where recipient_id=f.other_id and related_type='message' and related_id=f.other_message_id::text;
  select id into strict f.other_job_id from campus_private.information_jobs where kind='push' and target_id=f.other_notice_id;

  context:=public.campus_hall_push_context(f.notice_id);
  if context->>'deliverable'<>'true' or context->>'region_id'<>'teaching' or context->>'message_id'<>f.message_id::text
  then raise exception 'Context incorrect for live subscribed unread source'; end if;
  if has_function_privilege('authenticated','public.campus_hall_push_context(uuid)','execute')
    or has_function_privilege('anon','public.campus_hall_push_context(uuid)','execute')
    or not has_function_privilege('service_role','public.campus_hall_push_context(uuid)','execute')
  then raise exception 'Context RPC grants incorrect'; end if;

  update hall_push_fixture set notice_id=f.notice_id,other_notice_id=f.other_notice_id,
    job_id=f.job_id,other_job_id=f.other_job_id;
  perform set_config('request.jwt.claim.sub',f.target_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',f.target_id,'role','authenticated')::text,true);
end
$setup$;

set local role authenticated;
do $rls$
declare f hall_push_fixture%rowtype; blocked boolean:=false; affected integer;
begin
  select * into strict f from hall_push_fixture;
  begin
    perform public.campus_hall_push_context(f.notice_id);
  exception when insufficient_privilege then blocked:=true;
  end;
  if not blocked then raise exception 'Authenticated caller could invoke service-only context'; end if;
  if (select count(*) from public.campus_subscriptions)<>1 then raise exception 'RLS exposed another user subscription'; end if;

  blocked:=false;
  begin
    insert into public.campus_subscriptions(location_id,kind) values('','hall-message');
  exception when insufficient_privilege then blocked:=true;
  end;
  if not blocked then raise exception 'RLS allowed wildcard chat subscription'; end if;
  blocked:=false;
  begin
    insert into public.campus_subscriptions(location_id,kind) values('hall-region:missing','hall-message');
  exception when insufficient_privilege then blocked:=true;
  end;
  if not blocked then raise exception 'RLS allowed nonexistent chat region'; end if;

  delete from public.campus_subscriptions where user_id=f.other_id;
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'RLS allowed deleting another user subscription'; end if;
  -- Normal campus subscriptions remain valid and must survive chat unsubscribe.
  insert into public.campus_subscriptions(location_id,kind) values('','notice');
end
$rls$;
reset role;
set local role service_role;
do $service$
declare f hall_push_fixture%rowtype;
begin
  select * into strict f from hall_push_fixture;
  if (public.campus_hall_push_context(f.notice_id)->>'deliverable')<>'true'
  then raise exception 'Service role cannot resolve eligible chat'; end if;
end
$service$;
reset role;

do $cleanup$
declare f hall_push_fixture%rowtype; next_message uuid:=gen_random_uuid(); next_notice uuid; next_job uuid;
begin
  select * into strict f from hall_push_fixture;

  update public.notifications set read_at=clock_timestamp() where id=f.notice_id;
  if (public.campus_hall_push_context(f.notice_id)->>'deliverable')<>'false'
  then raise exception 'Already read chat remained deliverable'; end if;
  update public.notifications set read_at=null where id=f.notice_id;

  delete from public.campus_subscriptions where user_id=f.target_id
    and location_id='hall-region:teaching' and kind='hall-message';
  if exists(select 1 from public.notifications where id=f.notice_id)
    or (public.campus_hall_push_context(f.notice_id)->>'deliverable')<>'false'
    or not exists(select 1 from campus_private.information_jobs where id=f.job_id and status='cancelled')
  then raise exception 'Unsubscribe left chat notice or active push job'; end if;
  if not exists(select 1 from public.campus_subscriptions where user_id=f.target_id and location_id='' and kind='notice')
    or not exists(select 1 from public.notifications where id=f.other_notice_id)
  then raise exception 'Unsubscribe changed unrelated campus subscriptions or another region/user'; end if;

  insert into public.campus_subscriptions(user_id,location_id,kind,created_at)
    values(f.target_id,'hall-region:teaching','hall-message',clock_timestamp());
  if (public.campus_hall_push_context(f.notice_id)->>'deliverable')<>'false'
    or exists(select 1 from public.notifications where recipient_id=f.target_id and type='hall-message')
  then raise exception 'Re-subscribe replayed an old chat'; end if;

  insert into public.hall_messages(id,author_id,region_id,content,client_message_id,created_at)
    values(next_message,f.author_id,'teaching','Synthetic retraction fixture.',gen_random_uuid(),clock_timestamp());
  select id into strict next_notice from public.notifications
    where recipient_id=f.target_id and related_type='message' and related_id=next_message::text;
  select id into strict next_job from campus_private.information_jobs where kind='push' and target_id=next_notice;
  update campus_private.information_jobs set status='running',claim_token=gen_random_uuid(),
    lease_until=now()+interval '3 minutes' where id=next_job;
  update public.hall_messages set deleted_at=clock_timestamp() where id=next_message;
  if exists(select 1 from public.notifications where id=next_notice)
    or (public.campus_hall_push_context(next_notice)->>'deliverable')<>'false'
    or not exists(select 1 from campus_private.information_jobs where id=next_job
      and status='cancelled' and claim_token is null and lease_until is null)
  then raise exception 'Retraction left notice or running push lease'; end if;

  delete from public.hall_messages where id=f.other_message_id;
  if exists(select 1 from public.notifications where id=f.other_notice_id)
    or (public.campus_hall_push_context(f.other_notice_id)->>'deliverable')<>'false'
    or not exists(select 1 from campus_private.information_jobs where id=f.other_job_id and status='cancelled')
  then raise exception 'Hard delete left notice or active push'; end if;
end
$cleanup$;
rollback;
select 'passed: real producer, fixture audience, RLS, dedupe, unsubscribe, retraction, delete; all fixture data and wake change rolled back' as regression_result;
