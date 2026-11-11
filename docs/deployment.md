# 部署说明

OurCampus 的 Web 与 Android 使用同一应用工程。静态页面托管、Supabase 业务服务和 AUV 模型服务分别配置；源码重组后，应用根目录统一为 `apps/ourcampus`。

## Web 构建与托管

| 设置 | 值 |
| --- | --- |
| 应用根目录 | `apps/ourcampus` |
| Node.js | 22.12 或以上 |
| 依赖安装 | `npm ci` |
| 构建命令 | `npm run build:pages` |
| 发布目录 | 应用根目录下的 `dist`，即仓库中的 `apps/ourcampus/dist` |

`build:pages` 先运行 Vite 构建，再排除当前二维应用没有使用的历史大型三维模型。日常通用构建仍可使用 `npm run build`。

在静态托管服务的构建环境中配置：

```text
VITE_TENCENT_MAP_KEY
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_AUV_GATEWAY_URL
```

前三项用于地图和账号业务。`VITE_AUV_GATEWAY_URL` 为可选项，留空时前端请求当前 Supabase 的 `/functions/v1/auv-assistant`；指定时应填写完整 HTTPS 网关地址。

这些字段在构建时写入前端，修改后需要重新构建。腾讯地图 Key 的域名设置应覆盖实际访问入口。发布到子路径时，应同步核对 Vite 的资源基路径与托管服务的访问路径。

静态托管不运行 Vite 开发中间件或 Node AI 网关。线上 AI 请求使用已配置的云端入口。

## Supabase 配置

当前应用沿用已有 Supabase 项目。2026-11-10 已部署 `auv-assistant` v37、`campus-information-worker` v24，以及 20 号自动关联提醒迁移 `20261110130724`。本轮 GitHub 发布不重新建库，不修改已有账号，也不发布新的 Supabase APK 更新元数据。

| 配置内容 | 工程位置 |
| --- | --- |
| 账号、聊天、窗口等 SQL 与交接说明 | [`apps/ourcampus/docs/supabase`](../apps/ourcampus/docs/supabase/) |
| 当前线上函数发布源 | [`apps/ourcampus/supabase/deployed/2026-11-10/backend`](../apps/ourcampus/supabase/deployed/2026-11-10/backend/) |
| 本地开发参考 | [`apps/ourcampus/supabase/functions`](../apps/ourcampus/supabase/functions/)；不能整体覆盖当前线上函数 |
| 函数鉴权配置 | [`apps/ourcampus/supabase/config.toml`](../apps/ourcampus/supabase/config.toml) |
| 校园信息与推送增量交接 | [后台交接入口](../apps/ourcampus/docs/校园信息推送交接-2026-10-08/README-先看这里.md) |

当前发布源保留六文件 AUV 工程和单文件 worker，应分别使用对应入口及完整依赖。开发参考与线上发布源存在差异，接手时先核对实际版本、表、权限与调度；不要把本地旧参考目录整体部署到线上。生产 RLS、内部 RPC 仅服务端调用、既有函数权限与 20 号回滚回归已核对，真实模型和手机投递仍待验收。

旧交接文档包含基础建库与增量 SQL。已有数据库先执行交接包中的只读前置检查，确认实际状态；不要因为目录变更重跑基础建库、种子或已经执行的增量脚本。

### 账号、数据与邮件

账号与聊天依赖 Supabase Auth、业务表、RLS 和 Realtime 配置。邮箱验证码、重置密码与邮件投递还需要对应 SMTP 和模板设置。客户端角色以服务器读取结果为准。

配置方法见[真实账号与聊天联调](../apps/ourcampus/docs/supabase/真实账号与聊天联调.md)和[邮件数字验证码设置](../apps/ourcampus/docs/supabase/email-templates/邮件数字验证码设置.md)。

### AUV 助手

服务端通过 Supabase Secrets 读取模型配置，密钥只留在后台：

| 名称 | 配置 |
| --- | --- |
| `AUV_BASE_URL` | 百炼北京可使用 `https://dashscope.aliyuncs.com/compatible-mode/v1`。兼容服务的根地址由服务端补上 `/v1`，已有 `/v1` 时不重复追加；最后请求 `/chat/completions`。供应商要求的 `/compatible-mode` 等前缀须保留，不填写完整 `/chat/completions` 请求地址。 |
| `AUV_API_KEY` | 对应地域与业务空间的服务端密钥，不写入前端、Git 或公开文档。 |
| `AUV_EXTRACT_MODEL` | 保留 V10 自定义模型 Code：`qwen2.5-14b-instruct-ee0c448400cb`。 |
| `AUV_PERSONA_MODEL` | 普通聊天改为 `qwen3.7-flash`；截至本轮核对用户尚未修改，仍需保存后验证真实对话。 |
| `AUV_HALL_MODEL` | 可选的公开聊天理解模型；未配置或空白时默认 `qwen3.7-flash`，独立于事件抽取和普通聊天设置。 |

