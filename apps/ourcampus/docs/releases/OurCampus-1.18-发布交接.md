# OurCampus 1.18 构建核验与发布交接

**2026-10-26状态更新：** Supabase公开下载与版本元数据已上线，匿名下载哈希/签名和版本接口均验证通过；真实手机覆盖安装仍待验收。详见[应用内更新上线记录](2026-10-26-1.18-应用内更新上线.md)。

本次将队友 `d879edb62c2bf96309fb5569a2a4446e8b17629a` 的每日课表修复打入新版 Android APK，沿用原签名。GitHub 提供安装包；应用内版本记录由拥有该 Supabase 项目管理权限的队友发布。实体手机覆盖安装尚未验收，不能将证书一致等同于实机升级通过。

## 安装包身份

| 项目 | 值 |
| --- | --- |
| 版本 | 1.18 / versionCode 19 |
| 包名 | `cn.edu.sxau.campustwin` |
| 文件 | `OurCampus-1.18.apk` |
| 大小 | 35,674,815 字节，低于 50 MiB 桶限额 |
| APK SHA-256 | `58399b61725b0a3a72177d83d9a3379721381034486575135d633162cce46e3b` |
| 证书 SHA-256 | `501005b09c563a900b6b2b30729725306bf0af4ccabcddc2d0d64d3b842b43e0` |
| Android | minSdk 24 / targetSdk 36；非 debuggable；v2 签名验证通过 |
| 发布入口 | [GitHub Release v1.18](https://github.com/zhchunyu/Chun-Yu/releases/tag/v1.18) |
| APK 下载 | [OurCampus-1.18.apk](https://github.com/zhchunyu/Chun-Yu/releases/download/v1.18/OurCampus-1.18.apk) |

当前证书与原电脑保留的 1.17 APK 一致。手机若装的是其他电脑不同签名的包，仍需先核对，不能通过卸载旧应用绕过签名冲突。

## 本次功能

- 每日课表、日期条、当天课程时间线；校准教学周后显示正在上课与下一课。
- 教学周与日期浏览状态按账号、学期保存；前后台恢复与时钟更新不会打断手动浏览。
- 新导入不再猜测开学日期，未校准时不虚构今天或下一课。
- 保留 1.17 的头像、成员主页和应用内检查更新。课表仍在本机，不据此宣称跨设备课表同步。

## 本机验证

- 完整前端测试 370 项：359 通过，11 失败。课表、头像和更新相关 13 文件 175 项均通过，其中课表 5 文件 50 项通过。
- 11 项失败与队友记录的发行基线一致：campusReducer 3、campus 3、mapScene 1、auvCatalog 2、locations 1、routeGraph 1。本次没有更改这些测试或相关数据。
- 原生更新 URL 策略 44 项通过；`npm run android:release` 成功。
- APK ZIP 完整，25 个网页构建文件逐个与本次 `dist` 的 SHA-256 一致；包含新课表界面、检查更新、头像及原生 `CampusUpdatesPlugin`。
- 服务端专用密钥未进入网页 JS；原签名与版本号已核对。未连接 ADB 设备，覆盖安装、账号及数据保留、实体手机 UI、在线 AI 与跨设备联调未在本轮验证。

## 队友完成应用内发布

1. 从上方 GitHub 链接获取 APK，核对字节数及 SHA-256。连接仍安装旧版的手机完成覆盖安装；保留原数据，确认课表、主页及设置中的检查更新可用。
2. 将同一份 APK 上传至 Supabase 项目 `hkdblizadnkskxslyjyq` 的 `app-releases` 桶，对象键为 `android/OurCampus-1.18.apk`。不要将 GitHub 地址直接填入版本表，现有客户端仅接受项目自己的公开 Storage 地址。
3. 匿名重新下载下面的目标地址，再次核对 SHA-256 和大小。目标地址只有上传成功后才有效：

   `https://hkdblizadnkskxslyjyq.supabase.co/storage/v1/object/public/app-releases/android/OurCampus-1.18.apk`

4. 确认 `app_releases` 中 Android / stable / versionCode 19 未被其他安装包占用。上传与验收完成后，再写入 `status='published'`、`published_at=now()`、上述包名 / 版本 / 哈希 / 大小和 Storage 地址。不要覆盖不同的既有发布记录，不调整 RLS。
5. 使用仍运行 1.17 的手机重新启动应用，或在设置里手动检查更新，确认出现 1.18，下载后覆盖安装。1.16 及更早没有该检查入口，需要先手动安装新版；1.18 不会提示更新到自身。

GitHub 下载与应用内发布是两个步骤。只有公开 APK 和已发布的版本记录都可读，旧版才会发现更新。这里不需要向打包电脑传递管理员密钥。

发布说明建议：

> 新增每日课表与当天安排；校准教学周后显示正在上课和下一课。修复周次、日期浏览状态在重开或前后台切换时重置的问题。保留头像、个人主页和应用内检查更新；课表仍按账号保存在本机。
