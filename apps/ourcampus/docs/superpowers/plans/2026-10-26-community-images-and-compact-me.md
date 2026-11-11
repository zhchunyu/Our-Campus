# 社区图片与精简个人页 Implementation Plan

> **For agentic workers:** 使用 subagent-driven-development 分工实施并进行独立复核。

**Goal:** 打通两个发布入口的照片上传与查看，减少个人页重复内容。

**Architecture:** 新增共享图片服务及选择器／图库，服务端复用父记录可见性。个人页只调整页面组织和局部样式。

**Tech Stack:** React 19、Vite 8、Supabase JS、Postgres RLS、Capacitor Android。

---

状态更新：2026-10-30。实施与生产迁移完成于 2026-10-26；已发布客户端仍是 1.18/19，开发版本为 1.19/20。

- [x] SQL：审计 campus_submit_report、hall_messages 约束和 campus_reports RLS；编写可回滚权限验证及 docs/supabase/18-community-images.sql，生产部署 community_post_images。
- [x] 图片共享层：路径、数量、格式、上传失败／重试回归；实现私有上传、300 秒签名、账号隔离与解码／压缩。
- [x] 聊天：更新 hallService、useRealtimeHall、HallPanel 和 memberHallMessages／MemberProfilePage，保留幂等 client_message_id，支持纯图片消息。
- [x] 上报：更新 campusInformation、NotificationCenter、LostFoundPanel、App 提交链路、云端到本机展示映射和我的发布。
- [x] 个人页：更新 PersonalHome、MePanel 与局部 CSS，保留真实功能及普通用户／管理员权限边界。
- [x] 自动化验证：相关 10 文件 69/69 通过；全前端 398 项中 387 通过、11 项既有失败；生产构建通过，仅既有体积警告。
- [x] 浏览器验证：320／390px 无横向溢出、收藏路线焦点恢复；真实文件选择及 JPEG 压缩、移除、换号清空；图库全屏、切图、Esc 和父子层同时卸载恢复 inert；Hall 纯图发送按钮与两个上报入口。
- [x] 生产权限验证：SQL 事务回归实际执行通过，合成 Auth／Storage fixture 0 残留；安全顾问无新增相关项，既有无关警告保留。
- [x] 独立复核并修复末轮 P1/P2；记录服务器已部署、客户端待安装的边界，更新 [交接说明](../../releases/OurCampus-1.19-图片与个人页交接.md) 与 [验证记录](../../reviews/2026-10-30-community-images-and-me.md)。
- [x] 更新 [PR #4](https://github.com/zhchunyu/Our-Campus/pull/4) 的最终范围与验证说明；源码提交 cf8dd57 已推送至 codex/profile-avatars-app-updates。
- [ ] 找回匹配原证书的签名材料，构建并核验 1.19/20 APK；真实账号上传、跨账号权限和手机覆盖安装验收。
- [ ] APK 上传完成后发布 versionCode 20 元数据；保留现有 1.18 对象与记录。

未测试 AI；图片仅用于展示，原文字 AI 不识图。300 秒短签名在取得后可能持续有效至到期，撤回不等于立即吊销既有链接。
