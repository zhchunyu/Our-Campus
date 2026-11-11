# 我的页登录入口实施计划

> **For agentic workers:** Implement this plan inline in the current session, one task at a time, and verify each visible result in the mobile preview.

**Goal:** 在“我的”页增加未登录入口，并提供校园账号密码与手机号验证码两种可交互登录原型。

**Architecture:** `MePanel` 管理登录弹层的开合；独立 `LoginSheet` 管理登录方式、字段校验和未接入服务提示。登录组件保留可选提交回调，但当前不调用网络、不创建假会话、不持久化敏感字段。

**Tech Stack:** React 19、lucide-react、现有 `src/styles.css` 移动端样式、Vite。

---

### Task 1: 登录弹层组件

**Files:**
- Create: `src/features/mobile/LoginSheet.jsx`
- Modify: `src/styles.css`

- [x] 创建 `LoginSheet`，用本地状态区分 `campus` 和 `phone` 两种模式。
- [x] 组件接受可选的 `onLogin` 和 `onSendCode` 回调；当前页面不传入回调时只提示服务未接入。
- [x] 校园账号模式显示账号/学号、密码；手机号模式显示手机号、验证码和“获取验证码”。
- [x] 验证必填项和手机号格式；错误提示贴近对应字段。
- [x] 有效提交及验证码请求只显示“登录服务尚未接入”，不调用 `fetch`、不保存账号或验证码。
- [x] “立即注册”和“找回密码”显示后续接入提示；关闭弹层时清空密码、验证码和提示状态。
- [x] 用 `role="dialog"`、`aria-modal="true"` 和清楚的关闭按钮提供弹层可访问语义。

### Task 2: 我的页登录入口

**Files:**
- Modify: `src/features/mobile/MePanel.jsx`

- [x] 在“我的”页常用地图开关卡片之前加入未登录账号卡片，显示默认头像、未登录状态和“登录 / 注册”按钮。
- [x] 按钮打开 `LoginSheet`；关闭按钮回到“我的”页。
- [x] 登录入口只管理弹层开关；账号认证和用户资料状态不伪造。

### Task 3: 手机弹层样式与验证

**Files:**
- Modify: `src/styles.css`

- [x] 将弹层做成手机底部抽屉，使用安全区内边距、可滚动内容和固定操作按钮；桌面窄预览也保持在屏幕内。
- [x] 确保已有底部导航不会覆盖弹层操作。
- [x] 运行 `npm run build`，并在现有手机预览中检查入口、两种模式、校验提示、未接入提示和关闭行为。

## 自检覆盖

- 登录卡片及入口位置：Task 2。
- 两种登录方式、注册/找回入口与字段校验：Task 1。
- 原型不发网络请求、不存储敏感信息、不伪造登录成功：Task 1 与 Task 2。
- 手机尺寸适配和底部导航避让：Task 3。
- 构建及界面验收：Task 3。
