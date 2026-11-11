# Supabase 快速上手指南（中文版）

> 注册完账号后，按这个步骤操作，10 分钟搞定数据库搭建

---

## 第一步：创建新项目

1. 登录后进入主页：https://supabase.com/dashboard
2. 点击右上角的 **「New project」** 按钮（绿色的）
3. 填写项目信息：

   | 字段 | 填什么 | 说明 |
   |------|--------|------|
   | **Name** | `our-campus` 或你自己起个名字 | 项目名，英文就行 |
   | **Database Password** | 自己设一个强密码 | ⚠️ **一定要记下来**，后面连数据库要用 |
   | **Region** | 选 **Southeast Asia (Singapore)** | 新加坡节点，国内访问最快 |
   | **Pricing Plan** | 选 **Free** | 免费版够用 |

4. 点 **「Create new project」** 按钮
5. 等待大约 2 分钟（它在后台给你建数据库）

---

## 第二步：运行 SQL 建表

项目建好后，进入项目后台，左边有一排菜单。我们要去 **SQL Editor** 执行建表脚本。

### 操作步骤：

1. 左边菜单栏找到 **「SQL Editor」**（图标是一个终端 `>_`）
2. 点进去后，点 **「New query」** 按钮
3. 把下面简化版的 SQL 脚本**全部复制**进去：

