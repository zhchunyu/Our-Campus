# Models —— CAD 模型目录

> 由 `cad` skill 维护。新增或改名模型后请同步更新此表。

| Script | Output | Purpose |
| --- | --- | --- |
| _（待补充）_ | | |

## 构建方式

在 `02-三维资产/cad/` 目录下运行：

```bash
python src/<model>.py
```

未改动的模型为 no-op。装配体运行根模型即可联动构建子模型。

## 目录说明

- `src/` —— 模型脚本，一个入口一个模型，脚本名与产物名保持一致
- `src/lib/` —— 共享参数化工厂与辅助函数
- `STEP/` `DXF/` `STL/` `GLB/` `3MF/` —— 各格式产物（`imported/` 放外部导入源文件）
- `checks/` —— 可复用的几何校验脚本
- `tmp/` —— 临时探索脚本与快照，不纳入版本管理

## 依赖

```bash
pip install -r ~/.workbuddy-ai/skills/cad/requirements.txt
python -m playwright install chromium
```
