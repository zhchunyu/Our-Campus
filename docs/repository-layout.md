# 仓库目录与迁移说明

仓库以 OurCampus 产品为入口。日常开发从 `apps/ourcampus` 开始，模型研发在 `models/auv`，当前使用文档在 `docs`；历史资料保留在 `archive`。

```text
.
├── .github/             问题与建议模板
├── apps/
│   └── ourcampus/        Web、Android、Node 网关和 Supabase 函数
├── models/
│   └── auv/              数据、训练、推理、评测与历史配置
├── docs/                快速开始、架构、部署、开发状态
├── archive/             历史方案、赛事材料和后续研究资产
├── CONTRIBUTING.md      开发协作方法
└── README.md            产品首页
```

## 旧目录对照

| 旧位置 | 新位置 |
| --- | --- |
| `04-应用开发/OurCampus` | `apps/ourcampus` |
| `03-算法工程` | `models/auv` |
| `00-赛事与规范` | `archive/competition-rules` |
| `01-产品设计` | `archive/product-design` |
| `02-三维资产` | `archive/3d-research` |
| `02-技术方案` | `archive/technical-plans` |
| `04-应用开发` 中其余资料 | `archive/application-plans` |
| `05-测试与质量` | `archive/testing` |
| `06-竞赛材料` | `archive/submissions` |
| `07-项目文档` | `archive/project-notes` |
| `08-交付与归档` | `archive/deliverables` |
| `.workbuddy-ai` | `archive/workspace-tools` |

这是一次路径整理。应用内部目录保持整体迁移，已有资源、历史文件和安装包继续保留；当前文档和工作目录引用随之更新。归档稿件保留原始表述，其中的历史绝对路径、旧版本结论和外部发布链接需要结合稿件日期理解；查找文件时按上表换算。

模型地点目录生成脚本的仓库根路径已增加一层上溯，保持私有 seed 在仓库根 `99-临时工作区` 的约定。训练服务器 `/root/autodl-tmp/…` 等路径与仓库目录无关，保留原配置。

## 更新开发环境

完成未提交改动的保存与同步后，从 `apps/ourcampus` 重新执行安装和构建。检查 IDE 工作目录、终端快捷入口、任务脚本及私下交接的本机路径；新的公开配置字段仍见应用 `.env.example`。本机私密配置不由仓库迁移提交。

如果外部托管平台仍把应用根目录设为 `04-应用开发/OurCampus`，需要改为 `apps/ourcampus`，发布目录为该应用下的 `dist`。本仓库没有保存这些平台控制台的设置，参考[部署说明](deployment.md)核对既有项目。

Supabase 已部署函数和数据库按原项目继续运行；目录整理不要求重建数据库或迁移线上用户数据。Android applicationId 与版本文件随源码整体保留。

## 归档与后续研究

三维浏览和室内导航列为后续研究。历史三维资产保存在 `archive/3d-research`，不代表当前应用默认提供三维入口。赛事材料在 `archive/submissions`，与面向用户的产品介绍分开维护。

[返回文档首页](README.md)