```sql
-- ============================================================
-- Our Campus - 简化版数据库表结构
-- 竞赛演示够用，核心就2张业务表
-- ============================================================

-- 启用 UUID 生成函数
create extension if not exists "uuid-ossp";

-- ============================================================
-- 1. 事件表（AI 聚合后的事件，前端地图打点用这个）
-- ============================================================
create table events (
  id              uuid primary key default uuid_generate_v4(),
  type            text not null,           -- 事件类型：traffic / safety / activity / info / queue
  title           text,                    -- 标题
  description     text,                    -- 描述
  anchor_id       text,                    -- 锚点ID（前端定义，直接传过来）
  anchor_name     text,                    -- 锚点显示名（前端传过来，省得查）
  world_x         float,                   -- 3D世界坐标 X
  world_z         float,                   -- 3D世界坐标 Z
  severity        text default 'normal',   -- 严重度：info / low / normal / high / critical
  credibility     float default 0.5,       -- 可信度 0-1
  credibility_detail jsonb default '{}',   -- 可信度分解明细
  status          text default 'processing', -- processing / published / pending_review / resolved
  report_count    int default 1,           -- 上报人数
  evidence_quote  text,                    -- 原文引用片段
  tags            text[] default '{}',     -- 标签
  metadata        jsonb default '{}',      -- 扩展字段
  first_reported_at timestamptz default now(),
  last_updated_at   timestamptz default now(),
  resolved_at       timestamptz
);

-- 建索引（加速查询）
create index idx_events_status on events (status);
create index idx_events_type on events (type);
create index idx_events_created on events (first_reported_at desc);

-- ============================================================
-- 2. 上报明细表（每一条用户上报）
-- ============================================================
create table reports (
  id              uuid primary key default uuid_generate_v4(),
  event_id        uuid references events(id) on delete set null,
  user_id         uuid references auth.users,
  client_report_id text,                        -- 客户端幂等ID
  content         text not null,                -- 原始上报内容
  anchor_id       text,                         -- 锚点ID
  anchor_name     text,                         -- 锚点名
  world_x         float,
  world_z         float,
  position_source text default 'manual',        -- auto / manual / beacon
  position_confidence float default 0.7,        -- 位置可信度
  images          text[] default '{}',          -- 图片URL
  parsed_result   jsonb,                        -- AI解析结果
  status          text default 'received',      -- received / processing / parsed / merged / rejected
  created_at      timestamptz default now()
);

create index idx_reports_event on reports (event_id);
create index idx_reports_user on reports (user_id);
create index idx_reports_created on reports (created_at desc);
create index idx_reports_status on reports (status);

-- ============================================================
-- 3. 反馈表（用户对事件的反馈：我也看到了 / 不实）
-- ============================================================
create table feedbacks (
  id          uuid primary key default uuid_generate_v4(),
  event_id    uuid not null references events(id) on delete cascade,
  user_id     uuid references auth.users,
  feedback_type text not null,    -- confirm / deny / resolved
  comment     text,
  created_at  timestamptz default now()
);

create index idx_feedbacks_event on feedbacks (event_id);
create index idx_feedbacks_user on feedbacks (user_id);

-- ============================================================
-- 4. 用户资料表（扩展 Supabase Auth 的用户信息）
-- ============================================================
create table profiles (
  user_id     uuid primary key references auth.users on delete cascade,
  nickname    text,
  avatar_url  text,
  credit_score int default 100,      -- 信誉分
  report_count int default 0,        -- 上报次数
  created_at  timestamptz default now()
);

-- 新用户注册时自动创建 profile
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
-- 5. 行级安全策略（RLS）
-- ============================================================
-- 开启后，前端用公开密钥只能读，修改要校验身份
-- ============================================================

alter table events enable row level security;
alter table reports enable row level security;
alter table feedbacks enable row level security;
alter table profiles enable row level security;

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

-- 用户资料：公开可读，自己可改
create policy "Profiles are viewable by everyone" on profiles
  for select using (true);

create policy "Users can update own profile" on profiles
  for update using (auth.uid() = user_id);

-- ============================================================
-- 6. 开启 Realtime（实时推送）
-- ============================================================
-- 执行完 SQL 后，还要去后台手动开启 Realtime（第4步教你）
-- ============================================================

alter table events replica identity full;
alter table reports replica identity full;
alter table feedbacks replica identity full;

-- ============================================================
-- 7. 辅助函数：自动更新时间
-- ============================================================
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
-- 8. 插入演示数据（种子数据，让地图一开始就有东西）
-- ============================================================
-- 先插 5 条不同类型的事件作为初始演示数据
-- 坐标是示例值，你们可以改成自己校园的真实坐标
-- ============================================================

insert into events (type, title, description, anchor_id, anchor_name, world_x, world_z, severity, credibility, status, report_count, evidence_quote) values
  ('traffic', '三食堂东侧卡车占道', '第三食堂东侧道路有一辆货车停靠，影响通行', 'ANCHOR_Canteen', '第三食堂', 167.6, 43.0, 'high', 0.86, 'published', 4, '停了辆卡车，过不去了'),
  ('activity', '社团招新中', '图书馆前广场各社团正在招新，人比较多', 'ANCHOR_Library', '图书馆', 100, 200, 'info', 0.92, 'published', 8, '好多社团在摆摊位'),
  ('safety', '环廊台阶有积水', '智慧环廊东段台阶有积水，请注意防滑', 'ANCHOR_Corridor', '智慧环廊', 250, 150, 'low', 0.45, 'pending_review', 1, '地上有水，小心滑倒'),
  ('queue', '食堂排队较长', '第三食堂午餐时段排队约15分钟', 'ANCHOR_Canteen', '第三食堂', 167.6, 43.0, 'normal', 0.78, 'published', 12, '队伍排到门口了'),
  ('info', '下午有雨', '天气预报显示下午3点左右有阵雨，记得带伞', 'ANCHOR_MainGate', '主校门', 0, 0, 'info', 0.95, 'published', 1, '下午要下雨');

-- ============================================================
-- 建表完成！
-- ============================================================
```

4. 点击右下角的 **「Run」** 按钮（或者按 `Ctrl+Enter`）
5. 看到下方显示 **"Success. No rows returned"** 就说明成功了 ✅

> 💡 提示：如果遇到错误，把错误信息截图发给我，我帮你看。

---

## 第三步：验证表是否建好了

1. 左边菜单点 **「Table Editor」**（图标是个表格）
2. 你应该能看到这些表：
   - `events`（事件表）
   - `reports`（上报表）
   - `feedbacks`（反馈表）
   - `profiles`（用户资料表）
3. 点 `events` 表，应该能看到 5 条种子数据
4. 点 `reports` 表，应该是空的（还没人发帖）

---

