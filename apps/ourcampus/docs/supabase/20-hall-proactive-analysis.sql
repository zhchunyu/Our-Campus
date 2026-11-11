-- Review candidate; NOT automatically applied. Requires production 09/10/19.
-- Only future hall_messages INSERTs are queued. No historical backfill or external calls.
-- 1000 is a MONTHLY AUTOMATIC CHAT ANALYSIS CALL cap, not a total invoice cap.
begin;

create or replace function campus_private.valid_hall_interests(words text[])
returns boolean language sql immutable set search_path='' as $f$
  select words is not null and coalesce(array_ndims(words),1)=1 and cardinality(words)<=8
    and octet_length(array_to_string(words,''))<=512
    and not exists(select 1 from unnest(words) w where w is null or w<>btrim(w) or char_length(w) not between 2 and 16)
    and cardinality(words)=(select count(distinct w) from unnest(words) w);
$f$;
create table if not exists public.campus_ai_reminder_preferences (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  use_favorites boolean not null default true,
  match_lost boolean not null default true,
  interest_keywords text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campus_ai_reminder_keywords_check check(campus_private.valid_hall_interests(interest_keywords))
);
alter table public.campus_ai_reminder_preferences enable row level security;
revoke all on public.campus_ai_reminder_preferences from public,anon,authenticated;
grant select,insert,update,delete on public.campus_ai_reminder_preferences to authenticated;
grant all on public.campus_ai_reminder_preferences to service_role;
drop policy if exists ai_reminder_own on public.campus_ai_reminder_preferences;
create policy ai_reminder_own on public.campus_ai_reminder_preferences for all to authenticated
  using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create or replace function campus_private.stamp_hall_reminder_preferences()
returns trigger language plpgsql set search_path='' as $f$
begin
  if tg_op='INSERT' then new.created_at:=clock_timestamp(); else new.created_at:=old.created_at; end if;
  new.updated_at:=clock_timestamp(); return new;
end $f$;
drop trigger if exists ai_reminder_stamp on public.campus_ai_reminder_preferences;
create trigger ai_reminder_stamp before insert or update on public.campus_ai_reminder_preferences
  for each row execute function campus_private.stamp_hall_reminder_preferences();

