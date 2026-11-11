# Supabase 数据库搭建 · 完整版精确指南

> 目标：搭建专业级的校园态势数据库（PostgreSQL + PostGIS + Realtime + Auth + Storage）
> 预计耗时：15~20 分钟
> 操作环境：Chrome 浏览器（推荐，可右键翻译）

---

## 🔴 第一步：创建 Supabase 项目

### 1.1 进入 Dashboard
- 网址：https://supabase.com/dashboard
- 登录你的账号

### 1.2 新建项目
1. 点击页面右上角的 **绿色按钮「New project」**
2. 如果你有多个组织，选择你要使用的组织

### 1.3 填写项目信息（精确填写）

| 字段名 | 填写内容 | 操作说明 |
|--------|---------|---------|
| **Name** | `our-campus-db` | 项目名称，只能英文、数字、横杠 |
| **Database Password** | `自己设一个强密码，比如：Campus@2026!Ai` | ⚠️ **必须记下来**，建议存到记事本，后面要用 |
| **Region** | **Southeast Asia (Singapore)** | 点开下拉框，找到 Singapore（新加坡节点，国内访问最快） |
| **Pricing Plan** | **Free** | 选免费版，竞赛够用 |

### 1.4 创建
- 点击底部绿色按钮 **「Create new project」**
- 页面会显示 "Setting up your project..."
- **等待 2~3 分钟**，不要关闭页面
- 看到左边菜单栏出现很多选项（Table Editor、SQL Editor 等）= 创建成功 ✅

---

## 🔴 第二步：启用数据库扩展

> PostGIS 这些扩展需要手动开启。

### 2.1 进入扩展管理页面
1. 左侧菜单栏找到 **「Database」**（图标是圆柱体/数据库，在中间位置）
2. 点击进入 Database 页面
3. 顶部有一排选项卡，找到 **「Extensions」**（扩展，从左数第 2 或第 3 个）
4. 点击 **Extensions**

### 2.2 启用 4 个扩展（一个一个来）

在搜索框里分别搜索下面的扩展，找到后打开右边的开关：

#### 扩展 1：postgis
- 在搜索框输入 `postgis`
- 找到 `postgis` 扩展
- 把右边的开关 **拨到 ON（打开状态）**
- 弹出确认框，点 **「Enable」**

#### 扩展 2：uuid-ossp
- 搜索 `uuid-ossp`
- 打开开关 → Enable

#### 扩展 3：pg_trgm
- 搜索 `pg_trgm`
- 打开开关 → Enable

#### 扩展 4：pgcrypto
- 搜索 `pgcrypto`
- 打开开关 → Enable

### 2.3 验证
打开开关后，开关应该变成蓝色/绿色状态。
确认 4 个扩展都是开启状态：
- ✅ postgis
- ✅ uuid-ossp
- ✅ pg_trgm
- ✅ pgcrypto

---

## 🔴 第三步：运行 SQL 建表（完整版）

> ⚠️ 这一步最关键，SQL 比较长，**确保完整复制，不要漏**。

### 3.1 进入 SQL Editor
1. 左侧菜单栏找到 **「SQL Editor」**（图标是 `>_` 终端，在 Table Editor 下面）
2. 点击进入
3. 点击 **「New query」** 按钮（如果没有自动打开的话）

### 3.2 复制完整 SQL

把下面**所有内容**完整复制（从 `-- =====` 开始到最后一行），粘贴到 SQL Editor 的编辑框里：

