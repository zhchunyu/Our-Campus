# 校园地点反馈与管理员审核 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在校园地图地点详情中提供本机反馈提交与管理员模拟审核，并让已审核状态、地点说明和封路/施工动态接入现有页面与路线规划。

**Architecture:** 反馈记录进入应用 reducer 的本机状态并沿用现有 `localStorage` 持久化。地点状态纠正复用现有地点状态更新路径；关闭和施工通过现有热点事件模型发布，路段仍使用共享路网 ID。用户表单、管理员审核列表和 reducer 分别负责输入、管理和状态变更，不新增服务端或依赖。

**Tech Stack:** React、Vite、现有 `useReducer` 应用状态、`localStorage`、Lucide 图标、现有校园热点和路线图。

---

## 文件与职责

| 文件 | 职责 |
|---|---|
| `src/domain/placeFeedback.js` | 反馈类型、状态、标签、字段校验和本机记录构造。 |
| `src/data/appStorage.js` | 持久化 schema 升级、旧数据迁移和反馈记录验证。 |
| `src/data/appStorage.test.js` | 只同步现有 schema 版本断言，不增加测试用例。 |
| `src/app/campusReducer.js` | 提交、审核、状态更新、事件创建、路线重算和演示数据重置。 |
| `src/features/locations/PlaceFeedbackSheet.jsx` | 手机适配的反馈表单弹层。 |
| `src/features/locations/LocationDetail.jsx` | 地点详情中的反馈入口与已审核信息呈现。 |
| `src/features/mobile/FeedbackReviewPanel.jsx` | 管理者待审核、已通过、已驳回列表及审核表单。 |
| `src/features/mobile/MePanel.jsx` | 管理者页面入口和审核回调接线。 |
| `src/features/map/TencentCampusMap.jsx` | 在可识别的校内 POI 详情卡中打开相同反馈弹层。 |
| `src/features/map/MapWorkspace.jsx` | 将 POI 卡反馈动作传给应用。 |
| `src/features/routes/RouteDock.jsx` | 封路时停用不感知校园封闭路段的腾讯外部路线链接。 |
| `src/App.jsx` | 将状态与回调接入地图详情和“我的”页。 |
| `src/styles.css` | 弹层、审核卡片和窄屏样式。 |

本功能属于一个连续的提交—审核—生效流程，不拆成独立子项目。实现时沿用当前工作区的组件组织；不要清理或重排与本功能无关的既有修改。

## Task 1: 定义反馈数据并扩展本机存储

**Files:**
- Create: `src/domain/placeFeedback.js`
- Modify: `src/data/appStorage.js`
- Modify: `src/data/appStorage.test.js`
- Modify: `src/app/campusReducer.js`

- [x] **Step 1: 定义五种反馈类型和状态值**

在 `src/domain/placeFeedback.js` 导出以下受限值，避免表单、存储和 reducer 各自拼写字符串：

```js
export const PLACE_FEEDBACK_TYPES = Object.freeze({
  CROWD: 'crowd',
  OPEN_STATUS: 'open-status',
  CLOSURE: 'closure',
  CONSTRUCTION: 'construction',
  LOCATION_INFO: 'location-info',
})

export const PLACE_FEEDBACK_STATUSES = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
})
```

同一模块提供对应中文标签、说明与建议描述字数限制 240、驳回说明字数限制 120，以及基于类型检查说明、状态值、建议描述、结束时间的纯校验函数。人流值只接受 `low/normal/busy`，开放值只接受 `open/limited/closed`。临时关闭和施工要求有效的未来结束时间；地点信息纠错要求非空建议描述。

- [x] **Step 2: 明确保存记录的字段**

由 `createPlaceFeedback(input, now)` 生成不可变的新记录：

```js
{
  id: `feedback-${now.getTime()}-${randomSuffix}`,
  locationId: input.locationId,
  type: input.type,
  description: input.description.trim(),
  suggestedDescription: input.suggestedDescription?.trim() ?? '',
  crowdStatus: input.crowdStatus ?? null,
  openStatus: input.openStatus ?? null,
  reportedEndAt: input.reportedEndAt ?? null,
  status: 'pending',
  submittedAt: now.toISOString(),
  reporterLabel: '本机访客',
  reviewedAt: null,
  reviewedBy: null,
  reviewNote: '',
  approvedEventId: null,
}
```

