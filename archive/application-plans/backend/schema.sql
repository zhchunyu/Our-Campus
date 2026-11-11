-- ============================================================
-- Our Campus - 数据库表结构 v1.0
-- 基于「实时输入接入设计 v1.0」落地
-- 适用：Supabase (PostgreSQL 15+ + PostGIS)
-- ============================================================

-- 启用 PostGIS（地理位置）
create extension if not exists postgis;
create extension if not exists "uuid-ossp";

-- ============================================================
-- 1. 锚点表（地点枚举）
-- ============================================================
-- 对应设计文档 §3.1 的 ANCHOR 枚举
-- 所有上报的地点最终都吸附到锚点，这是时空去重的基础
-- ============================================================
create table anchors (
  id          text primary key,            -- 如 ANCHOR_MainGate, ANCHOR_Canteen
  name        text not null,               -- 显示名："主校门"
  aliases     text[] default '{}',         -- 别名数组：{校门, 大门口, 正门}
  building_id text,                        -- 关联建筑ID
  geom        geometry(Point, 4326),       -- 经纬度坐标（如有真实地理数据）
  world_x     float not null,              -- 3D世界坐标 X（你们的虚构校园用这个）
  world_z     float not null,              -- 3D世界坐标 Z
  floor       int default 0,               -- 楼层
  type        text not null,               -- 类型：building / road / landmark
  created_at  timestamptz default now()
);

create index idx_anchors_geom on anchors using gist (geom);
create index idx_anchors_world on anchors (world_x, world_z);

-- ============================================================
-- 2. 事件表（核心表）
-- ============================================================
-- 对应设计文档 §5 处理管线的产出物
-- 每一条"去重聚合后"的事件 = 一行
-- ============================================================
create table events (
  id              uuid primary key default uuid_generate_v4(),
  type            text not null,           -- 事件类型：traffic / safety / activity / info / queue
  title           text,                    -- 自动生成的标题
  description     text,                    -- 聚合后的描述
  anchor_id       text references anchors(id), -- 主锚点
  world_x         float,                   -- 3D坐标（可能在锚点附近偏移）
  world_z         float,
  geom            geometry(Point, 4326),   -- 地理坐标
  severity        text default 'normal',   -- 严重度：info / low / normal / high / critical
  credibility     float default 0.5,       -- 可信度评分 0-1
  credibility_detail jsonb default '{}',   -- 可信度分解：{ugc_count: 5, official_match: true, ...}
  status          text default 'processing', -- processing / pending_review / published / resolved / closed
  report_count    int default 1,           -- 上报人数（去重后）
  evidence_quote  text,                    -- 原文引用片段（可信度证据链）
  affected_edges  text[] default '{}',     -- 受影响路段ID（封路用）
  tags            text[] default '{}',     -- 标签
  metadata        jsonb default '{}',      -- 扩展字段
  first_reported_at timestamptz default now(), -- 首次上报时间
  last_updated_at   timestamptz default now(), -- 最后更新时间
  resolved_at       timestamptz             -- 解决时间
);

create index idx_events_status on events (status);
create index idx_events_type on events (type);
create index idx_events_anchor on events (anchor_id);
create index idx_events_created on events (first_reported_at desc);
create index idx_events_geom on events using gist (geom);
create index idx_events_world on events (world_x, world_z);

-- ============================================================
-- 3. 上报明细表
-- ============================================================
-- 每一条用户上报 = 一行
-- 多个上报可能被聚合到同一个 event（时空去重）
-- ============================================================
create table reports (
  id              uuid primary key default uuid_generate_v4(),
  event_id        uuid references events(id) on delete set null, -- 聚合到哪个事件
  user_id         uuid references auth.users,  -- 上报用户（Supabase Auth）
  client_report_id text,                        -- 客户端幂等ID
  content         text not null,                -- 原始上报内容
  anchor_id       text references anchors(id),  -- 上报时的锚点
  world_x         float,
  world_z         float,
  geom            geometry(Point, 4326),
  position_source text default 'manual',        -- auto / manual / beacon
  position_confidence float default 0.7,        -- 位置可信度
  images          text[] default '{}',          -- 图片URL（存在Supabase Storage）
  parsed_result   jsonb,                        -- AI约束解码结果
  dedup_cluster_id uuid,                        -- 去重簇ID
  status          text default 'received',      -- received / parsing / parsed / merged / rejected
  ip_address      inet,                         -- 上报IP（用于去重）
  created_at      timestamptz default now()
);

create index idx_reports_event on reports (event_id);
create index idx_reports_user on reports (user_id);
create index idx_reports_anchor on reports (anchor_id);
create index idx_reports_created on reports (created_at desc);
create index idx_reports_status on reports (status);

