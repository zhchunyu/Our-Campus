-- CampusTwin / 本校区本校区 / 2026-10-03
-- 仅用于空白 Supabase 项目。不要与原指南的 anchors/events 等旧结构混用。
-- 一个事务创建结构；重复执行会报 already exists，不会删除既有数据。
begin;

create schema campus_private;
revoke all on schema campus_private from public, anon, authenticated;

create table public.campus_regions (
  id text primary key check (id in ('teaching','living','dorm','sports','gate')),
  label text not null
);

create table public.campus_locations (
  id text primary key,
  name text not null,
  aliases text[] not null default '{}',
  keywords text[] not null default '{}',
  category text not null check (category in ('learning','dining','living','service','transport')),
  region_id text not null references public.campus_regions(id),
  description text not null default '',
  external_url text,
  map_position jsonb not null, -- 原前端 mapPosition['2d']，不当作经纬度
  map_apartment_number integer,
  latitude double precision,
  longitude double precision,
  coordinate_system text not null default 'gcj02' check (coordinate_system = 'gcj02'),
  geo_source text not null,
  geo_verified boolean not null default false,
  source text not null default 'campus-guide',
  open_status text not null default 'unknown' check (open_status in ('unknown','open','limited','closed')),
  crowd_status text not null default 'unknown' check (crowd_status in ('unknown','low','normal','busy')),
  activity text not null default '',
  updated_at timestamptz not null default now(),
  check ((latitude is null) = (longitude is null)),
  check (latitude between -90 and 90 and longitude between -180 and 180),
  check (jsonb_typeof(map_position) = 'array' and jsonb_array_length(map_position) = 2)
);
create index campus_locations_region_category_idx on public.campus_locations(region_id, category);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null default '新同学' check (char_length(btrim(nickname)) between 1 and 40),
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 权限与可编辑个人资料分表：不能靠修改昵称资料或 signup metadata 提升权限。
create table campus_private.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'student' check (role in ('student','manager'))
);
alter table campus_private.user_roles enable row level security;
revoke all on campus_private.user_roles from public, anon, authenticated;

create function public.campus_my_role() returns text
language sql stable security definer set search_path = ''
as $$
  select case when auth.uid() is null then 'visitor'
    else coalesce((select r.role from campus_private.user_roles r where r.user_id = auth.uid()), 'student') end;
$$;
revoke all on function public.campus_my_role() from public;
grant execute on function public.campus_my_role() to anon, authenticated;

create function public.campus_is_manager() returns boolean
language sql stable security definer set search_path = ''
as $$ select auth.uid() is not null and public.campus_my_role() = 'manager'; $$;
revoke all on function public.campus_is_manager() from public;
grant execute on function public.campus_is_manager() to authenticated;

create function campus_private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(user_id, nickname)
  values (new.id, coalesce(nullif(left(btrim(new.raw_user_meta_data->>'nickname'), 40), ''), '新同学'));
  insert into campus_private.user_roles(user_id, role) values (new.id, 'student');
  return new;
end; $$;
revoke all on function campus_private.handle_new_user() from public;
create trigger campustwin_auth_user_created after insert on auth.users
for each row execute function campus_private.handle_new_user();
-- 若空白业务库已先创建测试 Auth 用户，补齐其资料；不会修改既有用户。
insert into public.profiles(user_id) select id from auth.users on conflict do nothing;
insert into campus_private.user_roles(user_id) select id from auth.users on conflict do nothing;

create table public.campus_events (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references auth.users(id) on delete set null,
  location_id text not null references public.campus_locations(id),
  type text not null check (type in ('activity','crowd','notice','closure','construction')),
  title text not null check (char_length(btrim(title)) > 0),
  impact text not null default '',
  activity_category text,
  status text not null default 'active' check (status in ('active','scheduled','closed')),
  heat_level text not null default 'medium' check (heat_level in ('low','medium','high')),
  start_at timestamptz not null,
  end_at timestamptz not null,
  affected_edge_ids text[] not null default '{}', -- 当前道路 ID 仅作兼容；非真实路网导入
  visible_to text[] not null default '{visitor,student,manager}'
    check (visible_to <@ array['visitor','student','manager']::text[]),
  source text not null default 'manager',
  source_url text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at)
);
create index campus_events_location_timeline_idx on public.campus_events(location_id, status, end_at);

create table public.hall_messages (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  region_id text not null references public.campus_regions(id),
  content text not null check (char_length(btrim(content)) between 1 and 200),
  client_message_id uuid not null, -- 一次发送固定一个 UUID，重试复用，防止重复消息
  reply_to uuid references public.hall_messages(id) on delete set null,
  deleted_at timestamptz, -- 软删除；客户端收到 UPDATE 后移除消息
  created_at timestamptz not null default now(),
  unique(author_id, client_message_id)
);
create index hall_messages_region_time_idx on public.hall_messages(region_id, created_at desc, id);