ID 后缀使用现有 `crypto.randomUUID()` 能力；无法使用时回退到时间戳与随机字符串组合。构造函数拒绝无地点 ID 或非法类型的数据。

- [x] **Step 3: 将本机存储 schema 升到版本 2**

在 `src/data/appStorage.js` 将 `CURRENT_SCHEMA_VERSION` 改为 `2`。从版本 0 或 1 迁移时设置 `placeFeedback: []`；版本 2 要求 `placeFeedback` 为数组，且每条记录具有已定义的状态、类型、字符串地点 ID 和有效提交时间。将 `feedback-review` 加入管理员历史合法类型集合。已有 schema 1 的地点、事件、设置和管理员历史字段必须原样保留。

将 `description` 作为可选字符串加入保存地点验证，并把它加入 reducer 的 `PERSISTED_LOCATION_FIELDS`，使管理员确认的信息纠错可以随地点覆盖值保存。`savePersistedState` 将 `state.placeFeedback` 写入现有同一份 localStorage payload，不新增存储键。

在 `src/data/appStorage.test.js` 只把现有 schema 断言从版本 1 更新为 2，并把“不支持的新版本”样例改为 3；不增加测试用例，也不运行自动化测试。

- [x] **Step 4: 初始化 reducer 状态并定义重置行为**

在 `createInitialState` 从迁移后的状态读取 `persisted.placeFeedback ?? []`，并在 `RESET_DEMO_DATA` 中将 `placeFeedback` 清空。保持已有 locations、events、role 和 settings 的现有初始化规则。

- [x] **Step 5: 对照旧存储结构自查**

检查 `migratePersistedState`、`loadPersistedState`、`savePersistedState` 与 `createInitialState` 的字段名一致；确认缺少反馈字段的旧存储不会导致整份状态被丢弃。

## Task 2: 在 reducer 中实现提交和审核的领域行为

**Files:**
- Modify: `src/app/campusReducer.js`
- Modify: `src/domain/placeFeedback.js`
- Modify: `src/data/appStorage.js`

- [x] **Step 1: 添加访客提交动作**

新增 `SUBMIT_PLACE_FEEDBACK` 分支。它只接受通过领域校验、引用现有地点且 ID 未重复的记录；提交者无需登录。成功时将记录追加到 `state.placeFeedback` 并更新 `lastSyncedAt`，不改 `locations`、`events` 或 `routePlan`。

- [x] **Step 2: 定义审核动作输入**

新增 `REVIEW_PLACE_FEEDBACK`，输入形状固定为：

```js
{
  type: 'REVIEW_PLACE_FEEDBACK',
  feedbackId,
  decision: 'approved' | 'rejected',
  reviewNote: '',
  approvedDescription: '',
  endAt: '',
  affectedEdgeIds: [],
  now: new Date(),
}
```

只有 `state.role === 'manager'` 可以审核。记录不存在、状态不是 `pending`、驳回说明超长、反馈引用的地点不存在或审批字段无效时保持原状态，不产生事件或地点变更。

- [x] **Step 3: 实现状态类反馈审批**

批准 `crowd` 时只更新地点 `crowdStatus`；批准 `open-status` 时只更新 `openStatus`。同时写入 `updatedAt` 和 `updatedBy: '管理员（演示）'`，然后使用现有 `createRouteForState` 重算已规划路线。

- [x] **Step 4: 实现信息纠错与动态类反馈审批**

批准 `location-info` 时，将审核确认的非空 `approvedDescription` 保存到地点 `description`，并更新管理员标记。

批准 `closure` 或 `construction` 时，创建一个 `status: 'active'` 的现有热点事件，字段至少包括唯一 ID、地点 ID、类型（分别映射到 `closure`/`construction`）、标题（`临时关闭：${location.name}` 或 `施工提醒：${location.name}`）、开始时间、结束时间、影响说明、热度 `medium`、共享路段 ID 列表、`source: 'feedback'` 和现有角色可见范围。施工至少需要一条 `affectedEdgeId`；临时关闭允许管理员不关联道路。新事件通过现有受影响路段计算进入 `getActiveBlockedEdgeIds`，并重算已规划路线。