```sql
-- ============================================================
-- Our Campus - 完整版数据库表结构 v1.0
-- PostgreSQL + PostGIS + 完整业务表 + 索引 + RLS + 种子数据
-- ============================================================

-- 确认扩展已启用
create extension if not exists postgis;
create extension if not exists "uuid-ossp";
create extension if not exists pg_trgm;
create extension if not exists pgcrypto;

-- ============================================================
-- 【表 1/10】锚点表 anchors
-- ============================================================
-- 所有地点的枚举锚点，是空间去重的基础
-- 对应设计文档 §3.1 的 ANCHOR 枚举
-- ============================================================
create table anchors (
  id          text primary key,            -- 锚点ID，如 ANCHOR_MainGate
  name        text not null,               -- 显示名，如"主校门"
  aliases     text[] default '{}',         -- 别名数组，如 '{三食堂,第三食堂,食堂}'
  building_id text,                        -- 关联建筑ID
  type        text not null default 'building', -- 类型：building / road / landmark / area
  world_x     float not null,              -- 3D世界坐标 X
  world_z     float not null,              -- 3D世界坐标 Z
  floor       int default 0,               -- 楼层
  geom        geometry(Point, 4326),       -- 地理经纬度（真实地理数据时用）
  metadata    jsonb default '{}',          -- 扩展字段
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index idx_anchors_type on anchors (type);
create index idx_anchors_world on anchors (world_x, world_z);
create index idx_anchors_geom on anchors using gist (geom);
create index idx_anchors_name_trgm on anchors using gin (name gin_trgm_ops); -- 模糊搜索

-- ============================================================
-- 【表 2/10】事件表 events
-- ============================================================
-- 去重聚合后的事件，是前端展示的核心
-- ============================================================
create table events (
  id                  uuid primary key default uuid_generate_v4(),
  type                text not null,           -- traffic / safety / activity / info / queue
  title               text,                    -- 标题
  description         text,                    -- 描述
  anchor_id           text references anchors(id), -- 主锚点
  anchor_name         text,                    -- 锚点显示名（冗余存，避免联表查）
  world_x             float,                   -- 3D坐标 X
  world_z             float,                   -- 3D坐标 Z
  geom                geometry(Point, 4326),   -- 地理坐标
  severity            text default 'normal',   -- info / low / normal / high / critical
  credibility         float default 0.5,       -- 可信度 0-1
  credibility_detail  jsonb default '{}',      -- 可信度分解：{ugc_count, official_support, consistency...}
  status              text default 'processing', -- processing / pending_review / published / resolved / closed
  report_count        int default 1,           -- 去重后的上报人数
  evidence_quote      text,                    -- 原文引用片段（证据链）
  affected_edges      text[] default '{}',     -- 受影响路段ID（封路用）
  tags                text[] default '{}',     -- 标签
  metadata            jsonb default '{}',      -- 扩展字段
  dedup_cluster_id    uuid,                    -- 去重簇ID
  first_reported_at   timestamptz default now(),
  last_updated_at     timestamptz default now(),
  resolved_at         timestamptz
);

create index idx_events_status on events (status);
create index idx_events_type on events (type);
create index idx_events_anchor on events (anchor_id);
create index idx_events_created on events (first_reported_at desc);
create index idx_events_updated on events (last_updated_at desc);
create index idx_events_world on events (world_x, world_z);
create index idx_events_geom on events using gist (geom);
create index idx_events_credibility on events (credibility);
create index idx_events_title_trgm on events using gin (title gin_trgm_ops);

-- ============================================================
-- 【表 3/10】上报明细表 reports
-- ============================================================
-- 每一条用户上报，多个上报可聚合成一个 event
-- ============================================================
create table reports (
  id                  uuid primary key default uuid_generate_v4(),
  event_id            uuid references events(id) on delete set null,
  user_id             uuid references auth.users,
  client_report_id    text,                        -- 客户端幂等ID，防重复提交
  content             text not null,               -- 原始上报内容
  anchor_id           text references anchors(id), -- 上报时选的锚点
  anchor_name         text,                        -- 锚点名
  world_x             float,
  world_z             float,
  geom                geometry(Point, 4326),
  position_source     text default 'manual',       -- auto / manual / beacon
  position_confidence float default 0.7,           -- 位置可信度 0-1
  images              text[] default '{}',         -- 图片URL列表
  parsed_result       jsonb,                       -- AI约束解码结果
  dedup_cluster_id    uuid,                        -- 去重簇ID
  status              text default 'received',     -- received / parsing / parsed / merged / rejected
  reject_reason       text,                        -- 拒绝原因
  ip_address          inet,                        -- 上报IP（辅助去重）
  user_agent          text,                        -- 浏览器/设备信息
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

create index idx_reports_event on reports (event_id);
create index idx_reports_user on reports (user_id);
create index idx_reports_anchor on reports (anchor_id);
create index idx_reports_created on reports (created_at desc);
create index idx_reports_status on reports (status);
create index idx_reports_client_id on reports (client_report_id);
create index idx_reports_world on reports (world_x, world_z);
create index idx_reports_geom on reports using gist (geom);

-- ============================================================
-- 【表 4/10】反馈表 feedbacks
-- ============================================================
-- 用户对事件的反馈，用于可信度动态调整
-- ============================================================
create table feedbacks (
  id            uuid primary key default uuid_generate_v4(),
  event_id      uuid not null references events(id) on delete cascade,
  user_id       uuid references auth.users,
  feedback_type text not null,    -- confirm(我也看到了) / deny(不实) / resolved(已解决)
  comment       text,
  weight        float default 1.0, -- 反馈权重（根据用户信誉分）
  created_at    timestamptz default now(),
  unique (event_id, user_id, feedback_type) -- 同一用户同类型只能反馈一次
);

create index idx_feedbacks_event on feedbacks (event_id);
create index idx_feedbacks_user on feedbacks (user_id);
create index idx_feedbacks_type on feedbacks (feedback_type);

-- ============================================================
-- 【表 5/10】用户资料表 profiles
-- ============================================================
-- 扩展 Supabase Auth 的用户信息
-- ============================================================
create table profiles (
  user_id             uuid primary key references auth.users on delete cascade,
  nickname            text,
  avatar_url          text,
  bio                 text,
  credit_score        int default 100,       -- 信誉分，影响上报权重
  report_count        int default 0,         -- 历史上报总数
  verified_report_count int default 0,       -- 被证实的上报数
  false_report_count  int default 0,         -- 不实上报数
  role                text default 'user',   -- user / moderator / admin
  preferences         jsonb default '{}',    -- 用户偏好设置
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

create index idx_profiles_credit on profiles (credit_score);
create index idx_profiles_role on profiles (role);

-- 新用户注册时自动创建 profile
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (user_id, nickname)
  values (new.id, coalesce(new.raw_user_meta_data->>'nickname', '用户' || substr(new.id::text, 1, 6)));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 【表 6/10】路段表 road_edges
-- ============================================================
-- 路网边，用于封路联动、通行热度
-- ============================================================
create table road_edges (
  id          text primary key,     -- 如 outer_s2_s3
  from_node   text not null,        -- 起点节点ID
  to_node     text not null,        -- 终点节点ID
  length      float not null,       -- 长度（米）
  walk_time   float,                -- 预计步行时间（秒）
  is_closed   boolean default false, -- 是否封闭
  closed_by   uuid references events(id), -- 被哪个事件封闭
  closed_at   timestamptz,          -- 封闭时间
  geom        geometry(LineString, 4326), -- 地理路径
  world_path  jsonb,                -- 3D世界坐标路径：[{x,z}, ...]
  tags        text[] default '{}',  -- 标签：main_road / path / stairs / bridge ...
  created_at  timestamptz default now()
);

create index idx_road_edges_from on road_edges (from_node);
create index idx_road_edges_to on road_edges (to_node);
create index idx_road_edges_closed on road_edges (is_closed) where is_closed = true;
create index idx_road_edges_geom on road_edges using gist (geom);

-- ============================================================
-- 【表 7/10】路网节点表 road_nodes
-- ============================================================
create table road_nodes (
  id          text primary key,
  world_x     float not null,
  world_z     float not null,
  geom        geometry(Point, 4326),
  type        text default 'normal', -- normal / intersection / entrance / landmark
  name        text                   -- 可选名称
);

create index idx_road_nodes_world on road_nodes (world_x, world_z);
create index idx_road_nodes_geom on road_nodes using gist (geom);

-- ============================================================
-- 【表 8/10】通行热度表 traffic_heat
-- ============================================================
-- 按路段 × 时间桶统计，用于异常检测
-- ============================================================
create table traffic_heat (
  id                bigserial primary key,
  edge_id           text not null references road_edges(id),
  time_bucket       timestamptz not null,    -- 15分钟桶起始时间
  pedestrian_count  int default 0,           -- 行人数
  bicycle_count     int default 0,           -- 自行车数
  vehicle_count     int default 0,           -- 机动车数
  created_at        timestamptz default now()
);

create unique index idx_traffic_heat_bucket on traffic_heat (edge_id, time_bucket);
create index idx_traffic_heat_time on traffic_heat (time_bucket desc);
create index idx_traffic_heat_edge on traffic_heat (edge_id);

-- ============================================================
-- 【表 9/10】官方通知表 official_notices
-- ============================================================
-- 从官网/公众号抓取，用于可信度核查的官方源
-- ============================================================
create table official_notices (
  id              uuid primary key default uuid_generate_v4(),
  source          text not null,         -- website / wechat / backend / manual
  source_url      text,                  -- 原文链接
  title           text not null,
  content         text,
  category        text,                  -- traffic / safety / activity / notice
  related_anchor  text references anchors(id),
  publish_time    timestamptz,
  ai_summary      text,                  -- AI 摘要
  ai_keywords     text[] default '{}',   -- AI 关键词
  ai_entities     jsonb default '{}',    -- AI 提取的实体
  status          text default 'active', -- active / expired
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index idx_official_publish on official_notices (publish_time desc);
create index idx_official_anchor on official_notices (related_anchor);
create index idx_official_category on official_notices (category);
create index idx_official_status on official_notices (status);

-- ============================================================
-- 【表 10/10】AI 处理日志表 ai_processing_logs
-- ============================================================
-- 记录每次AI处理的输入输出，用于调试、评估、回溯
-- ============================================================
create table ai_processing_logs (
  id              bigserial primary key,
  report_id       uuid references reports(id),
  event_id        uuid references events(id),
  pipeline_step   text not null,       -- parse / anchor_match / dedup / credibility / publish
  input_data      jsonb,
  output_data     jsonb,
  model_name      text,                -- 用的模型名
  duration_ms     int,                 -- 处理耗时(毫秒)
  status          text default 'success', -- success / failed / skipped
  error_msg       text,
  created_at      timestamptz default now()
);

create index idx_ai_logs_report on ai_processing_logs (report_id);
create index idx_ai_logs_event on ai_processing_logs (event_id);
create index idx_ai_logs_step on ai_processing_logs (pipeline_step);
create index idx_ai_logs_created on ai_processing_logs (created_at desc);
create index idx_ai_logs_status on ai_processing_logs (status);

-- ============================================================
-- 触发器：自动更新 updated_at 字段
-- ============================================================
create function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_anchors_updated_at
  before update on anchors
  for each row execute function update_updated_at_column();

create trigger update_reports_updated_at
  before update on reports
  for each row execute function update_updated_at_column();

create trigger update_profiles_updated_at
  before update on profiles
  for each row execute function update_updated_at_column();

create trigger update_official_notices_updated_at
  before update on official_notices
  for each row execute function update_updated_at_column();

-- events 表用 last_updated_at 字段名
create function update_events_last_updated()
returns trigger as $$
begin
  new.last_updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_events_last_updated
  before update on events
  for each row execute function update_events_last_updated();

-- ============================================================
-- 行级安全策略（RLS）
-- ============================================================
-- 前端用 anon key 直连数据库，RLS 保证用户只能干允许的事
-- ============================================================

-- 开启 RLS
alter table events enable row level security;
alter table reports enable row level security;
alter table feedbacks enable row level security;
alter table anchors enable row level security;
alter table road_edges enable row level security;
alter table road_nodes enable row level security;
alter table traffic_heat enable row level security;
alter table official_notices enable row level security;
alter table profiles enable row level security;
alter table ai_processing_logs enable row level security;

-- 事件：所有人可读
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

-- 锚点、路网、官方通知、通行热度：公开只读
create policy "Anchors are viewable by everyone" on anchors
  for select using (true);

create policy "Road edges are viewable by everyone" on road_edges
  for select using (true);

create policy "Road nodes are viewable by everyone" on road_nodes
  for select using (true);

create policy "Traffic heat is viewable by everyone" on traffic_heat
  for select using (true);

create policy "Official notices are viewable by everyone" on official_notices
  for select using (true);

-- AI日志：仅服务端角色可读写，前端不可见
create policy "AI logs are not accessible via anon" on ai_processing_logs
  for select using (false);

-- 用户资料：公开可读，自己可改
create policy "Profiles are viewable by everyone" on profiles
  for select using (true);

create policy "Users can update own profile" on profiles
  for update using (auth.uid() = user_id);

-- ============================================================
-- 开启 Realtime 所需：设置 REPLICA IDENTITY
-- ============================================================
alter table events replica identity full;
alter table reports replica identity full;
alter table feedbacks replica identity full;
alter table road_edges replica identity full;

-- ============================================================
-- 种子数据（演示用初始数据）
-- ============================================================
-- 坐标为示例值，接入时请替换为你们真实的3D坐标
-- ============================================================

-- 锚点（示例，5个核心地点）
insert into anchors (id, name, aliases, type, world_x, world_z) values
  ('ANCHOR_MainGate', '主校门', '{校门,大门口,正门,南门}', 'building', 0, -100),
  ('ANCHOR_Canteen', '第三食堂', '{三食堂,食堂,第三食堂,3食堂,饭堂}', 'building', 167.6, 43.0),
  ('ANCHOR_Library', '图书馆', '{图书馆,讲堂,图书馆讲堂}', 'building', 100, 200),
  ('ANCHOR_DormE', '宿舍E栋', '{宿舍E,E栋,E宿舍楼}', 'building', 80, -50),
  ('ANCHOR_Corridor', '智慧环廊', '{环廊,智慧环廊,走廊}', 'landmark', 250, 150)
on conflict (id) do nothing;

-- 初始事件（5条不同类型，演示用）
insert into events (type, title, description, anchor_id, anchor_name, world_x, world_z, severity, credibility, credibility_detail, status, report_count, evidence_quote, tags) values
  (
    'traffic', '三食堂东侧卡车占道',
    '第三食堂东侧道路有一辆货车停靠，影响行人通行',
    'ANCHOR_Canteen', '第三食堂', 167.6, 43.0,
    'high', 0.86,
    '{"ugc_count": 4, "official_support": false, "consistency": 0.92}',
    'published', 4,
    '停了辆卡车，过不去了',
    '{封路,占道}'
  ),
  (
    'activity', '社团招新进行中',
    '图书馆前广场各社团正在招新，现场人比较多，建议错峰前往',
    'ANCHOR_Library', '图书馆', 100, 200,
    'info', 0.92,
    '{"ugc_count": 8, "official_support": true, "consistency": 0.95}',
    'published', 8,
    '好多社团在摆摊位，人挺多的',
    '{社团,招新}'
  ),
  (
    'safety', '环廊台阶有积水',
    '智慧环廊东段台阶发现积水，可能是水管渗漏，请注意防滑',
    'ANCHOR_Corridor', '智慧环廊', 250, 150,
    'low', 0.45,
    '{"ugc_count": 1, "official_support": false, "consistency": 0.6}',
    'pending_review', 1,
    '地上有水，小心滑倒',
    '{积水,安全隐患}'
  ),
  (
    'queue', '食堂排队较长',
    '第三食堂午餐时段排队约15分钟，建议错峰用餐',
    'ANCHOR_Canteen', '第三食堂', 167.6, 43.0,
    'normal', 0.78,
    '{"ugc_count": 12, "official_support": false, "consistency": 0.88}',
    'published', 12,
    '队伍都排到门口了',
    '{排队,用餐}'
  ),
  (
    'info', '下午有阵雨',
    '天气预报显示下午3点左右有阵雨，请大家出门记得带伞',
    'ANCHOR_MainGate', '主校门', 0, -100,
    'info', 0.95,
    '{"ugc_count": 1, "official_support": true, "consistency": 1.0}',
    'published', 1,
    '下午要下雨，记得带伞',
    '{天气,提醒}'
  )
on conflict do nothing;

-- ============================================================
-- 🎉 数据库搭建完成！
-- ============================================================
```