## 第四步：开启 Realtime（实时推送）⭐

这一步很重要，开启后前端才能实时收到新事件。

### 操作步骤：

1. 左边菜单找到 **「Database」** → 点进去
2. 在 Database 页面，找到 **「Replication」** 选项卡（在顶部导航栏，从左数第 5 个左右）
3. 找到 **「Realtime」** 区块（不是 Publications！）
4. 点 **「0 tables」** 旁边的按钮（或者有个 "Add tables" / "Enable Realtime for tables"）
5. 勾选下面这几张表：
   - ☑️ `events`
   - ☑️ `reports`
   - ☑️ `feedbacks`
6. 点 **「Save」** 或 **「Enable」** 按钮

> 💡 提示：Supabase 界面偶尔会更新，按钮位置可能稍有不同。找 "Realtime" 相关的就行。

---

## 第五步：创建存储桶（存上报图片用）

如果用户上报要发照片，需要创建一个存储桶。

### 操作步骤：

1. 左边菜单找到 **「Storage」**（图标是个文件夹/云）
2. 点 **「New bucket」** 按钮
3. 填写：
   - **Name**: `report-images`
   - **Public bucket**: 勾选 ☑️（公开可读，方便前端直接显示图片）
4. 点 **「Create bucket」**

> ⚠️ 注意：公开桶任何人都能读，但写入需要登录，对于演示场景没问题。如果要正式上线，建议改成私有桶，用签名 URL 访问。

---

## 第六步：获取 API 密钥（前端和后端要用）⭐

最后一步，拿到连接数据库需要的 URL 和密钥。

### 操作步骤：

1. 左边菜单找到 **「Project Settings」**（最底部，齿轮图标 ⚙️）
2. 点进去后，左边菜单选 **「API」**
3. 你会看到两个重要信息：

   | 名称 | 说明 | 给谁用？ |
   |------|------|---------|
   | **Project URL** | 项目地址，长这样：`https://xxxx.supabase.co` | 前端和后端都要用 |
   | **anon public** | 公开密钥（可以放前端） | 前端用 |
   | **service_role** | 服务端密钥（⚠️ 保密！） | AutoDL 后端用，**千万不要放前端** |

4. **把这三个值复制下来，保存好：**
   - Project URL
   - anon public key
   - service_role key

> ⚠️ **重要提醒**：
> - `anon key` 可以放在前端代码里（它受 RLS 策略限制，用户只能干允许的事）
> - `service_role key` 绝对不能放前端！它能绕过所有安全限制，只能在服务器后端用

---

## 完成！🎉

现在你的数据库已经搭好了，可以用了。总结一下你拿到了什么：

- ✅ PostgreSQL 数据库（3 张核心表 + 种子数据）
- ✅ Realtime 实时推送（已开启）
- ✅ Auth 用户认证系统（自带）
- ✅ Storage 文件存储（report-images 桶）
- ✅ 两个密钥（前端用 anon，后端用 service_role）

---

## 下一步：连接到你的项目

### 前端接入需要的信息：
```javascript
const SUPABASE_URL = '你的 Project URL'
const SUPABASE_ANON_KEY = '你的 anon public key'
```

### AutoDL 后端接入需要的信息：
```python
SUPABASE_URL = '你的 Project URL'
SUPABASE_SERVICE_ROLE_KEY = '你的 service_role key'
```

---

## 常见问题

### Q: 我看不懂英文怎么办？
A: 用 Chrome 浏览器，右键 → 翻译成中文，基本能看懂。关键按钮我上面都标了位置。

### Q: 表建错了能删吗？
A: 可以。在 Table Editor 里，点表名旁边的三个点 → Delete table。删了重新跑 SQL 就行。

### Q: 种子数据的坐标不对怎么办？
A: 没关系，种子数据只是演示用的。你们前端接入后，真实发帖的坐标是从前端传过来的。

### Q: 免费版够用吗？
A: 竞赛演示完全够用。500MB 数据库能存几十万条事件。

---

**如果哪一步卡住了，把错误信息或者截图发给我，我帮你解决。**