若封闭路段导致校园路网找不到可行路径，保持路线 `unavailable`，不要降级到腾讯路线接口；腾讯接口不能排除校园路段，因此这种降级可能把路线重新画到封闭道路上。

- [x] **Step 5: 完成一次性审核与历史状态**

不论通过或驳回，都将反馈从 `pending` 原子性改为目标状态，并写 `reviewedAt`、`reviewedBy: '管理员（演示）'`、`reviewNote`；动态类批准额外写入 `approvedEventId`。再调用同一 action 审核已处理记录必须无效。将审核作为 `feedback-review` 记录加入 `adminHistory`；该类型是审计记录，`UNDO_ADMIN_ACTION` 遇到它时保持状态不变，避免撤销审核后重新处理同一反馈。界面显示审核状态和时间。

## Task 3: 制作用户反馈表单并接到地点详情

**Files:**
- Create: `src/features/locations/PlaceFeedbackSheet.jsx`
- Modify: `src/features/locations/LocationDetail.jsx`
- Modify: `src/styles.css`

- [x] **Step 1: 复用现有登录弹层交互约定**

`PlaceFeedbackSheet` 使用 React portal、`role="dialog"`、`aria-modal="true"`、关闭按钮、Escape 关闭和点击遮罩关闭；关闭时清空输入，不写入 localStorage。

- [x] **Step 2: 按反馈类型显示字段**

地点由 `LocationDetail` 传入，不让用户更改对象。所有类型显示说明输入框，`maxLength={240}`；按类型显示人流选择、开放状态选择、未来预计结束时间，或地点建议描述输入框。临时关闭和施工的结束时间必填；信息纠错的建议描述必填且 `maxLength={240}`。

- [x] **Step 3: 只在本地提交 pending 记录**

提交时先运行与 reducer 相同的领域校验。有效时调用 `onSubmitFeedback(payload)`，将表单切换为确认视图并展示“已提交，等待管理员审核”，用户点击关闭后返回地点详情；字段有错时在表单内给出错误，不调用回调。表单和成功提示明确写“仅保存在本机演示数据中”。

- [x] **Step 4: 为地点详情增加入口并展示已审核动态**

在 `LocationDetail` 增加 `onSubmitFeedback`、`feedbacks` 属性和“反馈地点”按钮。普通访问者只显示已批准的地点状态与有效热点，不能编辑审核内容；现有管理员直接改状态入口保留。通过反馈生成的信息修正显示为当前地点描述，不改静态数据文件。

## Task 4: 制作管理者模拟审核面板

**Files:**
- Create: `src/features/mobile/FeedbackReviewPanel.jsx`
- Modify: `src/features/mobile/MePanel.jsx`
- Modify: `src/styles.css`

- [x] **Step 1: 展示审核队列和记录状态**

面板接收 `feedbacks`、`locations`、`onReview`。显示待审核数和“待审核 / 已通过 / 已驳回”分组；每项展示地点、类型、说明、提交时间、状态。已处理反馈只读，不渲染审核按钮。

- [x] **Step 2: 为每类记录显示审核所需确认项**

人流和开放状态预填用户建议值并允许管理者确认。临时关闭和施工预填报告的结束时间；使用 `getRoadEdgeOptions(locationId)` 选择相关路段，施工必须至少选一段。信息纠错展示原描述和建议描述，管理员在通过前可编辑确认描述。

- [x] **Step 3: 实现通过、驳回和表单限制**

批准和驳回前都要校验。驳回原因可空但最多 120 字；关闭/施工审批的结束时间必须晚于当前时间；施工至少有一条受影响路段；信息纠错审批必须提供非空确认描述。审核完成后立即切换到已处理记录并显示结果。

- [x] **Step 4: 接入现有管理者入口**

