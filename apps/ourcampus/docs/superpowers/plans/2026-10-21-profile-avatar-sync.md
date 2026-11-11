# 大厅头像与成员主页 Implementation Plan

> **For agentic workers:** 使用 subagent-driven-development 在本轮完成独立任务并交叉审查；不要覆盖其他工作区。

**Goal:** 修复发行版头像仅本机保存和成员主页无法互访的问题。

**Architecture:** 沿用 profiles、avatars 与既有 RLS，建立共享头像服务；大厅订阅公开资料并处理迟到响应，独立只读成员页查询公开大厅发言。用户已确认按基础主页方案实施；本机封面、签名、标签不上传公开。

**Tech Stack:** React 19、Supabase JS 2、Vitest 4、Vite 8。

## 基线与约束

- 以 `release/ourcampus-1.16-20261016` 的 `369b93dea534c41aeea65f04eb72ba9bb19486b3` 为基线。
- 使用新建的 `profile-avatar-sync` 工作区；685a 中之前未发布的其他改动不混入。
- avatars bucket 已公开并限制 JPEG/PNG/WebP、5 MB；上传唯一对象，`upsert:false`，不扩大权限。
- `profiles` 可读安全基础字段，仅能更新本人昵称和头像；本次不需要数据库迁移。

## Task 1：共享资料服务与本人头像写入

Files: `src/data/memberProfiles.js`, `src/data/memberProfiles.test.js`, `src/features/account/useCampusAuth.js`。

- [x] 回归覆盖合法对象路径、危险外部URL/路径拒绝、唯一对象上传、云端失败、空头像清除与切号中断。
- [x] `PROFILE_COLUMNS = 'user_id,nickname,avatar_path,updated_at'`，所有返回严格投影。
- [x] `saveProfileAvatar({userId,image,isCurrent})` 先校验压缩数据URL与大小，再上传到本人UUID目录，然后更新本人资料。失败不得显示成功。
- [x] auth 新增 `updateAvatar(image)`，保持账号和请求版本隔离，不改密码重置流程。

## Task 2：大厅完整作者资料同步

Files: `src/data/hallService.js`、测试、`src/features/mobile/useRealtimeHall.js` 及必要纯同步函数。

- [x] 回归覆盖头像hydration、分页后旧消息更新、迟到页面不覆盖新资料、撤回保留与切号隔离。
- [x] 消息统一提供 `authorAvatarPath`、`authorAvatarUrl`、`authorProfileUpdatedAt`。
- [x] 订阅 profiles；每次消息合并应用较新资料，轮询/恢复前台补取全部已加载作者资料。
- [x] 保留原消息幂等发送、时间游标和删除tombstone。

## Task 3：成员只读页

Files: `src/features/mobile/MemberProfilePage.jsx`、独立CSS、`src/data/memberHallMessages.js`、测试。

- [x] 查询作者UUID，限20条未撤回大厅消息；只投影所需字段，不查询报告或私人数据。
- [x] 页面包含loading/error/retry/notfound/empty；资料和发言实时变化以及回前台补查。
- [x] 返回层priority90（覆盖餐厅priority60，低于登录priority100）；焦点圈禁及还原；卸载和账号切换丢弃迟到响应。

## Task 4：发行界面接通

Files: `PersonalHome.jsx`、`MePanel.jsx`、`HallPanel.jsx`、`App.jsx`、共享 `ProfileAvatar.jsx`、对应测试。

- [x] 先用SSR回归证明大厅显示头像图片和可访问作者按钮；本人主页不把旧本机头像当成云端头像。
- [x] 头像加载失败才显示首字；默认头像、更新后图片地址变化均可恢复。
- [x] 装扮保存显式上传新头像，旧本机头像提供同步入口；封面等装扮保留本机，错误不吞掉。
- [x] App按查看者/目标UUID管理成员页，切号关闭；inert和通知覆盖状态一致。
- [x] 本人的“查看公开主页”与他人访问使用同一个页面。

## Task 5：验证、审查和交付

- [x] 已跑发行基线与针对回归RED/GREEN；完整前端320项中309通过、11项既有失败，Node服务端11通过/1既有失败，生产构建通过。详见验证记录。
- [x] 交叉审查接口投影、错误/重试、竞态、返回栈和本机装扮隐私。
- [x] 线上事务权限检查：本人写1、他人写0、已登录可读基础资料；全部回滚。
- [x] 对实际访客查询验证索引计划，仅在确有必要时增量添加查询索引并保留迁移记录。
- [x] 发布记录区分本地代码、GitHub PR/源码、新APK及真实双账号验收；不把构建当作上线。

## 交付边界

源码与预览已验证；原签名APK及真实手机双账号头像验收仍待队友在原打包环境完成。不能把本计划勾选的源码工作当作手机已升级。详见 docs/2026-10-22-头像主页与更新验证记录.md。
