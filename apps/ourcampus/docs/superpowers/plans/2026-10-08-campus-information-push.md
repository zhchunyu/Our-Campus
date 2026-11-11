# 校园信息与推送实施计划

**Goal:** 完成信息入库、异步 AI 分析与关联、管理员全员通知、订阅消息中心和个推原生接入，生成可安装 APK。

**Architecture:** Supabase 保存报告和持久任务；受服务器密钥保护的 Edge Function 领取任务，调用 AUV、匹配事件与失物、发送个推通知。React 订阅云端变化，Capacitor 原生插件提供通知权限、CID 和点击跳转。

**Tech Stack:** React、Supabase/PostgreSQL、Deno Edge Functions、Capacitor、Android Java、个推 Android SDK。

用户已授权直接实施；本会话内执行，不新增测试或额外确认流程。

## 顺序与文件

- [x] `docs/supabase/09-campus-information-push.sql`：创建报告、订阅、设备和任务；定义 `campus_submit_report`、`campus_review_report`、任务领取与完成 RPC，启用 RLS 和 Realtime。上报 UUID 幂等，任务租约到期重取、最多五次重试；通知通过唯一去重键产生。
- [x] `supabase/functions/campus-information-worker/index.ts`、`_shared/campus-information-worker.js`：验证工作令牌；使用服务端权限领取任务，调用 AUV，保存候选关联，分发站内通知，调用个推 REST V2。没有服务配置时任务保留待重试，记录不含私钥的错误。
- [x] `src/data/campusInformation.js`、`src/features/notifications/`：实现报告提交、审核、订阅、通知已读、实时重连；UI 清楚区分服务器未配置、待分析、待审核、已发布。
- [x] `src/App.jsx`、大厅、个人页、失物与地点反馈：接入消息中心和主动提交入口，将确认的云端事件合入地图；原有本机资料继续保留。
- [x] `android/.../CampusPushPlugin.java`、`CampusPushService.java`：用户同意后初始化个推；通知权限、设备 CID、退出停用、点击通知恢复。`android/push.local.properties` 保存 AppID，不提交真实配置。
- [x] `docs/supabase/10-campus-worker-schedule.sql` 与交接文档：Vault 工作令牌、异步唤醒及定时补偿；提供模型、推送和厂商通道的配置清单。
- [x] 生产构建 `npm run build`，资源同步 `npx cap sync android`；复用 JDK 21、SDK 36 和现有 Gradle，生成 1.8 APK。使用 `apksigner verify` 检查安装包，扫描网页包无服务端私钥；未配置服务不宣称已完成真实推送联调。

## 后续用户追加并已实现

- 谷园一层六个真实窗口与清晰菜单参考，新增 11 号云端评价 SQL、12 号真实窗口导入 SQL。
- 服务器交接 ZIP 使用明确文件清单，包含增量 SQL、全部函数依赖、空值配置模板和部署 / 联调说明。
- 云端迁移、模型端到端和厂商后台推送仍由有部署权限的队友完成，未宣称联调通过。