create table if not exists campus_private.hall_message_analysis (
  message_id uuid primary key references public.hall_messages(id) on delete cascade,
  source_hash text not null,
  status text not null default 'pending' check(status in ('pending','complete','failed','cancelled','capped')),
  call_started_at timestamptz,
  analysis jsonb not null default '{}',
  input_tokens integer not null default 0 check(input_tokens between 0 and 100000),
  output_tokens integer not null default 0 check(output_tokens between 0 and 100000),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create table if not exists campus_private.hall_analysis_monthly_usage (
  month date primary key,
  calls integer not null default 0 check(calls between 0 and 1000)
);
alter table campus_private.hall_message_analysis enable row level security;
alter table campus_private.hall_analysis_monthly_usage enable row level security;
revoke all on campus_private.hall_message_analysis,campus_private.hall_analysis_monthly_usage from public,anon,authenticated;
grant all on campus_private.hall_message_analysis,campus_private.hall_analysis_monthly_usage to service_role;
alter table campus_private.information_jobs drop constraint if exists information_jobs_kind_check;
alter table campus_private.information_jobs add constraint information_jobs_kind_check check(kind in ('analysis','push','chat-analysis'));
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check(type in ('lost-found','facility-review','feedback-review','hall-reply','campus-event','hall-message','hall-match'));

create or replace function campus_private.enqueue_hall_analysis()
returns trigger language plpgsql security definer set search_path='' as $f$
begin
  if new.deleted_at is not null then return new; end if;
  insert into campus_private.hall_message_analysis(message_id,source_hash) values(new.id,md5(new.content)) on conflict do nothing;
  insert into campus_private.information_jobs(kind,target_id) values('chat-analysis',new.id) on conflict do nothing;
  return new;
end $f$;
drop trigger if exists hall_analysis_enqueue on public.hall_messages;
create trigger hall_analysis_enqueue after insert on public.hall_messages
  for each row execute function campus_private.enqueue_hall_analysis();

-- Every app mutator reaches this gate before row locks/cascades. A ROW
-- trigger is too late: PostgreSQL can already hold its target tuple lock.
-- No network/model call occurs in these short database transactions.
create or replace function campus_private.hall_match_statement_gate()
returns trigger language plpgsql security definer set search_path='' as $f$
begin
  perform pg_advisory_xact_lock(hashtext('campus-hall-matches'));
  return null;
end $f$;
do $gates$
declare relation text;
begin
  foreach relation in array array['hall_messages','campus_reports','campus_user_preferences','campus_subscriptions','campus_ai_reminder_preferences'] loop
    execute format('drop trigger if exists hall_match_statement_gate on public.%I',relation);
    execute format('create trigger hall_match_statement_gate before update or delete on public.%I for each statement execute function campus_private.hall_match_statement_gate()',relation);
  end loop;
end $gates$;
-- User deletion can cascade through the same rows; acquire before auth.users
-- row locks too. Signup, login and ordinary auth updates are unaffected.
drop trigger if exists hall_match_delete_gate on auth.users;
create trigger hall_match_delete_gate before delete on auth.users for each statement
  execute function campus_private.hall_match_statement_gate();

-- Existing app RPCs sometimes SELECT ... FOR UPDATE before their first UPDATE.
-- Prefix their EXACT audited bodies rather than replacing business behaviour.
-- Original/after-prefix hashes make this idempotent and reject source drift.
do $legacy_gates$
declare f record; source text; definition text; gate text := E'\n  perform pg_advisory_xact_lock(hashtext(''campus-hall-matches'')); -- hall_gate_v20\n'; begin_at integer;
begin
  for f in select * from (values
    ('public.campus_change_preferences(text,jsonb)','80ed215d561d2cc8ce2d829ff56b3ff7'),
    ('public.campus_complete_information_analysis(uuid,uuid,jsonb,uuid,uuid)','e4e5514c68d8d81f4b796b72f28545ac'),
    ('public.campus_process_repair(uuid,text,text)','ddb49f1e40db7456d4aa875e23984f24'),
    ('public.campus_retry_information_report(uuid)','c97517554f3aa55a8c15973e5764e601'),
    ('public.campus_review_report(uuid,boolean,text,text,text,text,timestamp with time zone,text,uuid)','b21034b035ac454c13d460e3772c2dac'),
    ('public.campus_set_report_status(uuid,text)','6f60015de0a92e0abcca6c53df28d116')
  ) v(signature,source_hash) loop
    select p.prosrc,pg_get_functiondef(p.oid) into source,definition
      from pg_proc p where p.oid=to_regprocedure(f.signature);
    if not found then raise exception 'Required app RPC is missing: %',f.signature; end if;
    if strpos(source,gate)>0 then
      if md5(replace(source,gate,''))<>f.source_hash then raise exception 'Audited app RPC changed after hall gate: %',f.signature; end if;
      continue;
    end if;
    if md5(source)<>f.source_hash then raise exception 'App RPC source drift; review its lock order before deploying: %',f.signature; end if;
    begin_at:=strpos(lower(source),'begin');
    if begin_at=0 then raise exception 'Missing app RPC begin: %',f.signature; end if;
    execute replace(definition,source,overlay(source placing 'begin'||gate from begin_at for 5));
  end loop;
end $legacy_gates$;

-- Exact literal aliases only, excluding generic ambiguous names and digit suffix matches.
-- If independent places remain, return NULL; hall region never supplies a building.
create or replace function campus_private.hall_explicit_location(p_text text)
returns text language sql stable security invoker set search_path='' as $f$
  with names as (
    select distinct l.id,a.alias from public.campus_locations l
    cross join lateral unnest(array[l.name]||l.aliases) a(alias)
    where char_length(a.alias)>=2 and a.alias<>all(array['餐厅','食堂','学生食堂','教学楼','教学科研楼','校门','北门','操场','医院','宿舍','公寓','车间','篮球','网球'])
  ), hits as (
    select n.id,n.alias,p.pos from names n cross join lateral generate_series(1,char_length(p_text)) p(pos)
    where substring(p_text from p.pos for char_length(n.alias))=n.alias
      and (n.alias !~ '^[0-9]' or p.pos=1 or substring(p_text from p.pos-1 for 1) !~ '[0-9]')
  ), exact as (
    select h.id from hits h where not exists(select 1 from hits longer
      where longer.pos<=h.pos and longer.pos+char_length(longer.alias)>=h.pos+char_length(h.alias)
        and char_length(longer.alias)>char_length(h.alias))
  ) select case when count(distinct id)=1 then min(id) else null end from exact;
$f$;

-- Service database facts choose recipients. No API accepts a recipient list from AI.
create or replace function campus_private.hall_matches_user(p_message_id uuid,p_user_id uuid)
returns boolean language sql stable security invoker set search_path='' as $f$
  select exists(
    select 1 from public.hall_messages m
    join campus_private.hall_message_analysis a on a.message_id=m.id and a.status='complete' and a.source_hash=md5(m.content)
    join public.campus_ai_reminder_preferences p on p.user_id=p_user_id and p.enabled and p.updated_at<=m.created_at
    where m.id=p_message_id and m.deleted_at is null and m.author_id<>p.user_id
      and m.created_at>now()-interval '24 hours' and a.analysis->>'kind'<>'none'
      and (
        (p.use_favorites and exists(select 1 from public.campus_user_preferences f
          where f.user_id=p.user_id and f.updated_at<=m.created_at and a.analysis->>'location_id'=any(f.favorite_ids)))
        or exists(select 1 from public.campus_subscriptions s where s.user_id=p.user_id and s.created_at<=m.created_at
          and s.kind<>'hall-message' and (s.kind<>'' or s.location_id<>'')
          and s.kind in ('',a.analysis->>'kind')
          and (s.location_id='' or s.location_id=a.analysis->>'location_id'))
        or exists(select 1 from unnest(p.interest_keywords) word where position(lower(word) in lower(m.content))>0)
        or (p.match_lost and a.analysis->>'kind' in ('lost','found') and a.analysis->>'location_id' is not null
          and exists(select 1 from public.campus_reports r where r.author_id=p.user_id
            and r.kind=case when a.analysis->>'kind'='lost' then 'found' else 'lost' end
            and r.status in ('submitted','analyzed') and r.location_id=a.analysis->>'location_id'
            and r.created_at>now()-interval '30 days' and r.created_at<=m.created_at
            and (select count(*) from jsonb_array_elements_text(a.analysis->'keywords') w(word)
              where w.word<>all(array['丢了','丢失','捡到','失物','招领','寻物','东西','物品','联系','失主'])
                and not exists(select 1 from public.campus_locations l where l.id=r.location_id and w.word=any(array[l.name]||l.aliases))
                and not exists(select 1 from jsonb_array_elements_text(a.analysis->'keywords') longer(word)
                  where char_length(longer.word)>char_length(w.word) and position(w.word in longer.word)>0)
                and position(lower(w.word) in lower(r.title||' '||r.body))>0)>=2))
      )
  );
$f$;

-- Begin is a durable one-shot reservation, committed before the external HTTP call.
-- A timeout/crash after call_started_at is terminal; it does not retry model HTTP.
create or replace function public.campus_begin_hall_analysis(p_id uuid,p_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $f$
declare j campus_private.information_jobs; a campus_private.hall_message_analysis; m public.hall_messages;
  usage_month date:=(date_trunc('month',now() at time zone 'Asia/Shanghai'))::date; reserved integer;
begin
  perform pg_advisory_xact_lock(hashtext('campus-hall-matches'));
  select * into j from campus_private.information_jobs where id=p_id and kind='chat-analysis' and status='running'
    and claim_token=p_token and lease_until>now() for update;
  if not found then return jsonb_build_object('allowed',false); end if;
  select * into a from campus_private.hall_message_analysis where message_id=j.target_id for update;
  if not found or a.status<>'pending' or a.call_started_at is not null then return jsonb_build_object('allowed',false); end if;
  select * into m from public.hall_messages where id=j.target_id;
  if not found or m.deleted_at is not null or md5(m.content)<>a.source_hash or m.created_at<=now()-interval '24 hours' then
    update campus_private.hall_message_analysis set status='cancelled',completed_at=now() where message_id=j.target_id;
    update campus_private.information_jobs set status='cancelled',claim_token=null,lease_until=null where id=p_id;
    return jsonb_build_object('allowed',false);
  end if;
  insert into campus_private.hall_analysis_monthly_usage(month,calls) values(usage_month,1)
    on conflict(month) do update set calls=hall_analysis_monthly_usage.calls+1 where hall_analysis_monthly_usage.calls<1000
    returning calls into reserved;
  if reserved is null then
    update campus_private.hall_message_analysis set status='capped',completed_at=now() where message_id=j.target_id;
    update campus_private.information_jobs set status='done',claim_token=null,lease_until=null where id=p_id;
    return jsonb_build_object('allowed',false);
  end if;
  update campus_private.hall_message_analysis set call_started_at=clock_timestamp() where message_id=j.target_id;
  -- Return no author/recipient IDs, profile, device fields, image paths or contacts table.
  return jsonb_build_object('allowed',true,'content',m.content);
end $f$;

create or replace function public.campus_complete_hall_analysis(p_id uuid,p_token uuid,p_analysis jsonb,
  p_model_used boolean default true,p_usage jsonb default '{}')
returns boolean language plpgsql security definer set search_path='' as $f$
declare j campus_private.information_jobs; a campus_private.hall_message_analysis; m public.hall_messages; word jsonb;
begin
  -- Serializes completion with consent/source cleanup without locking user tables.
  perform pg_advisory_xact_lock(hashtext('campus-hall-matches'));
  select * into j from campus_private.information_jobs where id=p_id and kind='chat-analysis' and status='running'
    and claim_token=p_token and lease_until>now() for update;
  if not found then return false; end if;
  select * into a from campus_private.hall_message_analysis where message_id=j.target_id for update;
  if not found or a.status<>'pending' or (p_model_used and a.call_started_at is null)
    or (not p_model_used and a.call_started_at is not null) then return false; end if;
  select * into m from public.hall_messages where id=j.target_id;
  if not found or m.deleted_at is not null or md5(m.content)<>a.source_hash or m.created_at<=now()-interval '24 hours' then
    update campus_private.hall_message_analysis set status='cancelled',completed_at=now() where message_id=j.target_id;
    update campus_private.information_jobs set status='cancelled',claim_token=null,lease_until=null where id=p_id;
    return false;
  end if;
  if p_model_used is null or p_analysis is null or jsonb_typeof(p_analysis)<>'object' or octet_length(p_analysis::text)>1600
    or not(p_analysis ?& array['kind','location_id','keywords','verified'])
    or (p_analysis-array['kind','location_id','keywords','verified'])<>'{}'::jsonb
    or p_analysis->>'kind' is null or p_analysis->>'kind' not in ('none','construction','closure','water-power','crowd','notice','lost','found','repair','feedback')
    or p_analysis->'verified' is distinct from 'false'::jsonb or jsonb_typeof(p_analysis->'keywords')<>'array'
    or jsonb_array_length(p_analysis->'keywords')>5
    or (not p_model_used and p_analysis->>'kind'<>'none') then raise exception 'Invalid bounded chat analysis'; end if;
  if p_analysis->'location_id'<>'null'::jsonb and (jsonb_typeof(p_analysis->'location_id')<>'string'
    or (p_analysis->>'location_id') is distinct from campus_private.hall_explicit_location(m.content)) then
    raise exception 'Chat location was not explicitly and uniquely stated'; end if;
  if p_analysis->>'kind'='none' and (p_analysis->'location_id'<>'null'::jsonb or p_analysis->'keywords'<>'[]'::jsonb) then
    raise exception 'None classification must not contain matching features'; end if;
  for word in select value from jsonb_array_elements(p_analysis->'keywords') loop
    if jsonb_typeof(word)<>'string' or char_length(word#>>'{}') not between 2 and 16
      or position(word#>>'{}' in m.content)=0 or word#>>'{}' ~ '省略|[0-9]{5}' then raise exception 'Chat keyword was not an allowed source substring'; end if;
  end loop;
  if jsonb_array_length(p_analysis->'keywords')<>(select count(distinct value) from jsonb_array_elements(p_analysis->'keywords')) then
    raise exception 'Duplicate chat keyword'; end if;
  if p_usage is null or jsonb_typeof(p_usage)<>'object' or (p_usage-array['input_tokens','output_tokens'])<>'{}'::jsonb
    or exists(select 1 from jsonb_each(p_usage) kv where jsonb_typeof(kv.value)<>'number' or kv.value::text !~ '^[0-9]{1,6}$') then
    raise exception 'Invalid usage counters'; end if;
  update campus_private.hall_message_analysis set status='complete',analysis=p_analysis,completed_at=now(),
    input_tokens=coalesce((p_usage->>'input_tokens')::integer,0),output_tokens=coalesce((p_usage->>'output_tokens')::integer,0)
    where message_id=j.target_id;
  insert into public.notifications(recipient_id,type,title,body,related_type,related_id,dedupe_key)
    select p.user_id,'hall-match','有与你相关的校园聊天线索',
      '根据你明确设置的关注项找到一条公开聊天线索，内容尚未核实，打开查看。','message',m.id::text,'hall-message:'||m.id::text
    from public.campus_ai_reminder_preferences p where p.enabled and campus_private.hall_matches_user(m.id,p.user_id)
    on conflict(recipient_id,dedupe_key) where dedupe_key is not null do nothing;
  return public.campus_finish_information_job(p_id,p_token,null);
end $f$;

-- Preserve the 09 job behaviour for reports/push. Chat HTTP becomes terminal once reserved.
create or replace function public.campus_claim_information_jobs(p_limit integer default 2)
returns setof campus_private.information_jobs language plpgsql security definer set search_path='' as $f$
begin
  perform pg_advisory_xact_lock(hashtext('campus-hall-matches'));
  update campus_private.information_jobs j set status='failed',last_error='chat_analysis_call_not_replayed',claim_token=null,lease_until=null
    where j.kind='chat-analysis' and j.status='running' and j.lease_until<now()
      and exists(select 1 from campus_private.hall_message_analysis a where a.message_id=j.target_id and a.call_started_at is not null);
  update campus_private.information_jobs set status='failed',last_error='达到最大重试次数'
    where status='running' and lease_until<now() and attempts>=5;
  update campus_private.hall_message_analysis a set status='failed',completed_at=now()
    where a.status='pending' and exists(select 1 from campus_private.information_jobs j where j.kind='chat-analysis' and j.target_id=a.message_id and j.status='failed');
  update public.campus_reports r set analysis_status='failed',updated_at=now()
    where r.status='submitted' and r.analysis_status='pending' and exists(select 1 from campus_private.information_jobs j
      where j.kind='analysis' and j.target_id=r.id and j.status='failed');
  return query with candidates as (
    select id from campus_private.information_jobs where attempts<5 and
      ((status in ('ready','retry') and available_at<=now()) or (status='running' and lease_until<now()))
      order by available_at,created_at for update skip locked limit greatest(1,least(p_limit,5))
  ) update campus_private.information_jobs j set status='running',attempts=j.attempts+1,
      lease_until=now()+interval '3 minutes',claim_token=gen_random_uuid()
    from candidates c where j.id=c.id returning j.*;
end $f$;
create or replace function public.campus_finish_information_job(p_id uuid,p_token uuid,p_error text default null)
returns boolean language plpgsql security definer set search_path='' as $f$
declare j campus_private.information_jobs; attempted boolean;
begin
  perform pg_advisory_xact_lock(hashtext('campus-hall-matches'));
  select * into j from campus_private.information_jobs where id=p_id and status='running' and claim_token=p_token and lease_until>now() for update;
  if not found then return false; end if;
  attempted:=j.kind='chat-analysis' and exists(select 1 from campus_private.hall_message_analysis a where a.message_id=j.target_id and a.call_started_at is not null);
  update campus_private.information_jobs set status=case when p_error is null then 'done' when attempted or attempts>=5 then 'failed' else 'retry' end,
    last_error=left(p_error,200),available_at=now()+make_interval(secs=>least(3600,30*power(2,attempts)::integer)),claim_token=null,lease_until=null where id=p_id;
  if j.kind='chat-analysis' and p_error is not null and (attempted or j.attempts>=5) then
    update campus_private.hall_message_analysis set status='failed',completed_at=now() where message_id=j.target_id and status='pending';
  end if;
  if j.kind='analysis' and p_error is not null then update public.campus_reports set analysis_status='failed',updated_at=now()
    where id=j.target_id and status='submitted'; end if;
  return true;
end $f$;

-- Invalidation is also checked immediately before every provider request/retry.
create or replace function public.campus_hall_push_context(p_notification_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $f$
  select coalesce((select jsonb_build_object('deliverable',true,'region_id',m.region_id,'message_id',m.id)
    from public.notifications n join public.hall_messages m on m.id::text=n.related_id
    where n.id=p_notification_id and n.related_type='message' and n.read_at is null
      and m.deleted_at is null and n.recipient_id<>m.author_id
      and (
        (n.type='hall-message' and exists(select 1 from public.campus_subscriptions s where s.user_id=n.recipient_id
          and s.kind='hall-message' and s.location_id='hall-region:'||m.region_id and s.created_at<=m.created_at))
        or (n.type='hall-match' and n.dedupe_key='hall-message:'||m.id::text and campus_private.hall_matches_user(m.id,n.recipient_id))
      )),jsonb_build_object('deliverable',false));
$f$;

create or replace function campus_private.clean_invalid_hall_matches(p_user_id uuid default null)
returns void language plpgsql security definer set search_path='' as $f$
begin
  perform pg_advisory_xact_lock(hashtext('campus-hall-matches'));
  update campus_private.information_jobs j set status='cancelled',claim_token=null,lease_until=null
    where j.kind='push' and j.status in ('ready','retry','running') and exists(
      select 1 from public.notifications n where n.id=j.target_id and n.type='hall-match' and n.related_type='message'
        and (p_user_id is null or n.recipient_id=p_user_id)
        and not campus_private.hall_matches_user(n.related_id::uuid,n.recipient_id));
  delete from public.notifications n where n.type='hall-match' and n.related_type='message'
    and (p_user_id is null or n.recipient_id=p_user_id)
    and not campus_private.hall_matches_user(n.related_id::uuid,n.recipient_id);
end $f$;
create or replace function campus_private.hall_match_preference_cleanup()
returns trigger language plpgsql security definer set search_path='' as $f$
begin
  if tg_table_name='campus_reports' then
    -- Only this report's author can lose an opposite lost/found match.
    perform campus_private.clean_invalid_hall_matches(old.author_id);
    if tg_op='UPDATE' and new.author_id is distinct from old.author_id then
      perform campus_private.clean_invalid_hall_matches(new.author_id);
    end if;
  elsif tg_op='DELETE' then perform campus_private.clean_invalid_hall_matches(old.user_id);
  else perform campus_private.clean_invalid_hall_matches(new.user_id); end if;
  if tg_op='DELETE' then return old; else return new; end if;
end $f$;
drop trigger if exists hall_match_preference_cleanup on public.campus_ai_reminder_preferences;
create trigger hall_match_preference_cleanup after update or delete on public.campus_ai_reminder_preferences
  for each row execute function campus_private.hall_match_preference_cleanup();
drop trigger if exists hall_match_favorite_cleanup on public.campus_user_preferences;
create trigger hall_match_favorite_cleanup after update or delete on public.campus_user_preferences
  for each row execute function campus_private.hall_match_preference_cleanup();
drop trigger if exists hall_match_subscription_cleanup on public.campus_subscriptions;
create trigger hall_match_subscription_cleanup after update or delete on public.campus_subscriptions
  for each row execute function campus_private.hall_match_preference_cleanup();
drop trigger if exists hall_match_report_cleanup on public.campus_reports;
create trigger hall_match_report_cleanup after update or delete on public.campus_reports
  for each row execute function campus_private.hall_match_preference_cleanup();

create or replace function campus_private.cancel_changed_hall_analysis()
returns trigger language plpgsql security definer set search_path='' as $f$
begin
  if new.content is not distinct from old.content then return new; end if;
  perform pg_advisory_xact_lock(hashtext('campus-hall-matches'));
  update campus_private.information_jobs set status='cancelled',claim_token=null,lease_until=null
    where kind='chat-analysis' and target_id=new.id and status in ('ready','retry','running');
  update campus_private.hall_message_analysis set status='cancelled',completed_at=now() where message_id=new.id;
  update campus_private.information_jobs j set status='cancelled',claim_token=null,lease_until=null
    where j.kind='push' and j.status in ('ready','retry','running') and exists(
      select 1 from public.notifications n where n.id=j.target_id and n.type='hall-match'
        and n.related_type='message' and n.related_id=new.id::text);
  delete from public.notifications where type='hall-match' and related_type='message' and related_id=new.id::text;
  return new;
end $f$;
drop trigger if exists hall_analysis_content_cleanup on public.hall_messages;
create trigger hall_analysis_content_cleanup after update of content on public.hall_messages
  for each row execute function campus_private.cancel_changed_hall_analysis();

-- Extend existing 19 withdrawal handling, preserving explicit-region semantics.
create or replace function campus_private.cancel_hall_message_notifications()
returns trigger language plpgsql security definer set search_path='' as $f$
begin
  if tg_op='UPDATE' and new.deleted_at is null then return new; end if;
  perform pg_advisory_xact_lock(hashtext('campus-hall-matches'));
  update campus_private.information_jobs j set status='cancelled',claim_token=null,lease_until=null
    where j.status in ('ready','retry','running') and (
      (j.kind='chat-analysis' and j.target_id=old.id) or (j.kind='push' and exists(
        select 1 from public.notifications n where n.id=j.target_id and n.type in ('hall-message','hall-match')
          and n.related_type='message' and n.related_id=old.id::text)));
  update campus_private.hall_message_analysis set status='cancelled',completed_at=now() where message_id=old.id;
  delete from public.notifications n where n.type in ('hall-message','hall-match') and n.related_type='message' and n.related_id=old.id::text;
  if tg_op='DELETE' then return old; else return new; end if;
end $f$;

-- Functions whose table checks are evaluated as authenticated need only these
-- innocuous validators; private lookup/mutation routines remain server-only.
grant usage on schema campus_private to service_role;
revoke all on function campus_private.valid_hall_interests(text[]) from public,anon;
grant execute on function campus_private.valid_hall_interests(text[]) to authenticated,service_role;
do $permissions$
declare f record;
begin
  for f in select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='public' and p.proname in ('campus_begin_hall_analysis','campus_complete_hall_analysis','campus_claim_information_jobs','campus_finish_information_job','campus_hall_push_context'))
      or (n.nspname='campus_private' and p.proname in ('enqueue_hall_analysis','hall_explicit_location','hall_matches_user','clean_invalid_hall_matches','hall_match_preference_cleanup','cancel_hall_message_notifications','cancel_changed_hall_analysis','stamp_hall_reminder_preferences','hall_match_statement_gate')) loop
    execute format('revoke all on function %I.%I(%s) from public,anon,authenticated',f.nspname,f.proname,f.args);
    execute format('grant execute on function %I.%I(%s) to service_role',f.nspname,f.proname,f.args);
  end loop;
end $permissions$;
commit;
notify pgrst,'reload schema';
