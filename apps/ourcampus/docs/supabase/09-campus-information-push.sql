-- 增量迁移：在已有 01-CampusTwin-schema.sql 数据库执行；不重建或清空旧表。
begin;
create schema if not exists campus_private;

create table if not exists public.campus_reports (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id uuid not null,
  kind text not null check(kind in ('construction','closure','water-power','crowd','notice','lost','found','repair','feedback')),
  title text not null check(char_length(btrim(title)) between 1 and 80),
  body text not null check(char_length(btrim(body)) between 1 and 1500),
  location_id text references public.campus_locations(id),
  details jsonb not null default '{}' check(octet_length(details::text) < 12000),
  source_message_id uuid references public.hall_messages(id) on delete set null,
  status text not null default 'submitted' check(status in ('submitted','analyzed','published','resolved','withdrawn','rejected')),
  analysis_status text not null default 'pending' check(analysis_status in ('pending','complete','failed')),
  analysis jsonb not null default '{}',
  related_report_id uuid references public.campus_reports(id) on delete set null,
  related_event_id uuid references public.campus_events(id) on delete set null,
  event_id uuid references public.campus_events(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(author_id,client_id)
);
create index if not exists campus_reports_time_idx on public.campus_reports(created_at desc);

create table if not exists public.campus_subscriptions (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  location_id text not null default '', -- 空字符串表示全部地点
  kind text not null default '' check(kind in ('','construction','closure','water-power','crowd','notice','lost','found','repair','feedback')),
  created_at timestamptz not null default now(),
  primary key(user_id,location_id,kind)
);
create table if not exists public.campus_push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  installation_id uuid not null,
  cid text not null check(char_length(cid) between 8 and 160),
  provider text not null default 'getui' check(provider='getui'),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  unique(installation_id), unique(cid)
);
create table if not exists campus_private.information_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check(kind in ('analysis','push')),
  target_id uuid not null,
  status text not null default 'ready' check(status in ('ready','running','retry','done','failed','cancelled')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  lease_until timestamptz,
  claim_token uuid,
  last_error text,
  created_at timestamptz not null default now(),
  unique(kind,target_id)
);
create index if not exists information_jobs_ready_idx on campus_private.information_jobs(status,available_at);
alter table campus_private.information_jobs enable row level security;
revoke all on campus_private.information_jobs from public,anon,authenticated;
grant all on campus_private.information_jobs to service_role;
create table if not exists public.campus_push_receipts (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  device_id uuid not null references public.campus_push_devices(id) on delete cascade,
  provider_result text not null check(provider_result='accepted'),
  accepted_at timestamptz not null default now(),
  primary key(notification_id,device_id)
);
alter table public.campus_push_receipts enable row level security;
revoke all on public.campus_push_receipts from public,anon,authenticated;
grant all on public.campus_push_receipts to service_role;
alter table public.notifications add column if not exists dedupe_key text;
create unique index if not exists campus_notification_dedupe_idx on public.notifications(recipient_id,dedupe_key) where dedupe_key is not null;
alter table public.campus_events add column if not exists information_kind text;
alter table public.campus_events add column if not exists information_scope text check(information_scope in ('all','subscribers'));
alter table public.campus_events add column if not exists information_revision integer not null default 1;

alter table public.campus_reports enable row level security;
alter table public.campus_subscriptions enable row level security;
alter table public.campus_push_devices enable row level security;
revoke all on public.campus_reports,public.campus_subscriptions,public.campus_push_devices from anon,authenticated;
grant select on public.campus_reports to authenticated;
grant select,delete on public.campus_subscriptions to authenticated;
grant insert(location_id,kind) on public.campus_subscriptions to authenticated;
grant select on public.campus_push_devices to authenticated;
grant all on public.campus_reports,public.campus_subscriptions,public.campus_push_devices to service_role;
drop policy if exists information_report_read on public.campus_reports;
create policy information_report_read on public.campus_reports for select to authenticated using (
  author_id=(select auth.uid()) or (select public.campus_is_manager())
  or status='published' or (kind in ('lost','found') and status in ('submitted','analyzed','resolved'))
);
drop policy if exists information_subscribe_own on public.campus_subscriptions;
create policy information_subscribe_own on public.campus_subscriptions for all to authenticated
  using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()) and
    (location_id='' or exists(select 1 from public.campus_locations l where l.id=location_id)));
drop policy if exists information_device_read_own on public.campus_push_devices;
create policy information_device_read_own on public.campus_push_devices for select to authenticated using(user_id=(select auth.uid()));

