# Supabase 搭建完整版指南 · CampusTwin 项目已填写版

更新日期：2026-10-03。交接对象：负责服务器的同学。

**目标：为“数字校园孪生”建立真实账号、校园热点、失物招领、设施补充、反馈／报修、多人大厅和消息中心的数据基础。** 本指南沿用原文的 Supabase 托管云项目方案。表结构按现有前端字段编写；目前没有创建云项目，也没有将前端连到 Supabase。

这份指南与两个 SQL 文件一起发送：

1. [01-CampusTwin-schema.sql](01-CampusTwin-schema.sql)：建表、权限、Auth 用户资料触发器、存储桶及 Realtime。
2. [02-CampusTwin-seed.sql](02-CampusTwin-seed.sql)：导入当前项目的 66 个地点、5 个地区、4 条服务信息。

**执行顺序：创建空白项目 → 执行 01 → 执行 02 → 核对数据与权限 → 配置登录 → 把公开连接信息交给前端开发者。** SQL 已做本地静态检查及导出数据核对，尚未在真实 Supabase 数据库执行；执行结果以同学的项目为准。

---

## 一、项目信息（已经填好）

| 项目项 | 本项目内容 |
| --- | --- |
| 软件名称 | 数字校园孪生 |
| 代码名称 | CampusTwin |
| 校园范围 | 本校区 · 本校区 |
| Supabase 项目 Name | 建议填写 `campustwin-campus-taigu` |
| 前端技术 | React 19、Vite、JavaScript、Lucide 图标；当前没有安装 Supabase SDK |
| 手机端 | Capacitor Android APK |
| Android App ID | `cn.edu.campus.campustwin` |
| 当前底部入口 | 首页、地点、大厅、我的 |
| 地图 | 腾讯地图原生 2D 地图和地点标签；校园平面图可回退 |
| 导航 | 保留现有腾讯地图路线／手机导航入口；本次不更换路线服务 |
| 前端开发地址 | `http://127.0.0.1:5173/`，仅指开发者自己电脑，不是公网服务器地址 |
| 已有地点数 | 66，地点主键沿用现有字符串 ID |
| 已有校园服务 | 4 条；开放时间未公开的保持空值；现有电话及来源仍需使用前核实 |
| 地图配置版本 | `campus-taigu-plan-2d-v2` |
| 登录界面 | 学号／校园账号 + 密码；手机号 + 6 位短信验证码 |
| 当前账号状态 | 未接真实认证；角色切换和管理员操作都是本机演示 |
| 当前大厅聊天 | 示例消息与本会话消息，不是多人实时聊天 |
| 当前新增社区数据 | 失物和设施贡献保存在 `campus-twin-community-v1`，没有跨设备同步 |
| 本期后台优先顺序 | 真实账号 → 失物／热点／设施同步 → 多人消息 → 消息中心 |

### 地点分类与地区是两个不同字段

地点 `category`：`learning` 教学学习、`dining` 餐饮生活、`living` 住宿空间、`service` 校园服务、`transport` 出行节点。

| `region_id` | 界面显示 |
| --- | --- |
| `teaching` | 教学区 |
| `living` | 生活区 |
| `dorm` | 宿舍区 |
| `sports` | 运动区 |
| `gate` | 校门周边 |

`all` 是“全部”的查询条件，不是可以写入数据库的地区。比如全部大厅消息应不加地区过滤；选生活区时按 `region_id = 'living'` 查询。

### 地点 ID 必须保持一致

| 前端 ID | 名称 | 说明 |
| --- | --- | --- |
| `east-gate` | 西校门 | 保留历史代码 ID；不能看 ID 中的 east 就改成东校门 |
| `library` | 图书馆 | 图书馆服务与热点关联这个 ID |
| `teaching-a` | 明德楼 | 保留已有 ID |
| `canteen` | 禾香餐厅 | 不是原指南的第三食堂 |
| `hospital` | 校医院 | 校医设施与服务信息的关联地点 |
| `gymnasium` | 体育场 | 以现有名称为准，不按代码词义重新命名 |
| `apartment-1` 至 `apartment-23` | 1 至 23 号公寓楼 | 已导出，不能用一个宿舍区替代全部楼号 |

