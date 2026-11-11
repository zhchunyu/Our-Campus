-- Run after review/apply of 20, preferably on an isolated database.
-- REAL SQL functions/triggers; only synthetic accounts/messages; NO model/provider calls.
-- Stops if real opt-in audiences exist. Disables only external wake inside this
-- transaction. All fixtures, budget reservations and trigger changes ROLLBACK.
begin;
lock table public.campus_ai_reminder_preferences,public.campus_subscriptions,
  campus_private.hall_analysis_monthly_usage in share row exclusive mode;
do $guard$
begin
  if exists(select 1 from public.campus_ai_reminder_preferences where enabled)
    or exists(select 1 from public.campus_subscriptions where kind='hall-message') then
    raise exception 'Use an isolated database: real AI-reminder or hall-message opt-in exists'; end if;
end $guard$;
alter table campus_private.information_jobs disable trigger information_job_wake;
create temporary table hall_ai_fixture (
  author_id uuid default gen_random_uuid(),favorite_id uuid default gen_random_uuid(),interest_id uuid default gen_random_uuid(),
  lost_id uuid default gen_random_uuid(),subscriber_id uuid default gen_random_uuid(),disabled_id uuid default gen_random_uuid(),
  unrelated_id uuid default gen_random_uuid(),direct_id uuid default gen_random_uuid(),
  message_id uuid default gen_random_uuid(),second_id uuid default gen_random_uuid(),lost_report_id uuid default gen_random_uuid(),
  job_id uuid,token uuid,notice_id uuid,push_id uuid
) on commit drop;
insert into hall_ai_fixture default values;
grant select on hall_ai_fixture to authenticated,service_role;

do $scenario$
declare f hall_ai_fixture%rowtype; before_calls integer; after_calls integer; budget_month date;
  permitted jsonb; blocked boolean:=false; event_count bigint; n uuid;