-- ============================================================
-- 4. 反馈表
-- ============================================================
-- 用户对事件的反馈："我也看到了" / "已通过" / "不实"
-- 用于可信度动态调整
-- ============================================================
create table feedbacks (
  id          uuid primary key default uuid_generate_v4(),
  event_id    uuid not null references events(id) on delete cascade,
  user_id     uuid references auth.users,
  feedback_type text not null,    -- confirm / deny / resolved
  comment     text,
  created_at  timestamptz default now(),
  unique (event_id, user_id, feedback_type) -- 同一用户同一类型只能反馈一次
);

create index idx_feedbacks_event on feedbacks (event_id);
create index idx_feedbacks_user on feedbacks (user_id);

-- ============================================================
-- 5. 路段表（路网）
-- ============================================================
-- 对应设计文档 §6 的路网
-- 用于封路联动、通行热度统计
-- ============================================================
create table road_edges (
  id          text primary key,     -- 如 outer_s2_s3
  from_node   text not null,        -- 起点节点ID
  to_node     text not null,        -- 终点节点ID
  length      float not null,       -- 长度（米）
  walk_time   float,                -- 步行时间（秒）
  is_closed   boolean default false, -- 是否封闭
  closed_by   uuid references events(id), -- 被哪个事件封闭
  geom        geometry(LineString, 4326), -- 地理路径
  world_path  jsonb,                -- 3D世界坐标路径点数组
  tags        text[] default '{}'   -- 标签：main_road / path / stairs ...
);

create index idx_road_edges_from on road_edges (from_node);
create index idx_road_edges_to on road_edges (to_node);
create index idx_road_edges_closed on road_edges (is_closed) where is_closed = true;

-- 节点表
create table road_nodes (
  id          text primary key,
  world_x     float not null,
  world_z     float not null,
  geom        geometry(Point, 4326),
  type        text default 'normal' -- normal / intersection / entrance
);

-- ============================================================
-- 6. 通行热度统计表
-- ============================================================
-- 对应设计文档 §7
-- 按路段 × 时间桶统计通行量
-- ============================================================
create table traffic_heat (
  id            bigserial primary key,
  edge_id       text not null references road_edges(id),
  time_bucket   timestamptz not null,    -- 15分钟桶的起始时间
  pedestrian_count int default 0,        -- 行人计数
  bicycle_count    int default 0,        -- 自行车计数
  created_at      timestamptz default now()
);

create unique index idx_traffic_heat_bucket on traffic_heat (edge_id, time_bucket);
create index idx_traffic_heat_time on traffic_heat (time_bucket desc);

-- ============================================================
-- 7. 探查任务表
-- ============================================================
-- 对应设计文档 §7.5
-- 通行热度异常 → 生成核查任务
-- ============================================================
create table inspection_tasks (
  id          uuid primary key default uuid_generate_v4(),
  task_type   text not null,         -- traffic_anomaly / safety_check
  edge_id     text references road_edges(id),
  anchor_id   text references anchors(id),
  description text,
  reason      text,                  -- 触发原因
  status      text default 'pending', -- pending / assigned / in_progress / resolved / false_alarm
  assigned_to uuid references auth.users,
  evidence    jsonb default '{}',    -- 证据数据
  created_at  timestamptz default now(),
  resolved_at timestamptz
);

create index idx_inspection_status on inspection_tasks (status);
create index idx_inspection_created on inspection_tasks (created_at desc);

-- ============================================================
-- 8. 官方通知表
-- ============================================================
-- 从官网/公众号抓取的官方通知
-- 用于可信度核查的官方源RAG
-- ============================================================
create table official_notices (
  id          uuid primary key default uuid_generate_v4(),
  source      text not null,         -- 来源：website / wechat / backend
  title       text not null,
  content     text,
  url         text,
  category    text,                  -- 分类：traffic / safety / activity
  related_anchor text references anchors(id), -- 关联地点
  publish_time timestamptz,
  ai_summary  text,                  -- AI提取的摘要
  ai_keywords text[] default '{}',   -- AI提取的关键词
  created_at  timestamptz default now()
);

create index idx_official_publish on official_notices (publish_time desc);
create index idx_official_anchor on official_notices (related_anchor);

-- ============================================================
-- 9. AI处理日志表
-- ============================================================
-- 记录每次AI处理的输入输出，用于调试和评估
-- ============================================================
create table ai_processing_logs (
  id            bigserial primary key,
  report_id     uuid references reports(id),
  event_id      uuid references events(id),
  pipeline_step text not null,       -- parse / anchor_match / dedup / credibility
  input_data    jsonb,
  output_data   jsonb,
  model_name    text,                -- 用的哪个模型
  duration_ms   int,                 -- 处理耗时
  status        text default 'success', -- success / failed / skipped
  error_msg     text,
  created_at    timestamptz default now()
);