### 3.3 执行 SQL
1. 确认 SQL 完整粘贴到编辑框了
2. 点击右下角的 **绿色「Run」** 按钮
   - 或者按快捷键 `Ctrl + Enter`（Windows）/ `Cmd + Enter`（Mac）
3. 等待执行（大约几秒钟）
4. 底部结果区域显示 **「Success. No rows returned」** = 成功 ✅

> ⚠️ 如果报错了：
> - 把错误信息**完整复制**下来
> - 检查是不是扩展没开（报 "type geometry does not exist" = PostGIS 没开）
> - 发我看看，我帮你解决

---

## 🔴 第四步：验证表是否创建成功

### 4.1 查看表列表
1. 左侧菜单点击 **「Table Editor」**（表格图标，最上面那个）
2. 左边边栏会列出所有表
3. 你应该能看到这 10 张表：
   - ✅ `anchors`（锚点表）
   - ✅ `events`（事件表）
   - ✅ `reports`（上报表）
   - ✅ `feedbacks`（反馈表）
   - ✅ `profiles`（用户资料表）
   - ✅ `road_edges`（路段表）
   - ✅ `road_nodes`（路网节点表）
   - ✅ `traffic_heat`（通行热度表）
   - ✅ `official_notices`（官方通知表）
   - ✅ `ai_processing_logs`（AI日志表）