create or replace function public.campus_submit_report(p_client_id uuid,p_kind text,p_title text,p_body text,
  p_location_id text default null,p_details jsonb default '{}',p_source_message_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; previous public.campus_reports;
begin
  if auth.uid() is null then raise exception '请先登录'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  if not exists(select 1 from public.campus_reports where author_id=auth.uid() and client_id=p_client_id)
    and (select count(*) from public.campus_reports where author_id=auth.uid() and created_at>now()-interval '1 minute')>=10 then
    raise exception '发布过于频繁，请稍后再试'; end if;
  if p_source_message_id is not null and not exists(select 1 from public.hall_messages
    where id=p_source_message_id and author_id=auth.uid() and deleted_at is null) then
    raise exception '只能提交自己尚未撤回的聊天消息'; end if;
  insert into public.campus_reports(client_id,author_id,kind,title,body,location_id,details,source_message_id)
    values(p_client_id,auth.uid(),p_kind,btrim(p_title),btrim(p_body),p_location_id,coalesce(p_details,'{}'),p_source_message_id)
    on conflict(author_id,client_id) do nothing returning id into result;
  if result is null then
    select * into previous from public.campus_reports where author_id=auth.uid() and client_id=p_client_id;
    if previous.kind is distinct from p_kind or previous.title is distinct from btrim(p_title)
      or previous.body is distinct from btrim(p_body) or previous.location_id is distinct from p_location_id
      or previous.details is distinct from coalesce(p_details,'{}') or previous.source_message_id is distinct from p_source_message_id then
      raise exception '上次提交已保存；修改内容请使用新的发布表单，避免重复提交';
    end if;
    result:=previous.id;
  end if;
  return result;
end $$;

create or replace function campus_private.enqueue_report_analysis() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into campus_private.information_jobs(kind,target_id) values('analysis',new.id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists information_analysis_enqueue on public.campus_reports;
create trigger information_analysis_enqueue after insert on public.campus_reports for each row execute function campus_private.enqueue_report_analysis();
create or replace function campus_private.enqueue_notification_push() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into campus_private.information_jobs(kind,target_id) values('push',new.id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists information_push_enqueue on public.notifications;
create trigger information_push_enqueue after insert on public.notifications for each row execute function campus_private.enqueue_notification_push();

create or replace function public.campus_set_report_status(p_id uuid,p_status text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.campus_reports;
begin
  select * into r from public.campus_reports where id=p_id and author_id=auth.uid() for update;
  if not found then raise exception '没有操作权限'; end if;
  if p_status not in ('withdrawn','resolved') then raise exception '状态不允许'; end if;
  if p_status='resolved' and r.kind not in ('lost','found','repair') then raise exception '此类信息请由管理员结束'; end if;
  update public.campus_reports set status=p_status,updated_at=now() where id=p_id;
  update campus_private.information_jobs set status='cancelled',claim_token=null where kind='analysis' and target_id=p_id and status not in ('done','cancelled');
  -- 已审核的官方事件不会因某个上报者撤回而直接消失，应由管理员确认结束。
end $$;

create or replace function public.campus_register_push_device(p_installation_id uuid,p_cid text) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  if auth.uid() is null then raise exception '请先登录'; end if;
  if exists(select 1 from public.campus_push_devices where cid=p_cid and installation_id<>p_installation_id) then
    raise exception '设备标识已登记，请重新开启通知'; end if;
  insert into public.campus_push_devices(user_id,installation_id,cid,enabled)
    values(auth.uid(),p_installation_id,p_cid,true)
    on conflict(installation_id) do update set user_id=auth.uid(),cid=excluded.cid,enabled=true,updated_at=now()
    returning id into result;
  return result;
end $$;
create or replace function public.campus_disable_push_device(p_installation_id uuid) returns void
language sql security definer set search_path='' as $$
  update public.campus_push_devices set enabled=false,updated_at=now() where user_id=auth.uid() and installation_id=p_installation_id;
$$;

create or replace function campus_private.issue_event_notices(p_event_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare e public.campus_events;
begin
  select * into e from public.campus_events where id=p_event_id;
  insert into public.notifications(recipient_id,type,title,body,related_type,related_id,dedupe_key)
  select u.id,'campus-event',case when e.status='closed' then '校园通知已结束：' else '校园通知：' end || e.title,
    left(e.impact,250),'event',e.id::text,'information-event:'||e.id::text||':'||e.information_revision
  from auth.users u where e.information_scope='all' or exists(select 1 from public.campus_subscriptions s
    where s.user_id=u.id and s.location_id in ('',e.location_id) and s.kind in ('',e.information_kind))
  on conflict(recipient_id,dedupe_key) where dedupe_key is not null do nothing;
end $$;

create or replace function public.campus_review_report(p_id uuid,p_publish boolean,p_title text default '',p_summary text default '',
  p_location_id text default null,p_kind text default 'notice',p_end_at timestamptz default null,p_scope text default 'subscribers',p_event_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.campus_reports; result uuid; event_type text;
begin
  if not coalesce(public.campus_is_manager(),false) then raise exception '仅管理员可审核'; end if;
  select * into r from public.campus_reports where id=p_id for update;
  if not found or r.status in ('withdrawn','resolved','rejected') then raise exception '信息已失效'; end if;
  if r.event_id is not null then return r.event_id; end if;
  if not p_publish then update public.campus_reports set status='rejected',updated_at=now() where id=p_id; return null; end if;
  if p_kind in ('lost','found') then raise exception '失物信息请使用匹配流程'; end if;
  if p_scope not in ('all','subscribers') or p_kind not in ('construction','closure','water-power','crowd','notice','repair','feedback')
    or char_length(btrim(p_title)) not between 1 and 80 or char_length(btrim(p_summary)) not between 1 and 1500
    or p_location_id is null or p_end_at is null or p_end_at<=now() then raise exception '请确认标题、说明、地点和有效结束时间'; end if;
  -- 公共通行与停水停电通知不受订阅条件限制。
  if p_kind in ('construction','closure','water-power') then p_scope:='all'; end if;
  event_type:=case when p_kind in ('construction','closure','crowd') then p_kind else 'notice' end;
  if p_event_id is not null then
    update public.campus_events set title=btrim(p_title),impact=btrim(p_summary),end_at=p_end_at,
      information_revision=information_revision+1,information_scope=p_scope,updated_at=now()
      where id=p_event_id and source='community-reviewed' and location_id=p_location_id
        and information_kind=p_kind and status='active' returning id into result;
    if result is null then raise exception '关联事件不匹配，请新建通知'; end if;
  else
    insert into public.campus_events(author_id,location_id,type,title,impact,start_at,end_at,source,information_kind,information_scope,is_demo)
      values(auth.uid(),p_location_id,event_type,btrim(p_title),btrim(p_summary),now(),p_end_at,'community-reviewed',p_kind,p_scope,false)
      returning id into result;
  end if;
  update public.campus_reports set status='published',event_id=result,updated_at=now() where id=p_id;
  perform campus_private.issue_event_notices(result);
  return result;
end $$;
create or replace function public.campus_close_information_event(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not coalesce(public.campus_is_manager(),false) then raise exception '仅管理员可结束'; end if;
  update public.campus_events set status='closed',information_revision=information_revision+1,updated_at=now()
    where id=p_id and source='community-reviewed' and status='active';
  if found then
    update campus_private.information_jobs j set status='cancelled' from public.notifications n
      where j.kind='push' and j.target_id=n.id and n.related_type='event' and n.related_id=p_id::text
        and j.status not in ('done','cancelled');
    perform campus_private.issue_event_notices(p_id);
  end if;
end $$;

create or replace function public.campus_claim_information_jobs(p_limit integer default 2)
returns setof campus_private.information_jobs language plpgsql security definer set search_path='' as $$
begin
  update campus_private.information_jobs set status='failed',last_error='达到最大重试次数'
    where status='running' and lease_until<now() and attempts>=5;
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
end $$;
create or replace function public.campus_finish_information_job(p_id uuid,p_token uuid,p_error text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare j campus_private.information_jobs;
begin
  select * into j from campus_private.information_jobs where id=p_id and status='running' and claim_token=p_token and lease_until>now() for update;
  if not found then return false; end if;
  update campus_private.information_jobs set status=case when p_error is null then 'done' when attempts>=5 then 'failed' else 'retry' end,
    last_error=left(p_error,200),available_at=now()+make_interval(secs=>least(3600,30*power(2,attempts)::integer)),claim_token=null,lease_until=null where id=p_id;
  if j.kind='analysis' and p_error is not null then update public.campus_reports set analysis_status='failed',updated_at=now()
    where id=j.target_id and status='submitted'; end if;
  return true;
end $$;
create or replace function public.campus_complete_information_analysis(p_id uuid,p_token uuid,p_analysis jsonb,p_related_report_id uuid default null,p_related_event_id uuid default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare j campus_private.information_jobs; r public.campus_reports; other public.campus_reports;
begin
  select * into j from campus_private.information_jobs where id=p_id and kind='analysis' and status='running'
    and claim_token=p_token and lease_until>now() for update;
  if not found then return false; end if;
  select * into r from public.campus_reports where id=j.target_id for update;
  if not found or r.status in ('withdrawn','resolved','rejected') then
    update campus_private.information_jobs set status='cancelled',claim_token=null where id=p_id; return false; end if;
  if octet_length(p_analysis::text)>12000 then raise exception '分析结果过长'; end if;
  update public.campus_reports set analysis=p_analysis,analysis_status='complete',status=case when status='submitted' then 'analyzed' else status end,
    related_report_id=p_related_report_id,related_event_id=p_related_event_id,updated_at=now() where id=r.id;
  if r.kind in ('lost','found') then
    insert into public.notifications(recipient_id,type,title,body,related_type,related_id,dedupe_key)
      select s.user_id,'lost-found','关注地点有新的失物信息','有同学发布寻物或招领，请打开软件核对物品特征。','lost-found',r.id::text,'lost-subscription:'||r.id::text
      from public.campus_subscriptions s where s.user_id<>r.author_id and s.location_id in ('',coalesce(r.location_id,''))
        and s.kind in ('',r.kind)
      on conflict(recipient_id,dedupe_key) where dedupe_key is not null do nothing;
  end if;
  if r.kind in ('lost','found') and p_related_report_id is not null then
    select * into other from public.campus_reports where id=p_related_report_id and author_id<>r.author_id
      and kind=case when r.kind='lost' then 'found' else 'lost' end and status in ('submitted','analyzed')
      and location_id=r.location_id and created_at>now()-interval '7 days';
    if found then
      insert into public.notifications(recipient_id,type,title,body,related_type,related_id,dedupe_key)
        values(r.author_id,'lost-found','发现可能匹配的失物信息','地点与物品描述接近，请核对特征后联系，匹配并不代表已确认归属。','lost-found',other.id::text,'lost-match:'||least(r.id::text,other.id::text)||':'||greatest(r.id::text,other.id::text)),
              (other.author_id,'lost-found','发现可能匹配的失物信息','地点与物品描述接近，请核对特征后联系，匹配并不代表已确认归属。','lost-found',r.id::text,'lost-match:'||least(r.id::text,other.id::text)||':'||greatest(r.id::text,other.id::text))
        on conflict(recipient_id,dedupe_key) where dedupe_key is not null do nothing;
    end if;
  end if;
  return public.campus_finish_information_job(p_id,p_token,null);
end $$;
create or replace function public.campus_retry_information_report(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.campus_reports where id=p_id and (author_id=auth.uid() or public.campus_is_manager()) and status='submitted') then raise exception '不能重试此信息'; end if;
  update campus_private.information_jobs set status='ready',attempts=0,available_at=now(),last_error=null
    where kind='analysis' and target_id=p_id and status in ('failed','retry');
  update public.campus_reports set analysis_status='pending' where id=p_id;
end $$;

-- 普通用户只能调用其业务 RPC；队列工作接口仅授予 service_role。
do $$ declare n text; sig text; begin
  for sig in select p.oid::regprocedure::text from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
    where ns.nspname='public' and p.proname in ('campus_submit_report','campus_set_report_status','campus_register_push_device','campus_disable_push_device','campus_review_report','campus_close_information_event','campus_retry_information_report') loop
    execute 'revoke all on function '||sig||' from public,anon';
    execute 'grant execute on function '||sig||' to authenticated';
  end loop;
  for sig in select p.oid::regprocedure::text from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
    where (ns.nspname='public' and p.proname in ('campus_claim_information_jobs','campus_finish_information_job','campus_complete_information_analysis'))
       or (ns.nspname='campus_private' and p.proname in ('enqueue_report_analysis','enqueue_notification_push','issue_event_notices')) loop
    execute 'revoke all on function '||sig||' from public,anon,authenticated';
    execute 'grant execute on function '||sig||' to service_role';
  end loop;
  foreach n in array array['campus_reports','campus_subscriptions'] loop
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=n) then
      execute format('alter publication supabase_realtime add table public.%I',n);
    end if;
  end loop;
end $$;
commit;
notify pgrst, 'reload schema';
