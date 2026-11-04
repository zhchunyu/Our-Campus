# Android 下载与使用

## OurCampus 1.18 体验版

**[下载 OurCampus-1.18.apk](https://hkdblizadnkskxslyjyq.supabase.co/storage/v1/object/public/app-releases/android/OurCampus-1.18.apk)** · [GitHub 备用下载](https://github.com/zhchunyu/Our-Campus/releases/download/v1.18/OurCampus-1.18.apk) · [GitHub Release](https://github.com/zhchunyu/Our-Campus/releases/tag/v1.18) · [用户反馈](../README.md#交流与反馈)

| 项目 | 本次安装包 |
| --- | --- |
| 版本 | 1.18 |
| versionCode | 19 |
| 最低系统 | Android 7.0 / API 24 |
| targetSdk | 36 |
| 包名 | `cn.edu.sxau.campustwin` |
| 文件大小 | 35,674,815 字节，约 34.02 MiB |
| GitHub 发布 | 2026-10-25 |
| 应用内更新上线 | 2026-10-26 |
| 本页复核 | 2026-11-04 |

本版新增每日课表、日期条和当天课程时间线；校准教学周后显示正在上课与下一节课，修复重开应用和前后台切换导致周次、日期浏览重置的问题。保留头像同步、成员主页和应用内检查更新。课表仍按账号保存在本机。

## 安装与升级

1. 已安装 1.17 的用户，可以在“我的 → 应用设置 → 检查更新”下载 1.18；自动检查若曾点击“稍后”，会延后 24 小时，手动检查不受影响。
2. 1.16 及更早没有检查入口，请从上方链接下载 APK 并直接覆盖安装。已安装 1.18 不会再次提示更新到自身。
3. 打开下载文件，按 Android 提示允许当前来源安装，并由系统确认。不要通过卸载旧应用绕过签名冲突，以免丢失本机课表等资料。
4. 如遇“与现有应用冲突”，请保留旧应用，记录原版本及错误提示并反馈。不同电脑打包的同名 APK 可能使用不同签名。

已核验本包签名与团队原 1.17 安装包一致。更早 1.11 工程使用另一包名 `cn.edu.campus.campustwin`；Android 将不同包名视为不同应用，本机资料不会自动迁移。

## 文件校验

GitHub 与 Supabase 两个地址的匿名下载结果均为同一文件。APK SHA-256：

```text
58399b61725b0a3a72177d83d9a3379721381034486575135d633162cce46e3b
```

签名证书 SHA-256：

```text
501005b09c563a900b6b2b30729725306bf0af4ccabcddc2d0d64d3b842b43e0
```

Windows PowerShell：

```powershell
Get-FileHash .\OurCampus-1.18.apk -Algorithm SHA256
```

包名、版本、大小、哈希与线上 `app_releases` 中 android / stable / published 记录一致，普通客户端只能读取发布记录。Release 中 2026-10-25 的交接附件保留当时状态，应用内更新已于次日上线，当前状态以本页为准。

## 源码与安装包的关系

1.18 对应发布提交 [962727b](https://github.com/zhchunyu/Our-Campus/commit/962727bda95ca9c5f161c26ecd664620cd5a3ab5)，应用路径为 `04-应用开发/OurCampus`。已清理旧开发笔记的[1.18 源码分支](https://github.com/zhchunyu/Our-Campus/tree/fix/ldgsad-attribution-1.18-20261031/04-应用开发/OurCampus)与该版本的应用代码一致；新增清理提交没有改变 APK。

`main/apps/ourcampus` 仍为历史 1.11 工程，不能直接当作 1.18 源码构建。另有 `codex/profile-avatars-app-updates` 分支准备 1.19/20 的社区图片和个人页改动，尚未生成或发布 1.19 APK，未包含在本次 1.18 中。

本轮未重新编译或替换已发布 APK，不宣称能够逐字节重建。复核包括实际 1.18 源码的相关测试和 Web 构建、两个下载地址的哈希、Manifest 与签名检查、线上更新元数据及读取权限。全量测试仍有地图和地点目录相关的既有失败；真机覆盖安装、账号与本机资料保留仍待验收，未测试在线 AI 服务。

复核详情：[2026-11-04 发布复核](releases/2026-11-04-1.18-release-review.md)。

## 反馈

使用[微信反馈群](../README.md#交流与反馈)或 [GitHub Issues](https://github.com/zhchunyu/Our-Campus/issues)。请提供版本、设备、复现步骤和截图；截图发布前遮挡个人资料。

[返回项目首页](../README.md)