### 4.2 检查种子数据
1. 点击 `events` 表
2. 应该能看到 **5 条数据**（就是种子数据）
3. 点击 `anchors` 表
4. 应该能看到 **5 个锚点**（主校门、三食堂、图书馆等）

---

## 🔴 第五步：开启 Realtime 实时推送 ⭐

> 这一步让前端能实时收到新事件推送

### 5.1 进入 Realtime 配置
1. 左侧菜单点击 **「Database」**（数据库图标）
2. 顶部选项卡找到 **「Replication」**（复制/同步，往右找）
3. 点进去

### 5.2 找到 Realtime 区块
页面往下滚，找到 **「Realtime」** 区块（注意：不是上面的 "Publications"，是 Realtime）

### 5.3 添加要实时推送的表
1. 点 **「Add tables」** 或 **「0 tables」** 按钮
2. 勾选下面这些表（打 ☑️）：
   - ☑️ `events`（事件表，最关键）
   - ☑️ `reports`（上报表）
   - ☑️ `feedbacks`（反馈表）
   - ☑️ `road_edges`（路段表，封路时实时推送）
3. 点 **「Save」** 或 **「Enable」** 按钮

### 5.4 验证
- 看到那 4 张表出现在列表里 = 成功 ✅

---

## 🔴 第六步：创建存储桶（存图片）

