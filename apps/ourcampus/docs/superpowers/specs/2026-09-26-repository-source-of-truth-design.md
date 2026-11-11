# 共享仓库唯一事实源接入设计

> 状态：用户已确认，2026-09-26
> 来源：`zhchunyu/Chun-Yu` 当前 `main`，提交 `7a3e0d7a3fdd2981a666ea0b7cd656041f3983c0`

## 目标

让 CampusTwin 的地图、地点、道路、事件和模型版本全部以共享仓库为事实来源，React 页面只负责展示和交互，不再维护一套与仓库分叉的校园空间数据。

## 已核对的仓库事实

- 2D 底图：`01-产品设计/山河大学_总平面格局图.svg`。
- 3D 网页模型：`02-三维资产/site/assets/campus.glb`，大小 5,972,880 bytes；`web-demo/assets/campus.glb` 为同尺寸副本。
- 坐标基准：1 SVG px = 2.4 m，SVG 主校门原点 `(340, 516)`；Blender X 向东、Y 向北、Z 向上；glTF/Three.js 使用 `[x, y, z] = [Blender x, Blender z, -Blender y]`；校园地面 `Z_TOP = 3.0`。
- 道路来源：`02-三维资产/blender/scripts/build_campus_site.py` 的外环、内环、东西主路和中轴道路；导航脚本当前包含 97 个节点、110 条边。
- 运行逻辑来源：`02-三维资产/site/src/navigation.campus.js`、`events.js`、`preview.js`。
- 仓库模型包含 19 个 `ANCHOR_*` 定位锚点约定，建筑入口和事件地点应使用稳定锚点/节点，而不是页面内临时百分比。

## 设计决定

### 1. 资源与版本

把仓库当前 `site/assets/campus.glb` 复制到 `public/assets/campus.glb`，把仓库当前 SVG 作为 `public/assets/shanhe-campus-plan.svg`，并在 `campusMap.js` 中记录仓库提交、资源路径、模型字节数和坐标基准。

### 2. 统一空间数据

`locations.js` 的地点使用仓库导航脚本的全量地点名和别名；当前页面需要的图书馆、教学楼、食堂、宿舍、体育馆等作为仓库标准地点或别名映射，不再创建自定义坐标。2D 位置由同一套仓库坐标转换得到，3D 位置使用 GLB 坐标，入口通过道路节点连接。

### 3. 统一路线

`roadNetwork.js` 保留仓库的 97 节点/110 边，并由 `routeGraph.js` 只增加地点入口接驳边。A*、路线模式和 UI 保持 React 现有接口；施工/封路事件通过道路边 ID 进入图构建，不直接修改地点坐标。

### 4. 统一事件

本地演示事件继续由 React 管理，但事件类型、地点锚定、地面高度和受影响道路 ID 对齐仓库 `events.js` / `navigation.campus.js`。未来接真实数据时只替换 data source，不改地图组件和路线消费者。

### 5. 场景与界面

3D 保持主视角，2D 是同一状态的总览场景。两者共享地点选择、路线、热点、当前位置和筛选状态；页面不嵌入仓库独立 HTML，而是复用其数据和资源，避免形成两套状态系统。

## 验收标准

- 本地 GLB 的字节数与仓库 `site/assets/campus.glb` 一致。
- 页面显示的地图来源、版本和坐标基准与仓库一致。
- 主要地点标签在 2D/3D 使用同一地点 ID 和仓库坐标。
- 从主校门到图书馆、教学区、食堂的路线只使用仓库道路节点和接驳边。
- 施工边被阻断后，路线会重新规划或给出不可达原因。
- 刷新后管理员状态仍保留，但结构坐标始终来自当前仓库适配数据。
- `npm test -- --run` 和 `npm run build` 通过。