begin
  select * into strict f from hall_ai_fixture;
  if not exists(select 1 from public.campus_locations where id='library') then raise exception 'Requires library seed'; end if;
  insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    select id,'authenticated','authenticated','hall-ai-fixture-'||id::text||'@example.invalid','{}','{}',now(),now()
    from unnest(array[f.author_id,f.favorite_id,f.interest_id,f.lost_id,f.subscriber_id,f.disabled_id,f.unrelated_id,f.direct_id]) id;
  insert into public.campus_ai_reminder_preferences(user_id,enabled,interest_keywords)
    values(f.author_id,true,'{}'),(f.favorite_id,true,'{}'),(f.interest_id,true,array['雨伞']),
      (f.lost_id,true,'{}'),(f.subscriber_id,true,'{}'),(f.unrelated_id,true,'{}'),(f.direct_id,true,array['雨伞']);
  insert into public.campus_ai_reminder_preferences(user_id) values(f.disabled_id);
  if (select enabled from public.campus_ai_reminder_preferences where user_id=f.disabled_id) then raise exception 'New users opted in by default'; end if;
  insert into public.campus_user_preferences(user_id,favorite_ids)
    values(f.author_id,array['library']),(f.favorite_id,array['library']),(f.disabled_id,array['library']);
  insert into public.campus_subscriptions(user_id,location_id,kind)
    values(f.subscriber_id,'library','found'),(f.direct_id,'hall-region:teaching','hall-message'),(f.unrelated_id,'','');
  insert into public.campus_reports(id,author_id,client_id,kind,title,body,location_id,status,analysis_status)
    values(f.lost_report_id,f.lost_id,gen_random_uuid(),'lost','蓝色雨伞','图书馆丢了一把蓝色雨伞','library','analyzed','complete');
  select count(*) into event_count from public.campus_events;
  insert into public.hall_messages(id,author_id,region_id,content,client_message_id,created_at)
    values(f.message_id,f.author_id,'teaching','图书馆捡到蓝色雨伞',gen_random_uuid(),clock_timestamp());
  -- A later interest edit must not backfill an already queued message.
  update public.campus_ai_reminder_preferences set interest_keywords=array['雨伞'] where user_id=f.unrelated_id;
  select id into strict f.job_id from campus_private.information_jobs where kind='chat-analysis' and target_id=f.message_id;
  f.token:=gen_random_uuid();
  update campus_private.information_jobs set status='running',attempts=1,claim_token=f.token,lease_until=now()+interval '3 minutes' where id=f.job_id;
  budget_month:=(date_trunc('month',now() at time zone 'Asia/Shanghai'))::date;
  select coalesce((select calls from campus_private.hall_analysis_monthly_usage where month=budget_month),0) into before_calls;
  if before_calls>=1000 then raise exception 'Use an isolated database: monthly test budget already full'; end if;
  permitted:=public.campus_begin_hall_analysis(f.job_id,f.token);
  if permitted->>'allowed'<>'true' or permitted->>'content'<>'图书馆捡到蓝色雨伞'
    or permitted ?| array['author_id','user_id','recipient_ids','image_paths','cid'] then raise exception 'Unsafe begin response'; end if;
  if public.campus_begin_hall_analysis(f.job_id,f.token)->>'allowed'<>'false' then raise exception 'Second model reservation allowed'; end if;
  select calls into after_calls from campus_private.hall_analysis_monthly_usage where month=budget_month;
  if after_calls<>before_calls+1 then raise exception 'Reservation count was not exactly one'; end if;
  begin
    perform public.campus_complete_hall_analysis(f.job_id,f.token,
      '{"kind":"found","location_id":"library","keywords":["蓝色","雨伞"],"verified":false,"recipient_ids":["fake"]}',true,'{}');
  exception when raise_exception then blocked:=true;
  end;
  if not blocked then raise exception 'AI supplied recipients were accepted'; end if;
  if not public.campus_complete_hall_analysis(f.job_id,f.token,
    '{"kind":"found","location_id":"library","keywords":["蓝色","雨伞"],"verified":false}',true,'{"input_tokens":120,"output_tokens":25}') then raise exception 'Valid analysis did not complete'; end if;
  if public.campus_complete_hall_analysis(f.job_id,f.token,
    '{"kind":"found","location_id":"library","keywords":["蓝色","雨伞"],"verified":false}',true,'{}') then raise exception 'Completed job replayed'; end if;
  if (select count(*) from public.notifications where related_type='message' and related_id=f.message_id::text)<>5
    or (select count(*) from public.notifications where type='hall-match' and related_id=f.message_id::text)<>4 then
    raise exception 'Expected only favorite/interest/active-lost/explicit-subscription plus one deduped direct user'; end if;
  if exists(select 1 from public.notifications where related_id=f.message_id::text and recipient_id in (f.author_id,f.disabled_id,f.unrelated_id)) then
    raise exception 'Self/disabled/blank-wildcard user received semantic notification'; end if;
  if (select count(*) from public.notifications where related_id=f.message_id::text and recipient_id=f.direct_id)<>1 then raise exception 'Direct plus semantic double-notified'; end if;
  if (select count(*) from public.campus_events)<>event_count then raise exception 'Chat became a verified campus event'; end if;
  select id into strict f.notice_id from public.notifications where recipient_id=f.favorite_id and related_id=f.message_id::text;
  select id into strict f.push_id from campus_private.information_jobs where kind='push' and target_id=f.notice_id;
  if public.campus_hall_push_context(f.notice_id)->>'deliverable'<>'true' then raise exception 'Eligible semantic context denied'; end if;
  update public.campus_user_preferences set favorite_ids='{}' where user_id=f.favorite_id;
  if exists(select 1 from public.notifications where id=f.notice_id) or public.campus_hall_push_context(f.notice_id)->>'deliverable'<>'false'
    or not exists(select 1 from campus_private.information_jobs where id=f.push_id and status='cancelled') then raise exception 'Favorite removal did not clear pending delivery'; end if;
  select id into strict n from public.notifications where recipient_id=f.interest_id and related_id=f.message_id::text;
  update public.campus_ai_reminder_preferences set enabled=false where user_id=f.interest_id;
  if exists(select 1 from public.notifications where id=n) then raise exception 'Disable left semantic notice'; end if;
  select id into strict n from public.notifications where recipient_id=f.lost_id and related_id=f.message_id::text;
  update public.campus_reports set status='resolved' where id=f.lost_report_id;
  if exists(select 1 from public.notifications where id=n) then raise exception 'Resolved lost report left match'; end if;
  select id into strict n from public.notifications where recipient_id=f.subscriber_id and related_id=f.message_id::text;
  delete from public.campus_subscriptions where user_id=f.subscriber_id and location_id='library' and kind='found';
  if exists(select 1 from public.notifications where id=n) then raise exception 'Unsubscribe left semantic notice'; end if;
  if not exists(select 1 from public.notifications where related_id=f.message_id::text and recipient_id=f.direct_id and type='hall-message') then raise exception 'Semantic cleanup changed direct-region notification'; end if;
  update public.hall_messages set deleted_at=clock_timestamp() where id=f.message_id;
  if exists(select 1 from public.notifications where related_id=f.message_id::text) then raise exception 'Retraction left notification'; end if;

  -- Tiny greetings can complete as none without a model reservation or budget charge.
  insert into public.hall_messages(id,author_id,region_id,content,client_message_id,created_at)
    values(f.second_id,f.author_id,'sports','你好',gen_random_uuid(),clock_timestamp());
  select id into strict f.job_id from campus_private.information_jobs where kind='chat-analysis' and target_id=f.second_id;
  f.token:=gen_random_uuid();
  update campus_private.information_jobs set status='running',attempts=1,claim_token=f.token,lease_until=now()+interval '3 minutes' where id=f.job_id;
  if not public.campus_complete_hall_analysis(f.job_id,f.token,'{"kind":"none","location_id":null,"keywords":[],"verified":false}',false,'{}') then raise exception 'None completion failed'; end if;
  if exists(select 1 from campus_private.hall_message_analysis where message_id=f.second_id and call_started_at is not null)
    or exists(select 1 from public.notifications where type='hall-match' and related_id=f.second_id::text) then raise exception 'Greeting consumed AI or notified'; end if;
  update public.hall_messages set content='图书馆捡到蓝色雨伞' where id=f.second_id;
  if (select count(*) from campus_private.information_jobs where kind='chat-analysis' and target_id=f.second_id)<>1
    or not exists(select 1 from campus_private.hall_message_analysis where message_id=f.second_id and status='cancelled') then
    raise exception 'Message edit was replayed as a new analysis'; end if;
  if campus_private.hall_explicit_location('图书馆') is distinct from 'library'
    or campus_private.hall_explicit_location('操场') is not null
    or campus_private.hall_explicit_location('11号公寓') is distinct from 'apartment-11' then raise exception 'Exact location/number boundary validation failed'; end if;
  update hall_ai_fixture set job_id=f.job_id,token=f.token,notice_id=f.notice_id,push_id=f.push_id;
  perform set_config('request.jwt.claim.sub',f.favorite_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',f.favorite_id,'role','authenticated')::text,true);
end $scenario$;

set local role authenticated;
do $rls$
declare f hall_ai_fixture%rowtype; blocked boolean:=false; affected integer;
begin
  select * into strict f from hall_ai_fixture;
  if (select count(*) from public.campus_ai_reminder_preferences)<>1 then raise exception 'RLS leaked reminder preferences'; end if;
  update public.campus_ai_reminder_preferences set enabled=false where user_id=f.unrelated_id;
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'RLS updated other user preferences'; end if;
  begin
    perform public.campus_begin_hall_analysis(f.job_id,f.token);
  exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Client invoked service-only reservation'; end if;
  blocked:=false;
  begin
    update public.campus_ai_reminder_preferences set interest_keywords=array['a'] where user_id=f.favorite_id;
  exception when check_violation then blocked:=true; end;
  if not blocked then raise exception 'Invalid interest accepted'; end if;
  update public.campus_ai_reminder_preferences set enabled=true,interest_keywords=array['雨伞'] where user_id=f.favorite_id;
end $rls$;
reset role;

do $cap_and_timeout$
declare f hall_ai_fixture%rowtype; v_message_id uuid:=gen_random_uuid(); v_job_id uuid; v_token uuid:=gen_random_uuid(); permit jsonb;
  usage_month date:=(date_trunc('month',now() at time zone 'Asia/Shanghai'))::date;
begin
  select * into strict f from hall_ai_fixture;
  if has_function_privilege('authenticated','public.campus_complete_hall_analysis(uuid,uuid,jsonb,boolean,jsonb)','execute')
    or has_function_privilege('anon','public.campus_begin_hall_analysis(uuid,uuid)','execute')
    or not has_function_privilege('service_role','public.campus_hall_push_context(uuid)','execute') then raise exception 'RPC grants incorrect'; end if;
  insert into public.hall_messages(id,author_id,region_id,content,client_message_id,created_at)
    values(v_message_id,f.author_id,'sports','图书馆捡到蓝色雨伞',gen_random_uuid(),clock_timestamp());
  select j.id into strict v_job_id from campus_private.information_jobs j where j.kind='chat-analysis' and j.target_id=v_message_id;
  update campus_private.information_jobs j set status='running',attempts=1,claim_token=v_token,lease_until=now()+interval '3 minutes' where j.id=v_job_id;
  if public.campus_begin_hall_analysis(v_job_id,v_token)->>'allowed'<>'true' then raise exception 'Timeout fixture reservation failed'; end if;
  perform public.campus_finish_information_job(v_job_id,v_token,'processing_failed');
  if not exists(select 1 from campus_private.information_jobs j where j.id=v_job_id and j.status='failed')
    or not exists(select 1 from campus_private.hall_message_analysis a where a.message_id=v_message_id and a.status='failed' and a.call_started_at is not null) then raise exception 'Attempted HTTP remained retryable'; end if;

  insert into campus_private.hall_analysis_monthly_usage(month,calls) values(usage_month,1000)
    on conflict(month) do update set calls=1000;
  v_message_id:=gen_random_uuid(); v_token:=gen_random_uuid();
  insert into public.hall_messages(id,author_id,region_id,content,client_message_id,created_at)
    values(v_message_id,f.author_id,'sports','图书馆捡到蓝色雨伞',gen_random_uuid(),clock_timestamp());
  select j.id into strict v_job_id from campus_private.information_jobs j where j.kind='chat-analysis' and j.target_id=v_message_id;
  update campus_private.information_jobs j set status='running',attempts=1,claim_token=v_token,lease_until=now()+interval '3 minutes' where j.id=v_job_id;
  permit:=public.campus_begin_hall_analysis(v_job_id,v_token);
  if permit->>'allowed'<>'false'
    or not exists(select 1 from campus_private.hall_message_analysis a where a.message_id=v_message_id and a.status='capped' and a.call_started_at is null)
    or (select calls from campus_private.hall_analysis_monthly_usage where month=usage_month)<>1000 then
    raise exception 'Monthly call cap failed: analysis=%, job=%, usage=%',
      (select to_jsonb(a) from campus_private.hall_message_analysis a where a.message_id=v_message_id),
      (select to_jsonb(j) from campus_private.information_jobs j where j.id=v_job_id),
      (select calls from campus_private.hall_analysis_monthly_usage where month=usage_month); end if;
end $cap_and_timeout$;
-- Functional deletion paths, kept inside this rollback-only transaction.
-- Lock acquisition BEFORE the first row/cascade is checked separately by
-- tools/verifyHallProactiveSql.mjs in eight fresh isolated transactions.
do $hard_delete$
declare f hall_ai_fixture%rowtype; v_message uuid:=gen_random_uuid(); v_user uuid:=gen_random_uuid();
begin
  select * into strict f from hall_ai_fixture;
  insert into public.hall_messages(id,author_id,region_id,content,client_message_id,created_at)
    values(v_message,f.author_id,'teaching','用于删除回归的合成消息',gen_random_uuid(),clock_timestamp());
  delete from public.hall_messages where id=v_message;
  if exists(select 1 from campus_private.hall_message_analysis where message_id=v_message)
    or exists(select 1 from campus_private.information_jobs where kind='chat-analysis' and target_id=v_message and status in ('ready','retry','running')) then
    raise exception 'Hard delete left analysis or runnable job'; end if;
  insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values(v_user,'authenticated','authenticated','hall-delete-fixture-'||v_user::text||'@example.invalid','{}','{}',now(),now());
  insert into public.campus_ai_reminder_preferences(user_id) values(v_user);
  v_message:=gen_random_uuid();
  insert into public.hall_messages(id,author_id,region_id,content,client_message_id,created_at)
    values(v_message,v_user,'sports','用于注销级联回归的合成消息',gen_random_uuid(),clock_timestamp());
  delete from auth.users where id=v_user;
  if exists(select 1 from public.campus_ai_reminder_preferences where user_id=v_user)
    or exists(select 1 from public.hall_messages where id=v_message)
    or exists(select 1 from campus_private.hall_message_analysis where message_id=v_message)
    or exists(select 1 from campus_private.information_jobs where kind='chat-analysis' and target_id=v_message and status in ('ready','retry','running')) then
    raise exception 'Account deletion left reminder state or runnable job'; end if;
  if has_function_privilege('authenticated','campus_private.hall_match_statement_gate()','execute') then
    raise exception 'Client can invoke internal statement gate'; end if;
end $hard_delete$;
select 'passed: opt-in, exact recipient facts, no self/broadcast, model once, budget cap, dedupe, RLS, invalidation; fixtures rolled back' as regression_result;
rollback;
