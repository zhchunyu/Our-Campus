# OurCampus 文档

OurCampus 将校园地点、同学社区与 AUV 助手放在同一个入口。本目录介绍如何运行应用、理解实现，以及参与部署与协作。

| 文档 | 内容 |
| --- | --- |
| [下载与使用](download.md) | Android 1.19、1.20「沿途」网页预览、安装与文件校验。 |
| [发布记录](releases/README.md) | 按日期查看 APK、应用内更新、网页预览及验收记录。 |
| [设计与页面预览](design/README.md) | 最新「沿途」方向、代表页面、设计过程与交付边界。 |
| [快速开始](quickstart.md) | 获取源码、填写配置、启动 Web 与构建 Android。 |
| [系统架构](architecture.md) | 前端模块、Supabase 服务、AUV 网关与校园信息流程。 |
| [部署说明](deployment.md) | Web 构建设置、后台配置和 Android 交付。 |
| [开发状态](status.md) | 已有实现、后台接入记录、验收事项与后续工作。 |
| [仓库目录](repository-layout.md) | 当前目录职责、旧路径迁移和归档入口。 |
| [铭贤旧址全景漫游](../mingxian-tour/README.md) | 思政「一课一品」独立全景应用：17 场景、8 段配音、可打包独立 APK。 |

## 当前交付

- **手机使用：1.19 / 20。** 应用内更新于 2026-11-11 上线；1.17 / 1.18 可在设置检查更新，详见[上线记录](releases/2026-11-11-1.19-in-app-update.md)。
- **最新界面：1.20 / 21「沿途」预览。** 2026-11-15 提供网页包与源码包，没有新的 Android APK，详见[预览交付](releases/2026-11-15-along-system-preview.md)。
- **后端与真实验收：** 部署快照、模拟测试与真机结果分别记录，见[开发状态](status.md)；历史记录中的“待发布”以文档日期理解。

## 模型与社区

- [ModelScope 模型发布页](https://modelscope.cn/models/chunyuuu/Qwen2.5-7B-Instruct/summary)。
- [SwanLab 实验记录](https://swanlab.cn/@zhchunyu/OurCampus-AUV-training/v1/44bg6m/overview)：已有 V7、V10 曲线为历史日志后续导入。
- [微信反馈群与 Issues](../README.md#交流与反馈)。

模型链接名为 7B，仓库 V10 配置为 14B；请分别按对应记录核对，详见 [AUV 工程](../models/auv/)。

## 开发入口

- [应用工程](../apps/ourcampus/)：React 页面、Capacitor Android、服务端适配和业务脚本。
- [应用说明](../apps/ourcampus/README.md)：工程内的运行与维护说明。
- [团队协作](../apps/ourcampus/docs/团队协作.md)：模块负责范围、配置交接与上线检查。
- [铭贤旧址全景漫游](../mingxian-tour/)：独立纯前端全景应用，含 17 场景素材、8 段配音与 Android 打包工程，与 OurCampus 主工程互不依赖。
- [AUV 工程](../models/auv/)：模型、训练、推理与评测资料。

## 专题资料

| 主题 | 入口 |
| --- | --- |
| AUV 请求、鉴权与模型服务 | [AUV 接入说明](../apps/ourcampus/docs/auv-integration-2026-10-05.md) |
| 真实账号与大厅聊天 | [账号与聊天联调](../apps/ourcampus/docs/supabase/真实账号与聊天联调.md) |
| 邮件数字验证码 | [邮件模板与设置](../apps/ourcampus/docs/supabase/email-templates/邮件数字验证码设置.md) |
| 餐厅窗口维护 | [管理员配置](../apps/ourcampus/docs/supabase/餐厅窗口管理-给队友.md) |
| 校园信息、审核、通知与真实评价 | [后台交接入口](../apps/ourcampus/docs/校园信息推送交接-2026-10-08/README-先看这里.md) |
| XLS 课表导入 | [课表说明](../apps/ourcampus/docs/timetable-import-2026-10-05.md) |
| 每日课表与教学周校准 | [每日课表说明](../apps/ourcampus/docs/timetable-daily-2026-10-25.md) |
| 团队贡献与提交作者 | [贡献者](../CONTRIBUTORS.md) · [署名核验](contributor-attribution.md) |
| 历史方案与归档文件 | [资料归档](../archive/) |

历史交接文档保留原始日期，反映当时的操作记录。当前功能范围、已部署状态与待验收事项统一见[开发状态](status.md)。

[返回项目首页](../README.md)