完整地点信息在 `02` 文件中。同名地点可能拥有不同 ID，例如两个“车间”；不要以名称作为主键或合并它们。

---

## 二、创建 Supabase 项目

1. 打开 [Supabase Dashboard](https://supabase.com/dashboard)，使用服务器同学自己的账号登录。
2. 选择团队的 Organization，新建项目。
3. 按以下内容填写。

| Dashboard 字段 | 填写内容 |
| --- | --- |
| Name | `campustwin-campus-taigu` |
| Database Password | 由服务器同学生成独立强密码并保管；本文不放示例密码或真实密码 |
| Region | 建议先选 Singapore（若可选），再用同学的电脑和安卓手机测实际连通性；不保证该节点在国内最快 |
| Pricing Plan | 首版可先选 Free；容量、暂停规则、Realtime 和流量限额以账户当前页面为准 |

免费计划的范围以 [Supabase 官方价格页](https://supabase.com/pricing)为准。短信验证码要另配置短信服务商，不能把数据库免费理解成短信也免费，见下文 Auth 部分。

等待项目创建完成，确认 SQL Editor、Authentication、Storage 等入口可用。**如果已经执行过原指南的 10 张表，先告诉前端开发者当前表结构；不要在已有数据的库里直接运行本批新建表 SQL，也不要为消除报错删库。** 本批使用 `campus_locations`，不会自动将原文的 `anchors` 当作项目地点。

### 扩展选择

本批 SQL 使用 PostgreSQL 自带的 `gen_random_uuid()`，不依赖原文要求的四个扩展。66 个地点的初期搜索可先使用别名／关键词和 `ilike`，无需先引入复杂空间查询。

PostGIS 可在以后拿到可靠 WGS84 地理数据、需要服务端空间查询时启用；当前地点经纬度用于腾讯地图，坐标系是 **GCJ-02**。不要把它直接标成 `geometry(Point,4326)` 的 WGS84 数据，也不要把 `map_position` 的二维图比例位置当作经纬度。原文里的 3D 世界坐标不适合本版地图。

---

## 三、执行建表与导入 SQL

### 3.1 执行 01-CampusTwin-schema.sql

进入 SQL Editor → New query，打开附件 `01-CampusTwin-schema.sql`，完整复制并执行。

这个文件使用事务：如果某一步失败，该事务创建的内容不会部分保留。执行成功后再执行 `02`。`01` 是空白项目的初始化，不是可随意重复运行的迁移；出现 `already exists` 时先核对是否已经成功执行，不删除既有表。

### 3.2 公开业务表（10 张）

| 表名 | 对应前端功能 | 重点字段 |
| --- | --- | --- |
| `campus_regions` | 大厅地区筛选 | `id, label` |
| `campus_locations` | 地图、搜索、建筑卡片、导航目标 | `id, name, aliases, category, region_id, map_position, latitude, longitude` |
| `profiles` | 我的、聊天昵称、头像 | `user_id, nickname, avatar_path`；不存密码或手机号 |
| `campus_events` | 校园热点、活动日历、施工／关闭提示 | `location_id, type, title, impact, status, start_at, end_at` |
| `hall_messages` | 真实大厅消息、地区筛选 | `author_id, region_id, content, client_message_id, created_at` |
| `lost_found_posts` | 寻物、招领、我的发布 | `type, title, description, location_id, occurred_at, contact, image_path, status` |
| `facility_contributions` | 附近设施补充与确认 | `type, name, location_id, detail, status` |
| `place_feedback` | 地点反馈和设施报修 | `type, description, status, repair_category, reviewed_by` |
| `notifications` | 待接入的消息中心 | `recipient_id, type, related_type, related_id, read_at` |
| `campus_services` | 开放时间、电话、官网与服务说明 | `location_id, summary, hours, phone, website, source_url` |

另外有一张非公开表 `campus_private.user_roles`，存真实权限。新用户默认 `student`；这里是普通登录账号的权限名称，不代表学校已经认证其学生身份。`manager` 只能由服务器管理员赋予。

收藏、常用路线和地图偏好暂时继续使用现有本机保存方式。消息中心表是接入预留，建表不代表现有界面已经能收到通知。AI 日志、AutoDL、Qwen 推理和通行热度统计没有现成对应功能，本批不搭建这些服务。

### 3.3 与前端严格对应的状态

| 数据 | 枚举 |
| --- | --- |
| 热点类型 | `activity / crowd / notice / closure / construction` |
| 热点状态 | `active / scheduled / closed` |
| 热度 | `low / medium / high` |
| 失物类型 | `lost / found` |
| 失物状态 | `active / resolved`；`resolved` 在寻物显示已找回，在招领显示已归还 |
| 设施类型 | `food / medical / sports / toilet / water / print / parcel / bike` |
| 设施状态 | `pending / verified / rejected`；附近设施公开列表只显示 `verified` |
| 普通反馈类型 | `crowd / open-status / closure / construction / location-info` |
| 普通反馈状态 | `pending / approved / rejected` |
| 报修类型 | `facility-repair` |
| 报修项目 | `lighting / dispenser / elevator / other` |
| 报修状态 | `pending / processing / completed` |

地点的开放／人流增加 `unknown`，用于没有真实数据的初始状态。前端接入时需补“未知”的展示和校验，不能用现有演示的“开放、拥挤”等值代替真实数据。SQL 导入不保存示例的人流状态、动态或“刚刚更新”这样的展示文字。

### 3.4 执行 02-CampusTwin-seed.sql

新建第二个 SQL query，完整复制附件 `02` 并执行。导入：

- 5 个地区。
- 66 个现有校园地点，含别名、关键词、二维图位置、腾讯地图使用的经纬度。
- 4 条现有校园服务：图书馆、禾香餐厅、校医院、一站式服务大厅。

地点坐标来自现有前端腾讯点位和引导图校准，不是这次现场测量；`geo_verified = false`，需逐步核对位置。服务联系电话及官网沿用项目已有来源，不代表本次新核验；空缺开放时间保持 `null`。线上一站式服务大厅没有可靠实体地点，`location_id` 保持 `null`。

`02` 可重复执行，遇到同 ID 会跳过，不覆盖同学已经在后台修正的信息。初始 `campus_events`、聊天、失物、设施贡献、反馈及通知均为 **0 条真实业务记录**；请自行发布明确标示的测试记录，不导入原文的三食堂、智慧环廊、占道卡车等示例。

---

## 四、核对表、权限与数据

### 4.1 查看导入数量

在 SQL Editor 运行：

```sql
select 'regions' as item, count(*) from public.campus_regions
union all select 'locations', count(*) from public.campus_locations
union all select 'services', count(*) from public.campus_services;
-- 空白库首次导入预期：regions=5，locations=66，services=4。

select id, name, category, region_id, coordinate_system, geo_verified
from public.campus_locations
where id in ('east-gate','library','canteen','hospital','gymnasium')
order by id;
```

### 4.2 用户权限约定

以下是本批 SQL 的权限设计，后续页面接入时按此处理登录提示：

| 操作 | 未登录 | 普通登录账号 | 管理者 |
| --- | --- | --- | --- |
| 读地点、服务、已确认设施 | 可以 | 可以 | 可以 |
| 读校园热点 | 按 `visible_to` | 按 `visible_to` | 按 `visible_to` |
| 读大厅、失物详情和联系方式 | 需登录 | 可以 | 可以 |
| 发布消息、失物、反馈、设施补充 | 不允许 | 可以 | 可以 |
| 编辑／删除失物 | 不允许 | 仅本人 | 仅本人；后台另处理内容管理 |
| 修改昵称、头像 | 不允许 | 仅本人 | 仅本人 |
| 读未审核设施、反馈／报修 | 不允许 | 仅本人 | 可以审核 |
| 修改审核结果 | 不允许 | 不允许 | 可以；审核人从真实会话记录 |
| 修改热点、地点状态、服务信息 | 不允许 | 不允许 | 经服务器鉴权后的后台操作 |
| 消息中心 | 不允许 | 仅本人通知、修改自己的已读时间 | 同样仅本人通知 |
| 更改真实账号角色 | 不允许 | 不允许 | 由项目管理员在 SQL Editor／可信后台管理 |

原指南允许用户更新整行 `profiles`，同时该表放有 `role`，会使角色字段也能被自己修改。本版把角色放到非公开表，并只授予昵称／头像列的更新权；RLS 不能替代列级写权限。[Supabase 列级权限说明](https://supabase.com/docs/guides/database/postgres/column-level-security)。

### 4.3 设置首个真实管理者

先用选定的 Auth 方式创建一个测试账号，从 Authentication → Users 复制其真实 UUID。只在 SQL Editor 中，将以下占位符替换为该 UUID 后执行：

```sql
insert into campus_private.user_roles(user_id, role)
values ('替换成实际Auth用户UUID'::uuid, 'manager')
on conflict (user_id) do update set role = excluded.role;
```

不要把这段提升权限的操作作为普通用户可调用的前端接口。前端从 `campus_my_role()` 获取自己的权限；原来的本机角色选择器不能决定真实权限。

---

## 五、配置两种登录方式

### 5.1 手机号 + 验证码

在 Authentication 的登录提供者配置中启用 Phone，配置可用的短信提供商；号码使用国际格式，例如国内号码在前端发送时转换为 `+86` 加手机号。发送使用 `signInWithOtp`，验证使用 `verifyOtp` 的 `type: 'sms'`。

Supabase 的手机号 OTP 需要配置短信服务商；短信发送费用和国内号码的可达性由服务商及其配置决定，应先用两部测试手机验证。未配置时保留“短信验证码服务尚未接入”，不能显示已发送。[官方 Phone sign-in 指南](https://supabase.com/docs/guides/auth/phone-login)。

### 5.2 学号／校园账号 + 密码

现有界面确实预留这项，但项目没有学校 SSO 地址、学校认证授权或可用的账号接口。**建好 Supabase 不会自动让学校教务密码可登录。** 请同学先确认采用哪一种实现：

- 若是本项目自建校园账号：服务器维护账号标识与 Auth 用户的映射，密码由认证服务处理；需提供注册、绑定、验证和找回密码的流程。
- 若要使用学校现有账号：先拿到授权与正式 SSO／认证协议，再做适配。

不要把学号随意伪造成邮箱，也不要在 `profiles` 等业务表保存校园密码。尚未确认上述方案时，校园账号按钮保持未接入状态；可先通过同学指定的测试 Auth 账号完成跨设备联调，不改变用户已选择的最终两种登录入口。

### 5.3 会话与移动端

同一个真实 Auth 用户的 UUID 用于帖子、消息、反馈的作者字段。退出登录后清除该用户的会话与私有缓存；登录失败保留输入并显示错误，不能切换本机演示角色冒充登录成功。

如果采用 OAuth／SSO 或带跳转的找回密码，要另配置网页 Redirect URL 和 Android 深链接。当前 APK 没有提供这一套回调配置；公网域名、学校 SSO 和短信商均待同学确认。普通手机号 OTP 的核心流程先用实际 session 验证。

---

## 六、Realtime 和文件存储

### 6.1 Realtime

`01` 已把下面 7 张表加入 `supabase_realtime` publication：

`campus_locations, campus_events, hall_messages, lost_found_posts, facility_contributions, place_feedback, notifications`。

可在 Publications 配置中核对；仅设置 `REPLICA IDENTITY` 不等于开启实时推送。前端还需要使用已登录 session 订阅，数据库建表不会自动让当前本机大厅变成多人聊天。[官方 Postgres Changes 指南](https://supabase.com/docs/guides/realtime/postgres-changes)。

联调要求：

- “全部”消息订阅不加地区限制；指定地区时使用实际 `region_id`。
- 新消息用数据库 `id` 去重，发送重试复用同一个 `client_message_id`；首次联网先查历史，再订阅并合并。
- 断线重连后补查遗漏历史，不能只依赖实时回调。
- 聊天软删除通过 `deleted_at` 的 UPDATE 通知移除，不把已删除消息继续显示；历史查询加 `deleted_at is null`。
- 通知按当前 `recipient_id` 查询和订阅，RLS 再限制其只能读取本人记录。
- 热点是否正在发生仍按 `status`、`start_at`、`end_at` 判断；可用定时任务把到期事件关闭，不把过期记录持续展示成实时热点。

### 6.2 存储桶

`01` 同时创建这 3 个桶，不需要提前手动创建：

| 桶 | Public | 用途 | 限制 |
| --- | --- | --- | --- |
| `lost-found-images` | 否 | 失物照片 | JPG／PNG／WebP，5 MiB |
| `report-images` | 否 | 反馈／报修照片（界面后续接入） | JPG／PNG／WebP，5 MiB |
| `avatars` | 是 | 公开头像 | JPG／PNG／WebP，5 MiB |

对象路径统一为 `真实用户UUID/随机文件名.jpg`。桶策略只允许本人上传和删除自己的对象；不开放直接覆盖，更新照片用新文件名。失物照片发布后，登录用户按帖子关联路径读取；报修照片仅作者与真实管理者可读。

私有图片通过登录鉴权读取或临时签名 URL 展示；数据表保存长期的 `image_path`，不保存会过期的签名 URL。公开头像 URL 可以公开读取。[Supabase 存储桶权限说明](https://supabase.com/docs/guides/storage/buckets/fundamentals)。

原指南把 `report-images` 设为公开，本版按反馈资料的访问范围设为私有。前端当前的照片是本机压缩后的 data URL，联调时要改为上传；旧本机记录不会自动上传，需由用户主动确认迁移。

---

## 七、把连接信息交给前端开发者

### 7.1 公开连接配置

在项目 Connect 或 Settings → API Keys 中取 URL 和前端 Publishable Key。按当前官方文档，新项目使用 publishable／secret 密钥；旧项目可能还有 anon／service_role。前端只能使用 publishable（或兼容旧版 anon），后台密钥不能进入网页或 APK。[官方 API Keys 文档](https://supabase.com/docs/guides/getting-started/api-keys)。

以下是**前端接入时拟增加**的变量名，当前应用还没有读取它们；请将真实值单独交给前端开发者，不在这份可转发文档中填秘密：

```dotenv
VITE_SUPABASE_URL=<同学创建项目后的真实HTTPS地址>
VITE_SUPABASE_PUBLISHABLE_KEY=<前端publishable key>
# VITE_TENCENT_MAP_KEY 保留现有配置，不复制进交接包。
```

### 7.2 只放服务器的配置

```dotenv
SUPABASE_URL=<同一项目的真实HTTPS地址>
SUPABASE_SECRET_KEY=<只在可信服务器保管的secret key>
# 若已有旧项目，后台可兼容 SUPABASE_SERVICE_ROLE_KEY；仍只能放服务器。
```

带服务器密钥的操作会绕过 RLS，后台须自行验证真实登录会话、作者所有权和管理员权限；不能信任客户端传来的 `role` 或作者标签。数据库密码、服务器密钥、短信服务商凭据都不需要发到这份文档或提交仓库。

### 7.3 请同学填写这个交接表

| 交接项 | 当前值／待补信息 |
| --- | --- |
| Supabase Name | `campustwin-campus-taigu`（若已用其他名字，填写实际名） |
| Supabase Project URL | 待同学创建后填写：________ |
| 前端 Publishable Key | 待同学单独提供；不是后台 Secret Key |
| 使用的 Region | 待填写：________ |
| schema 01 执行结果 | 待填写：成功／错误原文 |
| seed 02 核对 | 待填写：地区数__、地点数__、服务数__ |
| 校园账号登录方案 | 待确认：项目自建账号映射／学校授权认证接口 |
| Phone provider | 待填写：服务商__、国内测试号码是否送达__；不要填真实凭据 |
| 首个管理者账号 UUID | 待同学创建后单独提供 |
| 独立业务后台地址 | 若使用，填写实际 HTTPS 地址；若全部用 Supabase Functions，说明对应函数名称 |
| Realtime 核对结果 | 待填写：7 表是否在 publication、双设备消息是否同步 |
| 私有图片核对结果 | 待填写：本人上传可用、未授权访问被拒绝 |
| 反馈审核／发布热点接口 | 待提供请求与返回示例；需后台鉴权与事务处理 |
| 通知触发规则 | 待确认：审核结果、聊天回复、失物状态等实际触发方式 |

不要填写不存在的服务器 URL 或接口路径。本批 SQL 是基础结构，审核反馈后更新地点／创建热点，以及生成通知等业务，需要同学实现受控 RPC 或后台事务；当前没有宣称这些操作已经在服务器运行。

---

## 八、前端联调说明

### 8.1 命名与 ID 转换

数据库字段使用 `snake_case`，现有前端使用 `camelCase`，需要一层适配，例如：

| 数据库 | 前端 |
| --- | --- |
| `location_id` | `locationId` |
| `author_id` | `authorId` |
| `region_id` | `regionId` |
| `occurred_at` | `occurredAt` |
| `created_at / updated_at` | `createdAt / updatedAt` |
| `start_at / end_at` | `startAt / endAt` |
| `affected_edge_ids` | `affectedEdgeIds` |
| `visible_to` | `visibleTo` |
| `map_position` | `mapPosition['2d']` |
| `latitude / longitude` | 腾讯 `lat / lng` |
| `image_path` | 请求临时展示地址后传给前端 `image` |

新业务记录用数据库 UUID；不要将 `local-device` 写入 `author_id`，也不要把 `feedback-...`、`lost-found-...` 等本机演示 ID 硬转成 UUID。地点 ID 始终保留字符串，失物 `regionId` 由关联地点的 `region_id` 派生，不由客户端任意填写。

前端创建消息／失物／设施／反馈时，提交列只包含内容及固定的 `client_*_id`，**省略 `author_id`、`status` 和时间等服务端字段**，让默认值和真实 session 决定。SDK 若提交未获授权的列会被拒绝。失物编辑和完成时可以更新自己的 `status`；通知只能改自己的 `read_at`。

### 8.2 对应代码位置

| 现有项目文件 | 联调内容 |
| --- | --- |
| `src/features/mobile/LoginSheet.jsx` | 连接 `onLogin`、`onSendCode`，处理真实会话与失败反馈 |
| `src/features/mobile/MePanel.jsx` | 展示真实用户资料，移除真实模式下的演示角色授权 |
| `src/App.jsx` | 当前提交、编辑、审核集中入口；改为等待服务器成功后再更新界面 |
| `src/data/campusCommunity.js` | 将本机作者／本地存储边界改为真实账号与服务器数据源 |
| `src/data/campusHall.js` | 真实消息列表、作者昵称、时间、地区适配 |
| `src/data/campusFacilities.js` | 合并已确认设施；继续标明到所属建筑的直线估算距离 |
| `src/domain/placeFeedback.js` | 对齐普通反馈与报修两套状态 |
| `src/data/events.js` | 使用真实热点，保留活动日历与到期过滤 |
| `src/data/tencentCampusGeo.js` | 继续使用 GCJ-02；位置仅用于现有地图与距离功能 |

现有实时 GPS 只在用户点定位时获取。本期没有后台位置追踪和人数统计数据采集任务；不需要新建位置轨迹／通行热度表。现有本机道路图不是本次现场核验的本地区真实路网，不把旧 3D 路段直接导入当真实道路；需另取得可靠数据才能做服务端校内封路避让。

### 8.3 最小联调验收

1. 用测试账号 A、B 在两台设备登录，确认 UUID 不同，普通账号不能升为管理者。
2. A 在生活区发消息，B 的“全部”和“生活区”都能收到；“教学区”不显示这条消息。刷新后历史仍存在，断线重连不重复。
3. A 发布关联图书馆的失物与照片，B 能查看；B 修改 A 的失物必须被拒绝；A 标记完成后两台同步。
4. A 补充饮水点，审核前不进入公开设施列表；管理者确认后可见，普通账号不能自己审核。
5. A 提交报修或地点反馈，B 不能读 A 的未审核记录；管理者按对应状态处理，真实模式下审核结果和地图更新由服务器一致提交。
6. 后台给 A 生成通知，B 不能查询或修改 A 的通知；A 标记已读后未读数量更新。
7. 确认失败操作不显示“已发送／发布成功”；离线状态不得冒充多人同步。

服务端确认以上流程，再将真实数据接回现有页面；完成数据库结构、配置 Auth 和完成前端联调是三件分别验收的工作。

## 附：维护导入数据

`02` 从项目现有代码导出。地点变更后，前端开发者可在项目根目录执行：

```powershell
node scripts/export-supabase-seed.mjs
```

导出不会连接云数据库。已有 ID 的后台修改不会被 `02` 覆盖；如果需要变更既有行，应另编写并审核更新 SQL，不靠重复初始化来覆盖数据。
