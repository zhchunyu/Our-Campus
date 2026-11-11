# OurCampus 校园信息、AI 分析与系统推送交接

交接日期：2026-10-08；客户端：1.11 / versionCode 12；Android 包名：`cn.edu.sxau.campustwin`。

1.11 更换队友提供的桌面图标及开屏视频，后端接口不变。本目录交接的是服务端部署材料；当前 APK 链接见项目根 README。

**这是已有 Supabase 项目的增量部署包。先部署数据库和后台函数，再提供个推 AppID 重新打包手机端。共享包没有真实密钥，不是数据库备份。**

1.10 更新了展示地名：谷园显示“禾香餐厅”、崇学楼显示“明德楼”等，数据 ID 和真实窗口关联保持一致。原名与展示名都可匹配。新增共享依赖 `supabase/functions/_shared/campus-presentation.js`，请整合完整共享目录并重新部署 `auv-assistant`、`campus-information-worker`，让 AI 和系统通知名称一致。已有库不需为这次地名显示更新重新执行建表 SQL。

## 队友按这个顺序做

1. 使用项目管理员账号打开现有项目 `hkdblizadnkskxslyjyq`。确认有备份，执行 `database/00-preflight.sql`，核对现有表与角色函数。
2. 在 SQL Editor 执行 `database/09-campus-information-push.sql`。不要在已有数据库重跑基础建库脚本。
3. 合并包内 `supabase/` 的函数目录与配置段，保留部署工程里的其他函数与配置。
4. 按 `01-服务器部署.md` 配置 Edge Functions Secrets，部署 `campus-information-worker`。已有 `auv-assistant` 可继续使用；包内附其源码供统一维护。
5. 在 Vault 保存调度 URL 和独立工作令牌，再执行 `database/10-campus-worker-schedule.sql`。它添加即时异步唤醒及每分钟补偿任务。
6. 按 `02-个推与手机配置.md` 创建个推应用。将公开 AppID 发给客户端负责人；AppKey、MasterSecret 只填服务器。需要稳定离线通知时继续配置厂商通道并补对应 Android SDK。
7. 按 `03-联调与故障处理.md` 完成真实账号、双设备、审核、消息已读、后台通知联调。当前交付未操作线上数据库，也未完成真机推送联调。
8. 按 `05-真实餐厅窗口与评价.md` 执行 11、12 号 SQL，导入谷园一层六个窗口并开通多人评价。餐厅评价不进入公共通知分析队列。

## 软件怎么使用

- 大厅和“我的”都有“校园消息 / 消息中心”。可上报、订阅地点、查看通知和自己的上报。
- 聊天本人消息可以“提交为动态”，用户确认提交后才入分析队列。普通聊天不会自动交给 AI。
- 失物招领、地点反馈可选择上云。本机历史内容不自动上传，失物照片本版仍仅存本机；联系方式字段不送给模型。
- AI 保存摘要及候选关联。施工、封路、停水停电需要管理员确认后向全体注册用户发站内通知，其余按订阅或可能的失物匹配通知。
- 审核通过的事件进入地图、地点详情和校园热点。失物匹配是线索，不能判定物品归属。
- 系统推送需用户同意并开启通知权限。通知点击返回对应消息；服务器再次校验当前账号可见范围。

## 文件目录

| 目录 / 文件 | 用途 |
| --- | --- |
| `database/00-preflight.sql` | 只读前置检查 |
| `database/09-campus-information-push.sql` | 表、RLS、业务 RPC、分析与推送队列 |
| `database/10-campus-worker-schedule.sql` | Vault、异步唤醒、定时补偿 |
| `database/11-restaurant-reviews.sql` | 真实窗口评价、服务器统计、RLS 与 Realtime |
| `database/12-guyuan-real-windows.sql` | 谷园一层真实窗口和菜单导入 |
| `supabase/functions/` | Edge Function 及所有共享源码依赖 |
| `supabase/config.toml` | 两个函数的配置段，需合并 |
| `server-secrets.example.env` | 仅字段模板，值为空 |
| `android/push.example.properties` | 手机端公开 AppID 配置模板 |
| `04-数据与接口说明.md` | 数据流、接口、权限和关联规则 |
| `reference/` | 历史基础结构、种子、餐厅管理 SQL，仅作核对；不要在已有库重复建库 |
| `MANIFEST.sha256` | 包内文件清单与校验值 |

已有账号、邮箱登录和聊天仍沿用原项目配置。此包无需创建新的数据库项目或购买一台服务器；后台运行在现有 Supabase Edge Functions。额度、推送平台账号资格与厂商审核情况由负责人在控制台核对。

## 还需负责人交给队友的信息

| 信息 | 去向 |
| --- | --- |
| Supabase 项目部署权限 | 邀请队友为项目成员，或由现有管理员部署 |
| AI 的 HTTPS 根地址与 AUV_API_KEY | Edge Functions Secrets，单独安全传递 |
| 新生成的 CAMPUS_WORKER_TOKEN | Edge Functions Secrets 与 Vault，各保存同一个值 |
| 个推 AppID、AppKey、MasterSecret | 服务器 Secrets；仅 AppID 发给客户端负责人 |
| 需要审核的管理员账号 UUID | Supabase 内设置 manager 角色 |
| 要覆盖的手机品牌与厂商应用参数 | 个推平台 / 厂商后台，按官方步骤完成 |

不需要用户密码、邮箱验证码、腾讯地图私密服务器凭据、手机 GPS 数据或个人课表来部署这项功能。
