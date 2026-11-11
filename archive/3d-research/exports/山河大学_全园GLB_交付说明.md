# 导出包交付说明：山河大学 · 全园模型

> 对应 V2 路线 **R7 = 整合 → 网页预览 → 返工 → 导出 GLB**。
> 本文按 `export-pipeline` skill 的「Delivery Documentation Template」写。

**格式**：GLB（binary glTF 2.0，单文件）
**生成日期**：2026-09-21
**生成器**：Khronos glTF Blender I/O v4.5.51（Blender 4.5.9 LTS）
**来源工程**：`02-三维资产/blender/projects/山河大学_R6_滨水基座.blend`（由 `configs/r6.json` 的
`build_extra` 链完整重建，非手工拼装）

---

## 一、文件清单

| 文件 | 大小 | 说明 |
| --- | --- | --- |
| `02-三维资产/exports/山河大学_全园_R6.glb` | 4.62 MB | **交付物本体** |
| `02-三维资产/web-demo/assets/campus.glb` | 4.62 MB | 同一份文件的副本，供网页预览 |

★ **复制方向永远是 `exports/` → `web-demo/assets/`**（`export_glb.py` 第 5 步自动完成）。
反向覆盖会让"交付物"和"网页用的"两份文件各自演化、走散。
网页服务以 `web-demo/` 为根，`../exports/` 在根之外会被 `http.server` 拒掉，所以必须有这份副本。

## 二、模型统计

| 项 | 值 |
| --- | --- |
| 三角面 | **1,118,087**（源场景 1,660,979，抽稀后） |
| 网格数 | 375 |
| 节点数 | 395 |
| 材质数 | **42** |
| 贴图 | **0**（纯常量 PBR，见 §五） |
| 动画 / 骨骼 | 无 |
| 碰撞体 | 无（本项目不需要） |

## 三、坐标与尺度约定

| 项 | 值 |
| --- | --- |
| 尺度 | **1 Blender unit = 1 m**，导出时已应用变换（`export_apply=True`） |
| 朝向 | Blender 是 **Z-up / +Y 北**；导出用 `export_yup=True` 转成 glTF 惯例 |
| 换算 | Blender `(x, y, z)` → glTF `(x, z, −y)` |
| glTF 轴向 | **+X = 东 ／ +Y = 上 ／ −Z = 北**（即 forward = −Z，符合 glTF 惯例） |
| 包围盒 | X [−4000, 4000] ／ Y [−33.8, 551.7] ／ Z [−4200, 3800]（单位 m） |
| 原点 | 场地原点在**主校门**（Blender `(0, 33.6, 3.0)` 附近）；X=0 为中轴 |

⚠ **包围盒 ±4000 m 是被"对岸远山"与"水面"撑开的**，校园本体只占中央约 ±816 m × 1238 m。
做相机自适应取景（`fitToBox`）时**不要直接用整体包围盒**，否则相机会拉到很远、校园缩成一小团。
预览页的 7 个预设机位就是这么定出来的（数值直接取自 `configs/rN.json` 的真实机位）。

## 四、导入注意

**Draco 压缩是必需的。**
`extensionsRequired: ["KHR_draco_mesh_compression"]` —— 不装 Draco 解码器的运行时会**直接拒绝加载**。
- three.js：`GLTFLoader.setDRACOLoader(new DRACOLoader().setDecoderPath(...))`
  本项目把解码器放在 `web-demo/vendor/three/examples/jsm/libs/draco/gltf/`
- Blender 重新导入：4.x 自带 Draco 支持，无需额外操作
- 其它引擎：Unity 需 glTFast / UnityGLTF；Godot 4 原生支持

**材质是"压平"过的常量 PBR。**
源工程的 53 个材质里有 32 个的 `Base Color` 被 `Noise → ColorRamp` 程序化连线驱动，
而 **glTF 没有程序化节点** ⇒ 不压平就只能导成 `baseColorFactor = [1,1,1]`（整个园区变白模）。
`export_glb.py` 的 `flatten_materials()` 取 ColorRamp 各端点的均值写成常量色。
**代价**：模型表面失去了那点噪声质感。要质感就得烘焙贴图 —— 见 §五。