### 6.1 进入 Storage
1. 左侧菜单点击 **「Storage」**（文件夹/云图标）
2. 如果是第一次进，可能会看到欢迎页，点 **「Get started」**

### 6.2 新建存储桶
1. 点击 **「New bucket」** 按钮
2. 填写：
   - **Name**: `report-images`（上报图片）
   - **Public bucket**: **勾选 ☑️**（公开可读，前端能直接显示）
3. 点击 **「Create bucket」**

### 6.3 （可选）再建一个头像桶
1. 再点 **「New bucket」**
2. **Name**: `avatars`
3. **Public bucket**: ☑️ 勾选
4. **Create bucket**

---

## 🔴 第七步：获取 API 密钥 ⭐⭐⭐

> 这是连接数据库的钥匙，一定要保存好！

### 7.1 进入设置
1. 左侧菜单最底部找到 **「Project Settings」**（齿轮图标 ⚙️）
2. 点击进入

### 7.2 找到 API 设置
1. 左侧子菜单点击 **「API」**
2. 你会看到这些信息：

#### ① Project URL
- 格式：`https://xxxxxxxxxxxx.supabase.co`
- **这是你的数据库地址**

#### ② Project API keys
下面有两个 key：

| Key 名称 | 用途 | 安全性 |
|----------|------|--------|
| **anon public** | 前端网页/App 用 | ✅ 可以公开（受RLS保护） |
| **service_role** | AutoDL 后端服务用 | ⚠️ **绝密！绝对不能放前端** |

