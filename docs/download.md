# Android 下载与使用

## 先选择版本

| 用途 | 入口 | 交付范围 |
| --- | --- | --- |
| Android 手机安装与升级 | [1.19 APK](https://hkdblizadnkskxslyjyq.supabase.co/storage/v1/object/public/app-releases/android/OurCampus-1.19.apk) | 可安装体验包；1.17 / 1.18 可在应用设置检查更新 |
| 最新界面预览与开发 | [1.20「沿途」预览](https://github.com/zhchunyu/Our-Campus/releases/tag/v1.20-along-preview) | 网页包、源码包与对照图，没有新 APK |

发布过程见[版本记录](releases/README.md)，界面与设计说明见[设计资料](design/README.md)。

## OurCampus 1.19 体验版

**[下载 OurCampus-1.19.apk](https://hkdblizadnkskxslyjyq.supabase.co/storage/v1/object/public/app-releases/android/OurCampus-1.19.apk)** · [GitHub 备用下载](https://github.com/zhchunyu/Our-Campus/releases/download/v1.19/OurCampus-1.19.apk) · [发布记录](releases/2026-11-11-1.19-in-app-update.md) · [用户反馈](../README.md#交流与反馈)

| 项目 | 本次安装包 |
| --- | --- |
| 版本 | 1.19 |
| versionCode | 20 |
| 发布类型 | 公开预发布体验版 |
| 最低系统 | Android 7.0 / API 24 |
| targetSdk | 36 |
| 包名 | `cn.edu.sxau.campustwin` |
| 文件大小 | 35,680,287 字节，约 34.03 MiB |
| GitHub 发布 | 2026-11-10 |
| 应用内更新 | 2026-11-11 已发布；2026-11-17 只读复核仍为最新已发布 APK |

本版加入前台通知排队：覆盖页面关闭或回到前台后继续显示待展示的新提醒；聊天新消息默认关闭，可按五个地区主动订阅。通知详情会重新核对来源与当前订阅，源消息撤回或退订后不再保留旧正文。已配置个推公开 AppID，用户同意并允许通知后可登记设备。

保留社区图片发布、精简个人页、每日课表、头像同步和检查更新入口。图片展示不等于 AI 识图；手机后台送达还需实际设备与平台配置验收。

## 安装与升级

1. 已安装 1.17 / 1.18 的用户，在「我的 → 应用设置 → 检查更新」获取 1.19；1.19 不会提示更新到自身。更早版本或无法使用检查入口时，从上方下载链接获取 APK。
2. 直接打开新 APK 覆盖安装，按 Android 提示允许安装来源。保留旧应用，不要先卸载，以免丢失本机课表等资料。
3. 如遇“与现有应用冲突”，保留旧应用，记录版本和错误提示并反馈；不要为绕过签名冲突删除资料。
4. 安装后进入消息中心，按需要开启地区聊天提醒、同意系统通知并允许 Android 通知权限；检查设备登记状态。

1.19 与已发布 1.18 的签名证书一致，包名相同；这为覆盖安装提供了必要条件，仍需真机确认账号和本机资料保留。更早 1.11 使用另一包名 `cn.edu.campus.campustwin`，Android 会将不同包名视为不同应用，不会自动迁移本机资料。

## 文件校验

本次提供的发布包与 GitHub APK 附件记录的字节数、SHA-256 一致。APK SHA-256：

```text
a06af4ce5a8b070f251fd1e87fac68791dda9f28934409f193c8b9cf7b40234f
```

签名证书 SHA-256：

```text
501005b09c563a900b6b2b30729725306bf0af4ccabcddc2d0d64d3b842b43e0
```

```powershell
Get-FileHash .\OurCampus-1.19.apk -Algorithm SHA256
```

独立核验 APK v2 签名与完整内容摘要通过。历史证书主体为 Android Debug；本包为 release 变体，未设置 `debuggable`。本机新生成的 debug 证书不能替代这张既有证书。

## 源码与安装包的关系

本次 APK 对应 [v1.19 / f4fcc2d](https://github.com/zhchunyu/Our-Campus/commit/f4fcc2ddb812a9ae915611cc09b651466ed72620)，该标签下应用路径为 [`04-应用开发/OurCampus`](https://github.com/zhchunyu/Our-Campus/tree/v1.19/04-%E5%BA%94%E7%94%A8%E5%BC%80%E5%8F%91/OurCampus)。发布提交及 [后续交接记录](https://github.com/zhchunyu/Our-Campus/commit/2dcdf1d86b4431545ef87b465a3b35dc6bd4ab6b)保留真实作者。

`main/apps/ourcampus` 已整合近期源码，继续准备 **1.20 / versionCode 21**。其中新增的「沿途」界面、按账号组织 AI 上下文、会话刷新重试及“相关聊天提醒”设置尚未形成新签名 APK，不能通过安装本次 1.19 获得。需要原签名电脑另行构建、安装和验收后发布。

后端接入与模型配置核对见[部署说明](deployment.md)和[开发状态](status.md)。服务端更新、网页预览和 Android 升级分别验证。

尚未完成真机覆盖安装、实际系统通知送达及通知点击流程验收。vivo/iQOO 划掉后台的厂商离线通道仍未启用。

## OurCampus 1.20「沿途」网页预览

2026-11-15 发布的预览围绕「今天、校园、社区、我的」四个入口重整页面，并衔接课程、建筑、路线、餐厅和消息来源。

- [下载网页包](https://github.com/zhchunyu/Our-Campus/releases/download/v1.20-along-preview/OurCampus-1.20-along-web.zip)：解压后在该目录运行 `python -m http.server 8080`，访问 `http://127.0.0.1:8080/?preview=phone`；从站点根路径访问，不能直接双击 `index.html`。
- [下载源码包](https://github.com/zhchunyu/Our-Campus/releases/download/v1.20-along-preview/OurCampus-1.20-along-source.zip)：按[快速开始](quickstart.md)配置已有前端参数并安装依赖。
- [版本附件与 SHA256 清单](https://github.com/zhchunyu/Our-Campus/releases/tag/v1.20-along-preview) · [设计与截图](design/README.md) · [验证与交付边界](releases/2026-11-15-along-system-preview.md)。

预览截图中的课程、聊天和账号使用本地测试数据。网页包、源码包均不含新的 Android APK；本机封面、签名、收藏和路线的保存范围以对应交付记录为准。

## 历史版本

[1.18 GitHub Release](https://github.com/zhchunyu/Our-Campus/releases/tag/v1.18) 与 [2026-11-04 复核](releases/2026-11-04-1.18-release-review.md)继续保留。历史交接附件中的“待上传、待发布”描述对应当时状态；1.19 的后续上线见[2026-11-11 应用内更新记录](releases/2026-11-11-1.19-in-app-update.md)。

## 反馈

使用[微信反馈群](../README.md#交流与反馈)或 [GitHub Issues](https://github.com/zhchunyu/Our-Campus/issues)，附上版本、设备、复现步骤和截图；发布前遮挡账号及联系方式。

[返回项目首页](../README.md)