在 `MePanel` 的现有 manager-only 管理工具区增加“地点反馈审核”折叠入口及待审核数量徽标。仅 `role === 'manager'` 时挂载面板；未登录访客或学生角色不显示审核入口。继续使用当前演示角色切换，不新增认证逻辑。

## Task 5: 将状态和回调接入应用状态

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/features/map/TencentCampusMap.jsx`
- Modify: `src/features/map/MapWorkspace.jsx`
- Modify: `src/features/routes/RouteDock.jsx`
- Modify: `src/app/campusReducer.js`
- Modify: `src/features/locations/LocationDetail.jsx`
- Modify: `src/features/mobile/MePanel.jsx`

- [x] **Step 1: 将地点反馈状态传到两处界面**

`App` 的地图详情使用 reducer 已更新的地点状态和当前地点有效热点展示审核结果；“我的”页传完整反馈列表和地点列表。不得将待审核或已驳回记录传给普通地点展示组件。

在腾讯地图可识别的校内 POI 详情卡中增加“反馈地点信息”次要按钮，复用同一 `PlaceFeedbackSheet`；点击按钮先关闭 InfoWindow，再通过 `MapWorkspace` 回调把对应地点 ID 传给 `App`。未匹配到校园地点的腾讯 POI 不展示该按钮。

当路线含封闭路段时，`TencentCampusMap` 不请求不能接收校园封路数据的普通腾讯步行路线。`RouteDock` 显示共享校园路网的避让路线与分段说明，同时禁用腾讯外部导航链接。若没有可行校园路线就显示无可用路线；不在腾讯底图绘制尚未校准的校园路径线。

- [x] **Step 2: 接入两个 reducer action**

用户表单回调先以 `createPlaceFeedback(input)` 构造记录，再 dispatch `{ type: 'SUBMIT_PLACE_FEEDBACK', feedback }`；管理员回调 dispatch `{ type: 'REVIEW_PLACE_FEEDBACK', ...decision }`。`canUndoAdminAction` 只有当管理员历史最新记录属于 `location-update`、`event-create`、`event-close` 或 `event-update` 时为真；`feedback-review` 审核审计记录不支持撤销。保持现有登录、路线、热点管理和标签页逻辑。

- [x] **Step 3: 确认本机保存与清理路径**

检查 App 既有的 `savePersistedState(state)` effect 能保存 `placeFeedback`；确认“清除演示数据” dispatch 的 `RESET_DEMO_DATA` 同时恢复初始地点、初始事件并清空反馈队列。

## Task 6: 完成移动端样式与手动验收

**Files:**
- Modify: `src/styles.css`
- Review: `docs/superpowers/specs/2026-10-02-campus-place-feedback-design.md`

- [x] **Step 1: 完成手机尺寸弹层与审核卡片样式**

沿用 `.mobile-login-backdrop`、`.mobile-login-sheet` 和 `.mobile-page-panel` 的安全区、滚动及圆角规范；窄屏下表单单列，底部导航不遮挡提交按钮，长审核说明可以换行。

- [ ] **Step 2: 检查本机原型的界面流程**

启动现有 Vite 开发服务器，在 `http://127.0.0.1:5173/` 使用手机尺寸检查：点击腾讯地图校内标签并从 POI 卡打开反馈、提交五种反馈、切换到“我的”并进入管理者演示角色、通过/驳回、回到地点详情查看结果、刷新页面查看持久化、清除演示数据查看重置。施工至少关联一段道路后规划经过该路段的路线；确认路线避让，结束或过期后恢复。

- [x] **Step 3: 对照设计规格做最终自查**

逐项确认待审核反馈不改变地点或路线；已审核记录不可二次处理；错误描述长度、时间、状态值和道路选择均会被拒绝；所有界面清楚标记本机演示；腾讯地图未承诺独立动态标记；重置会清空新增数据。

## 交付边界

- 不新增测试文件或运行自动化测试；按当前指令仅进行实现和界面流程检查。
- 不新增后端、地图标记覆盖层、附件上传、真实账号或跨设备同步。
- 不整理当前工作区中与此功能无关的改动；提交时只纳入本功能文件。