### 7.3 保存密钥
把下面三个值**复制到记事本**，保存好：

```
SUPABASE_URL = https://你的项目ID.supabase.co
SUPABASE_ANON_KEY = 你的anon公钥（很长一串）
SUPABASE_SERVICE_ROLE_KEY = 你的service_role密钥（很长一串）
```

> ⚠️ **安全红线**：
> - `anon key` 可以放在前端代码里（它受 RLS 策略保护）
> - `service_role key` 只能存在服务器上（AutoDL 后端），**绝对不能提交到 GitHub、不能写在前端代码里**
> - 泄露了 service_role key 别人能删你整个数据库

---

## ✅ 第一阶段完成！

到这里，你的数据库服务器已经完全搭好了：

| 组件 | 状态 |
|------|------|
| PostgreSQL 数据库 | ✅ 已就绪 |
| PostGIS 空间扩展 | ✅ 已启用 |
| pg_trgm 模糊搜索 | ✅ 已启用 |
| 10 张业务表 | ✅ 已创建 |
| 种子数据 | ✅ 已导入 |
| RLS 行级安全 | ✅ 已配置 |
| Realtime 实时推送 | ✅ 已开启 |
| Auth 用户认证 | ✅ 自带可用 |
| Storage 文件存储 | ✅ 已创建桶 |
| API 密钥 | ✅ 已获取 |

---

## 📋 下一步计划

数据库搭好后，接下来要做的（按顺序）：

1. **配置 Database Webhook** —— 新上报自动触发 AutoDL 的 AI 服务
2. **前端接入 Supabase SDK** —— 替换原来的 mock 数据源
3. **AutoDL 推理服务开发** —— 接收 webhook → 调用 Qwen → 写回结果
4. **导入真实锚点和路网数据** —— 把你们前端的 BUILDINGS / ROAD_NODES 导入数据库

---

## ❓ 遇到问题怎么办

把以下信息发给我：
1. 哪一步出的问题
2. 错误提示的**完整英文原文**（截图最好）
3. 你操作了什么

我会帮你解决。
