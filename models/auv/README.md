# AUV 校园模型

AUV 为 OurCampus 提供校园任务理解、结构化事件提取与问答能力。本目录保存数据、训练适配、推理和评测工作；面向用户的助手入口与业务网关位于 [OurCampus 应用](../../apps/ourcampus/)。

| 入口 | 内容 |
| --- | --- |
| [model-finetune](model-finetune/) | 已有版本的数据准备、训练配置、部署与验收脚本 |
| [03-推理服务](03-推理服务/) | 服务部署与接口交接 |

## 记录与复现

保留模型标识、基座和适配器关系、环境版本、提示词、测试输入、原始回复与评分规则。报告改善时同时保留失败样例和适用范围，区分模型原始输出与业务后处理结果。

`model-finetune/data/make_campus_locations.py` 使用仓库根 `99-临时工作区/_supabase_locations.json` 中的本地 seed 生成地点目录，seed 和去标识黑名单不进入仓库。该脚本保留历史 66 地点数据版本，不应把它当作线上目录的实时导出。

训练服务器中的 `/root/autodl-tmp/…` 路径仍按各版本说明使用。应用配置、后端取数和用户权限见[系统架构](../../docs/architecture.md)与[部署说明](../../docs/deployment.md)。
