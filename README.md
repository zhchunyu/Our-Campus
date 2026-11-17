<div align="center">

<img src="docs/assets/ourcampus-icon.png" width="88" height="88" alt="OurCampus 图标">

# OurCampus

### 校园变化，与你有关。

连接校园地图、动态信息与个人安排的校园服务应用。

[<img src="https://img.shields.io/badge/Android-1.19_体验版-176B55?style=for-the-badge&amp;logo=android&amp;logoColor=white" alt="下载 Android 1.19 体验版">](https://github.com/zhchunyu/Our-Campus/releases/tag/v1.19)
[<img src="https://img.shields.io/badge/Web-1.20_沿途预览-245B84?style=for-the-badge" alt="查看 1.20 沿途网页与源码预览">](https://github.com/zhchunyu/Our-Campus/releases/tag/v1.20-along-preview)
[<img src="https://img.shields.io/badge/ModelScope-模型下载-6254A4?style=for-the-badge" alt="ModelScope 模型发布页">](https://modelscope.cn/models/chunyuuu/Qwen2.5-7B-Instruct/summary)
[<img src="https://img.shields.io/badge/SwanLab-实验记录-2C689C?style=for-the-badge" alt="SwanLab 实验记录">](https://swanlab.cn/@zhchunyu/OurCampus-AUV-training/v1/44bg6m/overview)

[下载与预览](docs/download.md) · [微信反馈群](#交流与反馈) · [快速开始](docs/quickstart.md) · [文档中心](docs/README.md) · [发布记录](docs/releases/README.md) · [贡献者与署名](CONTRIBUTORS.md)

`React` · `Vite` · `Capacitor` · `Supabase` · `Qwen / QLoRA`

</div>

## 找到地点，也找到下一步

去哪里办事、通知是否仍然有效、某个变化与自己的安排有没有关系——OurCampus 把这些问题放到同一个入口。学生可以从地图进入地点、服务和社区，也可以向 AUV 提问，再从回答跳转到相关地点。

| 探索校园 | 了解变化 | 安排生活 |
| --- | --- | --- |
| 地点搜索、附近设施、服务目录、路线预览与导航入口。 | 主动上报、管理员审核、站内通知、失物线索与校园交流。 | 课表导入、地点收藏、常用路线、餐口菜单与评价。 |

## 三项能力，连接信息与行动

<img src="docs/assets/ourcampus-service-flow.svg" width="100%" alt="OurCampus 服务流程：校园上报由 AI 整理草稿，管理员审核后进入带地点、状态与有效期的动态记录；AUV 结合用户主动选择的情境提供回复，并衔接地图、消息与地点操作。">

**动态信息流。** 以地点和事件为连接点，组织上报、审核、发布与结束。查询依据同时检查事件状态和有效时间；资料不足时保留未知，避免把历史通知直接当作当前事实。

**校园任务适配。** 在开源 Qwen 基座上训练领域适配器，让校园表达对应到系统使用的地点和事件字段。训练、推理与评测资料保留在 [AUV 工程](models/auv/)，最新事实由业务数据提供。

**个人情境关联。** 用户主动选择地点或课表上下文，助手经鉴权网关读取允许访问的资料，再提供相关建议。收藏、路线和订阅共同构成个人服务入口，定位由用户主动触发。

## 下载与预览

| 想做什么 | 当前版本与入口 |
| --- | --- |
| 在 Android 手机上使用 | **1.19 / 20**：[下载 APK](https://hkdblizadnkskxslyjyq.supabase.co/storage/v1/object/public/app-releases/android/OurCampus-1.19.apk) · [GitHub 备用下载](https://github.com/zhchunyu/Our-Campus/releases/tag/v1.19) |
| 查看最新界面与源码 | **1.20「沿途」预览**：[网页包与源码包](https://github.com/zhchunyu/Our-Campus/releases/tag/v1.20-along-preview) · [设计与页面预览](docs/design/README.md) |

Android 体验包要求 **Android 7.0 及以上**，约 **34.03 MiB**。1.19 包含社区图片、每日课表、精简个人页、前台通知排队和地区聊天订阅。应用内更新已于 **2026-11-11** 发布，1.17 / 1.18 用户可在「我的 → 应用设置 → 检查更新」获取。

1.20「沿途」是网页与源码预览，目前没有对应的新 Android 安装包。网页包需解压后通过静态 HTTP 服务打开；安装 1.19 不会获得 1.20 的新界面。完整使用方法、文件校验和手机推送适配范围见[下载说明](docs/download.md)。

## 1.20「沿途」界面预览

主分支围绕「今天、校园、社区、我的」四个入口组织日常任务，连接课程、地点、路线、餐厅与消息来源。

| 今天与课程 | 社区聊天 | 我的 |
| --- | --- | --- |
| <img src="docs/design/2026-11-15-student-daily/final-runtime/home-course-fixture.png" width="220" alt="1.20 沿途网页预览：今天页面，本地测试课程"> | <img src="docs/design/2026-11-15-student-daily/final-runtime/chat-small.png" width="220" alt="1.20 沿途网页预览：小屏聊天页面"> | <img src="docs/design/2026-11-15-student-daily/final-runtime/profile-fixture.png" width="220" alt="1.20 沿途网页预览：我的页面，本地测试账号"> |

以上为 **2026-11-15 的网页预览**；课程、聊天和账号画面使用本地测试数据。设计过程、对照图及验证边界见[设计资料](docs/design/README.md)与[1.20 交付记录](docs/releases/2026-11-15-along-system-preview.md)。

## 源码、模型与实验

| 入口 | 可以找到什么 |
| --- | --- |
| [GitHub 源码](https://github.com/zhchunyu/Our-Campus) | Web 与 Android 工程、业务网关、数据库脚本及项目文档。 |
| [ModelScope 模型发布页](https://modelscope.cn/models/chunyuuu/Qwen2.5-7B-Instruct/summary) | 团队提供的模型下载入口，文件与使用条件以模型页为准。 |
| [SwanLab 实验记录](https://swanlab.cn/@zhchunyu/OurCampus-AUV-training/v1/44bg6m/overview) | 训练曲线与实验展示；已有 V7、V10 曲线由历史训练日志后续导入。 |
| [训练与评测资料](models/auv/) | 数据准备、版本配置、推理部署与验收脚本。 |

ModelScope 当前链接名为 `Qwen2.5-7B-Instruct`；仓库 [V10 配置](models/auv/model-finetune/v10_extract.yaml) 使用 Qwen2.5-14B。两者分别展示，具体权重与实验版本请按对应记录核对。

## 本地运行

需要 Node.js **22.12 或以上**与 npm。

```powershell
git clone https://github.com/zhchunyu/Our-Campus.git
cd Our-Campus/apps/ourcampus
Copy-Item .env.example .env.local
npm ci
npm run dev
```

启动前填写 `.env.local` 中的地图与 Supabase 配置。模型密钥仅放在服务端，完整步骤见[快速开始](docs/quickstart.md)。

| 想了解什么 | 文档 |
| --- | --- |
| 页面、数据库和模型怎样协作 | [系统架构](docs/architecture.md) |
| 怎样构建 Android、配置服务 | [快速开始](docs/quickstart.md) · [部署说明](docs/deployment.md) |
| 当前实现与已验证范围 | [开发状态](docs/status.md) |
| 在哪里找代码与历史资料 | [仓库目录](docs/repository-layout.md) · [资料归档](archive/) |

## 交流与反馈

欢迎加入 **Our Campus 用户反馈群**，交流安装体验与使用建议。

<p align="center">
  <img src="docs/assets/wechat-feedback-2026-11-17.png" width="280" alt="Our Campus 微信用户反馈群二维码，2026 年 11 月 17 日更新，原图注明 11 月 24 日前有效">
</p>

二维码更新于 **2026-11-17**，原图注明 **11 月 24 日前有效**，以微信扫码后的实际提示为准。过期或群满时，请通过 [Issues](https://github.com/zhchunyu/Our-Campus/issues) 联系维护者更新；Issues 也是长期反馈入口。

反馈时附上**应用版本、设备型号、复现步骤和相关截图**。公开反馈请先遮挡账号、联系方式等个人资料。

<details>
<summary>查看归档界面预览</summary>

<p align="center">
  <img src="docs/assets/map-preview.png" width="300" alt="2026 年 10 月 6 日归档版本的 OurCampus 地图界面">
</p>

以上为归档版本地图截图，当前界面请以 1.19 安装包实际显示为准。

</details>

<sub>首页、反馈入口与发布导航整理：2026-11-17。Android 体验包、网页预览及后端部署记录分别维护，详见发布记录与开发状态。</sub>