create table public.lost_found_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_post_id uuid not null,
  type text not null check (type in ('lost','found')),
  title text not null check (char_length(btrim(title)) between 1 and 40),
  description text not null check (char_length(btrim(description)) between 1 and 300),
  location_id text not null references public.campus_locations(id),
  location_detail text not null default '' check (char_length(location_detail) <= 100),
  occurred_at timestamptz not null check (occurred_at <= now() + interval '1 minute'),
  contact text not null check (char_length(btrim(contact)) between 1 and 80),
  image_path text, -- lost-found-images 桶内路径；不存短期签名 URL 或 base64
  status text not null default 'active' check (status in ('active','resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(author_id, client_post_id),
  check (image_path is null or image_path like author_id::text || '/%')
);
create index lost_found_location_status_time_idx on public.lost_found_posts(location_id, status, created_at desc);

create table public.facility_contributions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_contribution_id uuid not null,
  type text not null check (type in ('food','medical','sports','toilet','water','print','parcel','bike')),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  location_id text not null references public.campus_locations(id),
  detail text not null check (char_length(btrim(detail)) between 1 and 120),
  status text not null default 'pending' check (status in ('pending','verified','rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  review_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(author_id, client_contribution_id)
);
create index facilities_type_status_idx on public.facility_contributions(type, status);

create table public.place_feedback (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_feedback_id uuid not null,
  location_id text not null references public.campus_locations(id),
  type text not null check (type in ('crowd','open-status','closure','construction','location-info','facility-repair')),
  description text not null check (char_length(btrim(description)) between 1 and 240),
  suggested_description text not null default '' check (char_length(suggested_description) <= 240),
  crowd_status text check (crowd_status in ('low','normal','busy')),
  open_status text check (open_status in ('open','limited','closed')),
  repair_category text check (repair_category in ('lighting','dispenser','elevator','other')),
  reported_end_at timestamptz,
  image_path text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','processing','completed')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_note text not null default '' check (char_length(review_note) <= 120),
  approved_event_id uuid references public.campus_events(id) on delete set null,
  unique(author_id, client_feedback_id),
  check (image_path is null or image_path like author_id::text || '/%'),
  check ((type = 'facility-repair' and status in ('pending','processing','completed'))
      or (type <> 'facility-repair' and status in ('pending','approved','rejected'))),
  check (type <> 'crowd' or crowd_status is not null),
  check (type <> 'open-status' or open_status is not null),
  check (type <> 'location-info' or char_length(btrim(suggested_description)) > 0),
  check (type <> 'facility-repair' or repair_category is not null),
  check (type not in ('closure','construction') or (reported_end_at is not null and reported_end_at > submitted_at))
);
create index feedback_author_status_idx on public.place_feedback(author_id, status, submitted_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('lost-found','facility-review','feedback-review','hall-reply','campus-event')),
  title text not null,
  body text not null default '',
  related_type text check (related_type in ('lost-found','facility','feedback','message','event')),
  related_id text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_recipient_unread_time_idx on public.notifications(recipient_id, read_at, created_at desc);

create table public.campus_services (
  id text primary key,
  title text not null,
  location_id text references public.campus_locations(id),
  summary text not null,
  hours text, phone text, phone_note text, website text, source_url text,
  keywords text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create function campus_private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;
revoke all on function campus_private.touch_updated_at() from public;
do $$ declare table_name text; begin
  foreach table_name in array array['campus_locations','profiles','campus_events','lost_found_posts','facility_contributions','campus_services'] loop
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function campus_private.touch_updated_at()', table_name);
  end loop;
end $$;

-- 使用真实登录者记录审核人，普通客户端不获得审核人／审核时间列的写权限。
create function campus_private.stamp_review() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null then
    new.reviewed_by = case when new.status = 'pending' then null else auth.uid() end;
    if tg_table_name = 'place_feedback' then
      new.reviewed_at = case when new.status = 'pending' then null else now() end;
    end if;
  end if;
  return new;
end; $$;
revoke all on function campus_private.stamp_review() from public;
create trigger stamp_facility_review before update on public.facility_contributions
for each row execute function campus_private.stamp_review();
create trigger stamp_place_feedback_review before update on public.place_feedback
for each row execute function campus_private.stamp_review();

-- 显式清除新表的默认前端授权，然后只开放所需操作／可编辑列。
do $$ declare table_name text; begin
  foreach table_name in array array['campus_regions','campus_locations','profiles','campus_events','hall_messages','lost_found_posts','facility_contributions','place_feedback','notifications','campus_services'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
  end loop;
end $$;
grant select on public.campus_regions, public.campus_locations, public.campus_events,
  public.campus_services, public.facility_contributions to anon, authenticated;
grant select on public.profiles, public.hall_messages, public.lost_found_posts,
  public.place_feedback, public.notifications to authenticated;
grant update(nickname, avatar_path) on public.profiles to authenticated;
grant insert(region_id, content, client_message_id, reply_to) on public.hall_messages to authenticated;
grant update(deleted_at) on public.hall_messages to authenticated;
grant insert(client_post_id, type, title, description, location_id, location_detail, occurred_at, contact, image_path)
  on public.lost_found_posts to authenticated;
grant update(type, title, description, location_id, location_detail, occurred_at, contact, image_path, status)
  on public.lost_found_posts to authenticated;
grant delete on public.lost_found_posts to authenticated;
grant insert(client_contribution_id, type, name, location_id, detail) on public.facility_contributions to authenticated;
grant update(status, review_note) on public.facility_contributions to authenticated;
grant insert(client_feedback_id, location_id, type, description, suggested_description, crowd_status,
  open_status, repair_category, reported_end_at, image_path) on public.place_feedback to authenticated;
grant update(status, review_note, approved_event_id) on public.place_feedback to authenticated;
grant update(read_at) on public.notifications to authenticated;
-- 热点／地点／服务信息由后台鉴权后维护；前端不具有直接修改权限。

create policy campus_regions_read on public.campus_regions for select to anon, authenticated using (true);
create policy campus_locations_read on public.campus_locations for select to anon, authenticated using (true);
create policy campus_services_read on public.campus_services for select to anon, authenticated using (true);
create policy profiles_read on public.profiles for select to authenticated using (true);
create policy profiles_edit_own on public.profiles for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy campus_events_read on public.campus_events for select to anon, authenticated
  using ((select public.campus_my_role()) = any(visible_to));
create policy hall_messages_read on public.hall_messages for select to authenticated using (true);
create policy hall_messages_send on public.hall_messages for insert to authenticated
  with check ((select auth.uid()) = author_id and deleted_at is null);
create policy hall_messages_remove_own on public.hall_messages for update to authenticated
  using ((select auth.uid()) = author_id) with check ((select auth.uid()) = author_id);
create policy lost_found_read on public.lost_found_posts for select to authenticated using (true);
create policy lost_found_publish on public.lost_found_posts for insert to authenticated
  with check ((select auth.uid()) = author_id and status = 'active');
create policy lost_found_edit_own on public.lost_found_posts for update to authenticated
  using ((select auth.uid()) = author_id) with check ((select auth.uid()) = author_id);
create policy lost_found_delete_own on public.lost_found_posts for delete to authenticated
  using ((select auth.uid()) = author_id);
create policy facilities_public_read on public.facility_contributions for select to anon, authenticated using (status = 'verified');
create policy facilities_own_or_manager_read on public.facility_contributions for select to authenticated
  using ((select auth.uid()) = author_id or (select public.campus_is_manager()));
create policy facilities_submit on public.facility_contributions for insert to authenticated
  with check ((select auth.uid()) = author_id and status = 'pending');
create policy facilities_manager_review on public.facility_contributions for update to authenticated
  using ((select public.campus_is_manager())) with check ((select public.campus_is_manager()));
create policy feedback_own_or_manager_read on public.place_feedback for select to authenticated
  using ((select auth.uid()) = author_id or (select public.campus_is_manager()));
create policy feedback_submit on public.place_feedback for insert to authenticated
  with check ((select auth.uid()) = author_id and status = 'pending' and reviewed_by is null and reviewed_at is null);
create policy feedback_manager_review on public.place_feedback for update to authenticated
  using ((select public.campus_is_manager())) with check ((select public.campus_is_manager()));
create policy notifications_read_own on public.notifications for select to authenticated using ((select auth.uid()) = recipient_id);
create policy notifications_mark_own on public.notifications for update to authenticated
  using ((select auth.uid()) = recipient_id) with check ((select auth.uid()) = recipient_id);

-- bucket 创建由本文件完成，不需要提前手工创建；已有同名桶时请先人工核对。
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types) values
  ('lost-found-images', 'lost-found-images', false, 5242880, array['image/jpeg','image/png','image/webp']),
  ('report-images', 'report-images', false, 5242880, array['image/jpeg','image/png','image/webp']),
  ('avatars', 'avatars', true, 5242880, array['image/jpeg','image/png','image/webp']);
create policy campustwin_image_upload_own on storage.objects for insert to authenticated
  with check (bucket_id in ('lost-found-images','report-images','avatars')
    and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy campustwin_image_delete_own on storage.objects for delete to authenticated
  using (bucket_id in ('lost-found-images','report-images','avatars')
    and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy campustwin_image_read_own on storage.objects for select to authenticated
  using (bucket_id in ('lost-found-images','report-images','avatars')
    and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy campustwin_lost_image_read_published on storage.objects for select to authenticated
  using (bucket_id = 'lost-found-images' and exists (
    select 1 from public.lost_found_posts p where p.image_path = storage.objects.name
  ));
create policy campustwin_report_image_manager_read on storage.objects for select to authenticated
  using (bucket_id = 'report-images' and (select public.campus_is_manager()));
-- 不开放 Storage UPDATE；每次用新文件名上传，避免无权限覆盖他人文件。

-- 加入 publication 才会推送；REPLICA IDENTITY 本身不会开启 Realtime。
do $$ declare table_name text; begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise exception '缺少 supabase_realtime publication；请确认运行在 Supabase 项目中';
  end if;
  foreach table_name in array array['campus_locations','campus_events','hall_messages','lost_found_posts','facility_contributions','place_feedback','notifications'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;
commit;