**玻璃是"半透明近似"。**
源工程用 `transmission` 表达超白玻璃，glTF 的 `KHR_materials_transmission` 不是所有运行时都支持，
预览页的做法是把 `transmission` 转成 `transparent + opacity 0.34 + depthWrite=false`。

## 五、已知限制

| 限制 | 原因 | 若要解决 |
| --- | --- | --- |
| 0 张贴图，无程序化质感 | glTF 无程序化节点，只能导常量色 | 在 Blender 里烘焙 BaseColor / Roughness / Normal 贴图再导 |
| 无 LOD | 未做 | 按到相机距离做 2~3 级 |
| 无动画 | 本项目为静态园区 | — |
| 远山 / 水面把包围盒撑到 ±4000 | 它们是超尺度的环境对象 | 单独分层导出，或给它们一个独立节点组 |
| 玻璃在部分运行时可能不透 | `KHR_materials_transmission` 支持度不一 | 用 `KHR_materials_ior` + 混合模式，或烘焙 |

## 六、验证结果

**PASS — 2026-09-21**

| 检查项 | 方法 | 结果 |
| --- | --- | --- |
| 文件结构 | 读 GLB 头：magic / 版本 / 声明长度 vs 实际长度 | `glTF` / v2 / 4,848,300 = 4,848,300 ✓ |
| 必需扩展 | 读 `extensionsRequired` | `KHR_draco_mesh_compression` ✓ |
| 三角面 | 累加各 primitive 的 index accessor | 1,118,087 ✓ |
| 材质色 | 逐材质检查 `baseColorFactor` 是否为 `[1,1,1]` | **0 个纯白** ✓ |
| 残留渲染辅助物 | 检查是否还有 `M_空气*` / `Haze` | **无** ✓ |
| 尺度 | 量已知尺寸（场地 X 幅 ±816 m） | ✓ |
| 朝向 | 与 glTF 惯例对比（+Y 上 / −Z 前） | ✓ |
| 目标引擎导入 | three.js 0.186 实际加载并渲染 | **778 ms 就绪，64 FPS** ✓ |

网页端实测统计：`{"tri":1118087,"mesh":375,"mat":42,"calls":754,"ready":true}`

## 七、怎么打开

```bash
cd 02-三维资产/web-demo
python -m http.server 8123
# 浏览器打开 http://localhost:8123/preview.html
```

预览页 `preview.html` 是**独立于产品 Demo** 的模型查看器（不依赖 `index.html` / `src/app.js`
那套实时态势地图）。左侧面板给模型与运行统计，底部 7 个相机预设按钮。

URL 参数：

| 参数 | 作用 |
| --- | --- |
| `preset=<名字>` | 套用相机预设（`鸟瞰·全园` / `环廊·鸟瞰` / `五区·鸟瞰` / `山门·透视` / `中轴·书院` / `中轴·图书馆` / `滨水·近景`） |
| `cam=x,y,z` | 直接指定相机位置（给了这个就不再套默认预设） |
| `tgt=x,y,z` | 指定视点 |
| `shadow=0` | 关阴影（排查性能用） |
| `trans=1` | 保留 `transmission` 原样（默认转成普通半透明） |

例：`http://localhost:8123/preview.html?cam=-128,5,-856&tgt=96,3,-849`

## 八、怎么重新生成

```bash
cd 02-三维资产/blender
BR_CFG_FILE="<绝对路径>/configs/r6.json" \
  "C:/Users/31967/Blender/blender-4.5.9-windows-x64/blender.exe" \
  --background --factory-startup --python scripts/run_campus.py
```

`run_campus.py` 的顺序是 **建模 → 存盘 → 渲染 → 导出**。导出**必须排最后**：
`export_glb.py` 干的两件事（材质压平、抽稀）都是**破坏性**的 ——
排在渲染之后，成图用的仍是原始程序化材质；排在存盘之后，`.blend` 永远保持干净的构建态。

★ 要改导出参数（抽稀比、是否 Draco、是否剔除渲染辅助物）改
`make_render_configs.py` 里的 `EXPORT` 常量，**不要**改 `configs/r6.json`
（那是生成产物，下次重生成会被覆盖）。