create index idx_ai_logs_report on ai_processing_logs (report_id);
create index idx_ai_logs_event on ai_processing_logs (event_id);
create index idx_ai_logs_step on ai_processing_logs (pipeline_step);
create index idx_ai_logs_created on ai_processing_logs (created_at desc);

-- ============================================================
-- 10. 用户表扩展（Profile）
-- ============================================================
-- Supabase Auth 自带 users 表，这里存扩展信息
-- ============================================================
create table profiles (
  user_id     uuid primary key references auth.users on delete cascade,
  nickname    text,
  avatar_url  text,
  credit_score int default 100,      -- 用户信誉分（影响上报权重）
  report_count int default 0,        -- 历史上报数
  verified_report_count int default 0, -- 被证实的上报数
  created_at  timestamptz default now()
);

-- 新用户注册时自动创建profile
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (user_id, nickname)
  values (new.id, new.raw_user_meta_data->>'nickname');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 11. 行级安全策略 (RLS)
-- ============================================================
-- 让前端可以直连数据库读数据，但只能改自己的
-- ============================================================

-- 开启RLS
alter table events enable row level security;
alter table reports enable row level security;
alter table feedbacks enable row level security;
alter table anchors enable row level security;
alter table road_edges enable row level security;
alter table road_nodes enable row level security;
alter table traffic_heat enable row level security;
alter table official_notices enable row level security;
alter table profiles enable row level security;

-- 事件：所有人可读，只能通过服务角色写入
create policy "Events are viewable by everyone" on events
  for select using (true);

-- 上报：所有人可读，登录用户只能创建自己的
create policy "Reports are viewable by everyone" on reports
  for select using (true);

create policy "Users can create reports" on reports
  for insert with check (auth.uid() = user_id);

-- 反馈：所有人可读，登录用户只能创建自己的
create policy "Feedbacks are viewable by everyone" on feedbacks
  for select using (true);

create policy "Users can create feedback" on feedbacks
  for insert with check (auth.uid() = user_id);

-- 锚点、路网、通知：公开只读
create policy "Anchors are viewable by everyone" on anchors
  for select using (true);

create policy "Road edges are viewable by everyone" on road_edges
  for select using (true);

create policy "Road nodes are viewable by everyone" on road_nodes
  for select using (true);

create policy "Official notices are viewable by everyone" on official_notices
  for select using (true);

create policy "Traffic heat is viewable by everyone" on traffic_heat
  for select using (true);

-- 用户资料：公开可读，自己可改
create policy "Profiles are viewable by everyone" on profiles
  for select using (true);

create policy "Users can update own profile" on profiles
  for update using (auth.uid() = user_id);

-- ============================================================
-- 12. 开启 Realtime（实时推送）
-- ============================================================
-- 前端通过 Supabase Realtime 订阅这些表的变化
-- ============================================================

alter table events replica identity full;
alter table reports replica identity full;
alter table feedbacks replica identity full;
alter table road_edges replica identity full;

-- ============================================================
-- 13. 辅助函数
-- ============================================================

-- 更新时间戳触发器
create function update_updated_at_column()
returns trigger as $$
begin
  new.last_updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_events_updated_at
  before update on events
  for each row execute function update_updated_at_column();

-- ============================================================
-- 14. 初始数据：锚点表（示例，需根据你们的真实3D坐标填入）
-- ============================================================
-- 下面是示例数据，实际使用时请根据 BUILDINGS 和 ROAD_NODES 生成
-- 对应设计文档 §10 修复项：锚点必须和真实建筑坐标对齐

-- insert into anchors (id, name, aliases, world_x, world_z, type) values
--   ('ANCHOR_MainGate', '主校门', '{校门,大门口,正门}', 0, 0, 'building'),
--   ('ANCHOR_Canteen', '第三食堂', '{三食堂,食堂,第三食堂,3食堂}', 167.6, 43.0, 'building'),
--   ('ANCHOR_Library', '图书馆', '{图书馆,讲堂}', 100, 200, 'building'),
--   ('ANCHOR_DormE', '宿舍E', '{宿舍E,E栋}', 80, -50, 'building');

-- ============================================================
-- 部署说明
-- ============================================================
-- 1. 注册 Supabase 账号，创建项目
-- 2. 进入 SQL Editor，把整个文件粘贴进去执行
-- 3. 到 Database → Replication → 打开 Realtime，勾选 events/reports/feedbacks/road_edges 表
-- 4. 到 Storage → 创建一个 bucket 叫 "report-images"（存上报图片）
-- 5. 把 Project URL 和 anon key 配置到前端和后端
--
-- 后端（AutoDL上的FastAPI）需要 service_role key，
-- 用于AI处理完写回数据库（绕过RLS限制）
-- ============================================================
