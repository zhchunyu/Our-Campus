-- 在已有 09/10 号校园信息队列部署之后执行。仅增量升级，不清空既有消息/发布。
begin;

alter table public.campus_reports drop constraint if exists campus_reports_kind_check;
alter table public.campus_reports add constraint campus_reports_kind_check
  check(kind in ('activity','construction','closure','water-power','crowd','notice','lost','found','repair','feedback'));
alter table public.campus_subscriptions drop constraint if exists campus_subscriptions_kind_check;
alter table public.campus_subscriptions add constraint campus_subscriptions_kind_check
  check(kind in ('','activity','construction','closure','water-power','crowd','notice','lost','found','repair','feedback'));
alter table public.notifications add column if not exists priority smallint not null default 0 check(priority between 0 and 3);
alter table public.notifications add column if not exists reason text not null default '';
alter table public.notifications add column if not exists context jsonb not null default '{}';

create table if not exists public.campus_notification_preferences (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  favorite_location_ids text[] not null default '{}' check(cardinality(favorite_location_ids)<=100),
  interest_keywords text[] not null default '{}' check(cardinality(interest_keywords)<=12),
  favorite_priority boolean not null default true,
  match_alerts boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.campus_notification_preferences enable row level security;
revoke all on public.campus_notification_preferences from public,anon,authenticated;
grant select on public.campus_notification_preferences to authenticated;
grant all on public.campus_notification_preferences to service_role;
drop policy if exists preferences_read_own on public.campus_notification_preferences;
create policy preferences_read_own on public.campus_notification_preferences for select to authenticated
  using(user_id=(select auth.uid()));

create or replace function public.campus_save_notification_preferences(p_preferences jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.campus_notification_preferences; favorites text[]; interests text[]; additions text[]; removals text[]; field text; validated text[];
begin
  if auth.uid() is null then raise exception '请先登录'; end if;
  if jsonb_typeof(p_preferences) is distinct from 'object' or octet_length(p_preferences::text)>8000
    or exists(select 1 from jsonb_object_keys(p_preferences) k where k not in ('favorite_location_ids','add_favorite_location_ids','remove_favorite_location_ids','interest_keywords','favorite_priority','match_alerts')) then
    raise exception '通知偏好格式不正确'; end if;
  if (p_preferences ? 'favorite_priority' and jsonb_typeof(p_preferences->'favorite_priority')<>'boolean')
    or (p_preferences ? 'match_alerts' and jsonb_typeof(p_preferences->'match_alerts')<>'boolean') then raise exception '提醒开关格式不正确'; end if;
  foreach field in array array['favorite_location_ids','add_favorite_location_ids','remove_favorite_location_ids'] loop
    if p_preferences ? field then
      if jsonb_typeof(p_preferences->field)<>'array' then raise exception '收藏地点格式不正确'; end if;
      validated:=array(select distinct jsonb_array_elements_text(p_preferences->field));
      if cardinality(validated)>100 or exists(select 1 from unnest(validated) f where not exists(select 1 from public.campus_locations l where l.id=f)) then raise exception '请选择已收录的收藏地点'; end if;
      if field='favorite_location_ids' then favorites:=validated; elsif field='add_favorite_location_ids' then additions:=validated; else removals:=validated; end if;
    end if;
  end loop;
  if p_preferences ? 'interest_keywords' then
    if jsonb_typeof(p_preferences->'interest_keywords')<>'array' or exists(select 1 from jsonb_array_elements(p_preferences->'interest_keywords') k where jsonb_typeof(k)<>'string') then raise exception '兴趣格式不正确'; end if;
    interests:=array(select distinct btrim(jsonb_array_elements_text(p_preferences->'interest_keywords')));
    if cardinality(interests)>12 or exists(select 1 from unnest(interests) k where char_length(k) not between 2 and 20) then
      raise exception '最多填写 12 个兴趣词，每个 2–20 字'; end if;
  end if;
  favorites:=array(select distinct f from unnest(coalesce(favorites,'{}')||coalesce(additions,'{}')) f where not(f=any(coalesce(removals,'{}'))));
  insert into public.campus_notification_preferences(user_id,favorite_location_ids,interest_keywords,favorite_priority,match_alerts)
    values(auth.uid(),coalesce(favorites,'{}'),coalesce(interests,'{}'),coalesce((p_preferences->>'favorite_priority')::boolean,true),coalesce((p_preferences->>'match_alerts')::boolean,true))
  on conflict(user_id) do update set
    favorite_location_ids=array(select distinct f from unnest((case when p_preferences ? 'favorite_location_ids' then excluded.favorite_location_ids else campus_notification_preferences.favorite_location_ids end)||coalesce(additions,'{}')) f where not(f=any(coalesce(removals,'{}')))),
    interest_keywords=case when p_preferences ? 'interest_keywords' then excluded.interest_keywords else campus_notification_preferences.interest_keywords end,
    favorite_priority=case when p_preferences ? 'favorite_priority' then excluded.favorite_priority else campus_notification_preferences.favorite_priority end,
    match_alerts=case when p_preferences ? 'match_alerts' then excluded.match_alerts else campus_notification_preferences.match_alerts end,
    updated_at=now() returning * into result;
  return to_jsonb(result);
end $$;
revoke all on function public.campus_save_notification_preferences(jsonb) from public,anon;
grant execute on function public.campus_save_notification_preferences(jsonb) to authenticated;

-- 明确依据优先于“所有发布”：不自动创建全校/全类别订阅。
create or replace function campus_private.information_relevance(p_user uuid,p_location text,p_kind text,p_text text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prefs public.campus_notification_preferences; interest text; place_name text;
begin
  select * into prefs from public.campus_notification_preferences where user_id=p_user;
  if p_kind not in ('lost','found') and coalesce(prefs.favorite_priority,true) and p_location=any(prefs.favorite_location_ids) then
    select name into place_name from public.campus_locations where id=p_location;
    return jsonb_build_object('priority',2,'reason','你收藏的'||coalesce(place_name,'地点')||'有新动态');
  end if;
  if p_kind not in ('lost','found') then
    select k into interest from unnest(prefs.interest_keywords) k where position(lower(k) in lower(p_text))>0 order by char_length(k) desc,k limit 1;
    if interest is not null then return jsonb_build_object('priority',2,'reason','与你的兴趣“'||interest||'”相关'); end if;
  end if;
  if exists(select 1 from public.campus_subscriptions s where s.user_id=p_user and s.location_id in ('',coalesce(p_location,'')) and s.kind in ('',p_kind)) then
    return jsonb_build_object('priority',1,'reason','你主动订阅了相关地点或类别');
  end if;
  return null;
end $$;
revoke all on function campus_private.information_relevance(uuid,text,text,text) from public,anon,authenticated;

create or replace function campus_private.issue_event_notices(p_event_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare e public.campus_events;
begin
  select * into e from public.campus_events where id=p_event_id;
  if not found or e.is_demo or e.source<>'community-reviewed' or (e.status<>'closed' and e.end_at<=now()) then return; end if;
  insert into public.notifications(recipient_id,type,title,body,related_type,related_id,dedupe_key,priority,reason,context)
  select u.id,'campus-event',case when e.status='closed' then '校园通知已结束：' when e.information_kind='activity' then '与你相关的校园活动：' else '校园通知：' end||e.title,
    left(e.impact,250),'event',e.id::text,'information-event:'||e.id::text||':'||e.information_revision,
    case when e.information_scope='all' then 3 else (relevance->>'priority')::smallint end,
    case when e.information_scope='all' then '重要校园通知' else relevance->>'reason' end,jsonb_build_object('delivery','in-app')
  from auth.users u cross join lateral (select campus_private.information_relevance(u.id,e.location_id,e.information_kind,e.title||' '||e.impact) relevance) x
  where e.information_scope='all' or relevance is not null
  on conflict(recipient_id,dedupe_key) where dedupe_key is not null do nothing;
end $$;

-- 本轮只启用站内通知，不向厂商推送服务登记新任务；原有其他通知保持其原交付方式。
create or replace function campus_private.enqueue_notification_push() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.context->>'delivery' is distinct from 'in-app' then
    insert into campus_private.information_jobs(kind,target_id) values('push',new.id) on conflict do nothing;
  end if;
  return new;
end $$;

create or replace function public.campus_review_report(p_id uuid,p_publish boolean,p_title text default '',p_summary text default '',
  p_location_id text default null,p_kind text default 'notice',p_end_at timestamptz default null,p_scope text default 'subscribers',p_event_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.campus_reports; result uuid; event_type text; event_start timestamptz;
begin
  if not coalesce(public.campus_is_manager(),false) then raise exception '仅管理员可审核'; end if;
  select * into r from public.campus_reports where id=p_id for update;
  if not found or r.status in ('withdrawn','resolved','rejected') then raise exception '信息已失效'; end if;
  if r.event_id is not null then return r.event_id; end if;
  if not p_publish then update public.campus_reports set status='rejected',updated_at=now() where id=p_id; return null; end if;
  if p_scope not in ('all','subscribers') or p_kind not in ('activity','construction','closure','water-power','crowd','notice','repair','feedback')
    or char_length(btrim(p_title)) not between 1 and 80 or char_length(btrim(p_summary)) not between 1 and 1500
    or p_location_id is null or p_end_at is null or p_end_at<=now() then raise exception '请确认标题、说明、地点和有效结束时间'; end if;
  event_start:=case when p_kind='activity' then coalesce((r.details->>'starts_at')::timestamptz,now()) else now() end;
  if event_start>=p_end_at then raise exception '活动结束时间必须晚于开始时间'; end if;
  if p_kind in ('construction','closure','water-power') then p_scope:='all'; end if;
  event_type:=case when p_kind in ('activity','construction','closure','crowd') then p_kind else 'notice' end;
  if p_event_id is not null then
    update public.campus_events set title=btrim(p_title),impact=btrim(p_summary),start_at=event_start,end_at=p_end_at,
      information_revision=information_revision+1,information_scope=p_scope,updated_at=now()
      where id=p_event_id and source='community-reviewed' and location_id=p_location_id and information_kind=p_kind and status='active' returning id into result;
    if result is null then raise exception '关联事件不匹配，请新建通知'; end if;
  else
    insert into public.campus_events(author_id,location_id,type,title,impact,start_at,end_at,source,information_kind,information_scope,is_demo)
      values(auth.uid(),p_location_id,event_type,btrim(p_title),btrim(p_summary),event_start,p_end_at,'community-reviewed',p_kind,p_scope,false) returning id into result;
  end if;
  update public.campus_reports set status='published',event_id=result,updated_at=now() where id=p_id;
  perform campus_private.issue_event_notices(result);
  return result;
end $$;

create or replace function public.campus_complete_information_analysis(p_id uuid,p_token uuid,p_analysis jsonb,p_related_report_id uuid default null,p_related_event_id uuid default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare j campus_private.information_jobs; r public.campus_reports; other public.campus_reports; m jsonb; why text; evidence jsonb;
begin
  select * into j from campus_private.information_jobs where id=p_id and kind='analysis' and status='running'
    and claim_token=p_token and lease_until>now() for update;
  if not found then return false; end if;
  if octet_length(p_analysis::text)>12000 or jsonb_typeof(p_analysis) is distinct from 'object' then raise exception '分析结果格式不正确'; end if;
  if p_analysis ? 'matches' and jsonb_typeof(p_analysis->'matches')<>'array' then raise exception '匹配结果格式不正确'; end if;
  -- 以固定顺序锁定双方发布，防止撤回/完成后继续匹配，也避免两条分析互相死锁。
  perform 1 from public.campus_reports where id=j.target_id or id::text in (
    select value->>'report_id' from jsonb_array_elements(coalesce(p_analysis->'matches','[]')) limit 5
  ) order by id for update;
  select * into r from public.campus_reports where id=j.target_id;
  if not found or r.status in ('withdrawn','resolved','rejected') then
    update campus_private.information_jobs set status='cancelled',claim_token=null where id=p_id; return false; end if;
  update public.campus_reports set analysis=p_analysis,analysis_status='complete',status=case when status='submitted' then 'analyzed' else status end,
    related_report_id=p_related_report_id,related_event_id=p_related_event_id,updated_at=now() where id=r.id;
  if r.kind in ('lost','found') then
    -- 普通失物不全员通知；仅保留用户明确创建的订阅。
    insert into public.notifications(recipient_id,type,title,body,related_type,related_id,dedupe_key,priority,reason,context)
      select u.id,'lost-found','你订阅的地点有新的失物信息',left(r.title,80)||'，请打开社区核对物品特征。','lost-found',r.id::text,'lost-subscription:'||r.id::text,1,relevance->>'reason',jsonb_build_object('delivery','in-app')
      from auth.users u cross join lateral (select campus_private.information_relevance(u.id,r.location_id,r.kind,r.title||' '||r.body) relevance) x
      where u.id<>r.author_id and relevance is not null
      on conflict(recipient_id,dedupe_key) where dedupe_key is not null do nothing;
    for m in select value from jsonb_array_elements(coalesce(p_analysis->'matches','[]')) limit 5 loop
      if jsonb_typeof(m->'score') is distinct from 'number' or jsonb_typeof(m->'reasons') is distinct from 'array' then continue; end if;
      if (m->>'score')::numeric<5 or jsonb_array_length(m->'reasons')=0 then continue; end if;
      select * into other from public.campus_reports where id::text=m->>'report_id' and author_id<>r.author_id
        and kind=case when r.kind='lost' then 'found' else 'lost' end and status in ('submitted','analyzed') and created_at>now()-interval '30 days';
      if not found then continue; end if;
      -- 模型/Worker 只提供候选，最终有效状态与接收人由数据库重新检查。
      if r.details ? 'occurred_at' and other.details ? 'occurred_at' then
        begin
          if r.kind='lost' and (other.details->>'occurred_at')::timestamptz<(r.details->>'occurred_at')::timestamptz-interval '30 minutes'
            or r.kind='found' and (r.details->>'occurred_at')::timestamptz<(other.details->>'occurred_at')::timestamptz-interval '30 minutes' then continue; end if;
        exception when invalid_datetime_format or datetime_field_overflow then continue; end;
      end if;
      why:=left(array_to_string(array(select jsonb_array_elements_text(m->'reasons') limit 6),'；'),350);
      evidence:=jsonb_build_object('reasons',m->'reasons','warnings',m->'warnings','confidence',m->>'confidence','generated_by',m->>'generated_by');
      insert into public.notifications(recipient_id,type,title,body,related_type,related_id,dedupe_key,priority,reason,context)
        select u.id,'lost-found','发现可能匹配的失物线索',why||'。请核对独有特征，尚未确认归属。','lost-found',
          case when u.id=r.author_id then other.id::text else r.id::text end,
          'lost-match:'||least(r.id::text,other.id::text)||':'||greatest(r.id::text,other.id::text),3,'与你发布的物品信息特征接近',
          jsonb_build_object('delivery','in-app','match',evidence,'my_report_id',case when u.id=r.author_id then r.id else other.id end)
        from auth.users u left join public.campus_notification_preferences p on p.user_id=u.id
        where u.id in (r.author_id,other.author_id) and coalesce(p.match_alerts,true)
        on conflict(recipient_id,dedupe_key) where dedupe_key is not null do nothing;
    end loop;
  end if;
  return public.campus_finish_information_job(p_id,p_token,null);
end $$;
-- CREATE OR REPLACE 保留 09 号迁移的执行权限：分析完成仍仅 service_role 可调用。
revoke all on function public.campus_complete_information_analysis(uuid,uuid,jsonb,uuid,uuid) from public,anon,authenticated;
grant execute on function public.campus_complete_information_analysis(uuid,uuid,jsonb,uuid,uuid) to service_role;
revoke all on function campus_private.issue_event_notices(uuid) from public,anon,authenticated;
revoke all on function public.campus_review_report(uuid,boolean,text,text,text,text,timestamptz,text,uuid) from public,anon;
grant execute on function public.campus_review_report(uuid,boolean,text,text,text,text,timestamptz,text,uuid) to authenticated;
commit;
notify pgrst, 'reload schema';