V10 用于事件抽取，通用 flash 用于自然对话和有界公开聊天分类。仅受支持的 flash 别名及日期快照显式关闭思考，其他自定义模型不附加该专用参数。

`auv-assistant` 保持 `verify_jwt = true`，函数内部继续验证用户会话。其发布入口是 `backend/auv-assistant/index.ts`，共享依赖在同一 `backend/_shared` 下；应同步完整六文件工程。模型密钥通过团队既有私密渠道交接，不写入客户端环境变量。

### 校园信息工作函数

`campus-information-worker` 沿用配置中的 `verify_jwt = false`，函数内部验证独立的 `x-campus-worker-token`。其工作令牌、服务端参数与调度配置按[服务器交接材料](../apps/ourcampus/docs/校园信息推送交接-2026-10-08/README-先看这里.md)维护。

当前生产 worker 发布源为 `backend/campus-information-worker/index.ts` 单文件，更新时保持独立令牌鉴权与投递前权限复查。调度使用即时唤醒和每分钟补偿，已核对启用。20 号脚本只为新公开聊天排队，不补处理旧聊天；每条最多一次模型请求，每月自动分析最多 1000 次，个人相关提醒默认关闭。撤回、关闭偏好和退订会重新核对待发记录。

次数限制不等于百炼账户费用上限。没有设备的任务也可能正常处理结束；任务完成或服务商受理不能代替手机实际送达。当前启用设备与回执均为 0。

## 独立 Node 网关

本节保留自托管入口。它沿用本地开发参考，不等同于当前线上六文件工程；如需自托管，应先按已发布后端同步处理器、共享依赖和对应测试，再配置对外入口。不要用旧本地处理器替换当前生产服务。

如使用自有服务器托管 AI 网关，在 `apps/ourcampus` 运行：

```powershell
npm ci
npm run ai:serve
```

网关默认监听 `127.0.0.1:8787`，接口为 `/api/auv-assistant`。部署时使用 HTTPS 反向代理，并在前端 `VITE_AUV_GATEWAY_URL` 中填写外部可访问的完整 API 地址后重新构建。网关读取服务端 `.env.local` 中的模型配置与 Supabase 配置。

## Android 构建与交付

1. 使用[快速开始](quickstart.md)准备 Node.js、JDK 和 Android SDK。
2. 填写应用配置；手机使用的 API 地址需能从设备访问。
3. 在 `apps/ourcampus` 运行 `npm run android:apk`。
4. 从 `android/app/build/outputs/apk/debug/app-debug.apk` 获取 debug 产物并安装验证。

可下载体验包为 1.19 / versionCode 20，GitHub 标签 `v1.19`；当前 main 准备后续 1.20 / 21 源码，没有对应新 APK。保留 applicationId `cn.edu.sxau.campustwin`，沿用原证书并递增版本，原签名由原打包电脑保管。

上面的 debug 产物仅供开发测试，不能默认覆盖团队已装 APK。面向已有用户的更新应在原签名电脑配置既有签名，运行 `npm run android:release`，再核对签名、版本、哈希、真实覆盖安装和资料保留。1.19 签名与已发布 1.18 一致，但真机覆盖安装仍未验收；本机新生成的 debug 证书不能替代既有证书。

系统推送需要个推平台配置、公开 AppID、服务端凭据与手机通知权限；部分品牌的离线通知还需厂商通道。AppID 可交给客户端构建使用，AppKey 与 MasterSecret 留在服务端。完成配置后重新打包并进行真机验证。当前 1.19 已包含正确的个推公开 AppID，vivo 厂商开关仍关闭；iQOO/vivo 划掉后台后的投递需要平台与厂商通道配置和单独验收。

## 部署后的验证

先确认地图资源加载、账号登录和业务请求，再使用真实账号检查 AUV 回复、双设备聊天、校园动态审核与消息送达。具体待验收项统一维护在[开发状态](status.md)。

[返回文档首页](README.md)
