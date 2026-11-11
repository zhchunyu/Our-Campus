# Android 下载与使用

## OurCampus 1.19 体验版

**[下载 OurCampus-1.19.apk](https://github.com/zhchunyu/Our-Campus/releases/download/v1.19/OurCampus-1.19.apk)** · [GitHub Release](https://github.com/zhchunyu/Our-Campus/releases/tag/v1.19) · [发布复核](releases/2026-11-10-1.19-release-and-ai-source.md) · [用户反馈](../README.md#交流与反馈)

| 项目 | 本次安装包 |
| --- | --- |
| 版本 | 1.19 |
| versionCode | 20 |
| 发布类型 | 公开预发布体验版 |
| 最低系统 | Android 7.0 / API 24 |
| targetSdk | 36 |
| 包名 | `cn.edu.sxau.campustwin` |
| 文件大小 | 35,680,287 字节，约 34.03 MiB |
| GitHub 发布与本页复核 | 2026-11-10 |
| 应用内更新 | 版本元数据交由管理员接手，当前请手动下载 |

本版加入前台通知排队：覆盖页面关闭或回到前台后继续显示待展示的新提醒；聊天新消息默认关闭，可按五个地区主动订阅。通知详情会重新核对来源与当前订阅，源消息撤回或退订后不再保留旧正文。已配置个推公开 AppID，用户同意并允许通知后可登记设备。

保留社区图片发布、精简个人页、每日课表、头像同步和检查更新入口。图片展示不等于 AI 识图；手机后台送达还需实际设备与平台配置验收。

## 安装与升级

1. 已安装旧版本的用户，先从上方 GitHub 地址手动下载 1.19。GitHub 发布不代表旧 APP 已能通过“检查更新”发现 1.19。
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

`main/apps/ourcampus` 已整合近期源码，继续准备 **1.20 / versionCode 21**。其中新增的按账号组织 AI 上下文、会话刷新重试、“相关聊天提醒”设置和语义匹配客户端尚未形成新签名 APK，不能通过安装本次 1.19 获得。需要原签名电脑另行构建、安装和验收后发布。

生产后端的问候、本人通知查询与上下文修复已更新，自动关联数据库规则也已上线；这些是服务端更新。普通对话仍需管理员把 `AUV_PERSONA_MODEL` 改为 `qwen3.7-flash`，`AUV_EXTRACT_MODEL` 保留 V10。服务端上线不能替代新客户端安装或真实模型调用验证。

尚未完成真机覆盖安装、实际系统通知送达及通知点击流程验收。vivo/iQOO 划掉后台的厂商离线通道仍未启用。

## 历史版本

[1.18 GitHub Release](https://github.com/zhchunyu/Our-Campus/releases/tag/v1.18) 与 [2026-11-04 复核](releases/2026-11-04-1.18-release-review.md)继续保留。1.18 的应用内更新记录不代表 1.19 已同步发布；本轮未修改 Supabase 的 APK 对象或 `app_releases` 元数据。

## 反馈

使用[微信反馈群](../README.md#交流与反馈)或 [GitHub Issues](https://github.com/zhchunyu/Our-Campus/issues)，附上版本、设备、复现步骤和截图；发布前遮挡账号及联系方式。

[返回项目首页](../README.md)
