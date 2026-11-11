# 快速开始

OurCampus 的主应用位于 `apps/ourcampus`。同一套 React 页面用于 Web，并通过 Capacitor 构建 Android 安装包。

## 准备环境

运行 Web 需要 Node.js **22.12 或以上**版本和 npm。Android 构建另外需要 JDK 21、Android SDK API 36 和当前工程使用的 Build Tools 35.0.0。

已有开发环境时优先复用，依赖版本以工程的 `package-lock.json` 为准。

## 获取源码与配置

```powershell
git clone https://github.com/zhchunyu/Chun-Yu.git
cd Chun-Yu/apps/ourcampus
Copy-Item .env.example .env.local
npm ci
```

在 `.env.local` 中填写团队提供的开发配置：

| 字段 | 用途 |
| --- | --- |
| `VITE_TENCENT_MAP_KEY` | 腾讯地图 Web Key，供地图加载使用。 |
| `VITE_SUPABASE_URL` | Supabase 项目根地址，不带 `/rest/v1/`。 |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | 前端 Publishable key，用于账号和业务请求。 |
| `AUV_BASE_URL` | 仅本地开发网关或 Node 网关读取的模型服务根地址。 |
| `AUV_API_KEY` | 仅服务端读取的模型密钥。 |
| `VITE_AUV_GATEWAY_URL` | 可选，自行托管的完整 HTTPS AI 网关地址。生产构建留空时使用 Supabase `auv-assistant`。 |

所有 `VITE_` 字段会进入网页和 APK。模型密钥和 Supabase 管理密钥不能放进这些字段；真实 `.env.local` 不提交仓库。

## 启动 Web

```powershell
npm run dev
```

打开终端显示的地址。本地 Vite 开发服务将 AI 请求转发到 `/api/auv-assistant`，由服务端读取 `AUV_BASE_URL` 和 `AUV_API_KEY`；修改配置后重新启动。

手机浏览器预览时，让手机与电脑连接同一网络，并运行：

```powershell
npm run dev -- --host 0.0.0.0
```

手机访问电脑的局域网 IP 与终端显示的端口。手机中的 `127.0.0.1` 指手机自身；定位等能力还受浏览器安全上下文和权限设置影响。

## 常用命令

以下命令均在 `apps/ourcampus` 中运行。

| 命令 | 用途 |
| --- | --- |
| `npm test` | 运行 Vitest 测试。 |
| `node --test server/auv.test.mjs` | 检查 AUV 网关的模拟鉴权、请求与错误处理。 |
| `npm run build` | 构建 Web，输出到 `dist/`。 |
| `npm run build:pages` | 构建 Web 并排除当前界面不使用的历史大型三维模型。 |
| `npm run ai:serve` | 运行独立 Node AI 网关，默认监听本机 8787 端口。 |
| `npm run android:sync` | 构建 Web 并同步到 Capacitor Android 工程。 |
| `npm run android:apk` | 同步工程并生成 debug APK，使用 Windows Gradle 脚本。 |
| `npm run android:share` | 通过本机网络分享已生成的 APK。 |

模拟测试用于检查代码逻辑；真实账号、模型调用和跨设备流程见[开发状态](status.md)中的验收清单。

## Android 安装与构建

最新团队体验包：[OurCampus 1.17](https://github.com/zhchunyu/Chun-Yu/releases/tag/v1.17)，安装要求、校验值与包名差异见[下载说明](download.md)。

仓库当前 Android 源码配置仍为 **1.11 / versionCode 12**；以下构建命令用于当前源码，不代表能重建另行提供的 1.17 APK。[1.11 历史安装包](../apps/ourcampus/docs/apk/OurCampus-1.11-队友图标与开屏.apk)保留归档。

自行构建时设置 `JAVA_HOME`，并在本机 `android/local.properties` 中配置 `sdk.dir`。该文件不提交仓库。然后运行：

```powershell
npm run android:apk
```

产物位于 `apps/ourcampus/android/app/build/outputs/apk/debug/app-debug.apk`。实际服务地址需能从手机访问；更换部署地址后重新构建。正式签名与分发配置由负责人保管。

## 继续阅读

- [系统架构](architecture.md)：了解页面、数据和服务之间的关系。
- [部署说明](deployment.md)：配置静态托管、Supabase 与模型网关。
- [开发状态](status.md)：查看当前接入范围与待验收工作。
- [仓库目录](repository-layout.md)：查找从旧目录迁移的工程与文档。

[返回文档首页](README.md)
