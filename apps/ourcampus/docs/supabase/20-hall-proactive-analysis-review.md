# 公开聊天相关提醒：20号增量契约

候选文件，尚未应用到生产。当前生产已只读确认为项目 `hkdblizadnkskxslyjyq`、worker v23。20号依赖已上线的09/10/19号能力，独立于尚未上线的14号通知偏好表。

只对安装新触发器之后的 `hall_messages INSERT` 排队，不扫描历史，不因后续编辑/开启偏好/新增兴趣补处理旧消息。图片不送模型，单条文本最多200字符。普通问候由本地规则标记none，不调用模型。其他正文仅发一条，先去除联系方式和UUID；模型输入messages序列化UTF-8不超过2400字节，输出限制160 token。

## 数据与接口

| 对象 | 契约 |
| --- | --- |
| `public.campus_ai_reminder_preferences` | `user_id` 本人PK/FK，`enabled=false`、`use_favorites=true`、`match_lost=true`，兴趣词最多8个、每个2–16字符、合计UTF-8最多512字节。本人RLS SELECT/INSERT/UPDATE/DELETE，服务端全权。客户端保存局部字段。 |
| `campus_private.hall_message_analysis` | `message_id`唯一；原文hash、状态、`call_started_at`、有限结构分析、用量计数。不对客户端开放。 |
| `campus_private.hall_analysis_monthly_usage` | 按北京时间自然月原子预占，最多1000次自动聊天分析。预占后不退次数，即使超时/崩溃；这是调用数量上限，不是总账单上限。 |
| `information_jobs.kind` | 新增 `chat-analysis`，沿用`(kind,target_id)`唯一键、claim_token租约；已有analysis/push语义保留。 |
| `campus_begin_hall_analysis(p_id,p_token)` | service_role专用。只认可有效chat-analysis租约，检查原文未撤回/未修改/未过24小时、状态pending、从未预占，再原子增加月计数并写`call_started_at`。返回 `{allowed,content?}`，不返回作者、收件人、图片或设备信息。 |
| `campus_complete_hall_analysis(p_id,p_token,p_analysis,p_model_used=true,p_usage={})` | service_role专用。仅接受`kind/location_id/keywords/verified=false`四个字段；关键词最多5个，必须为原文2–16字符连续片段；地点必须唯一明确命中数据库名称/别名。无模型完成仅允许none。服务端自行计算收件人，不接受recipient_ids。 |
| `campus_hall_push_context(p_notification_id)` | 仍为service_role专用。hall-message保留原明确地区订阅判断；hall-match重新查询当前有效偏好与来源。每台设备发送前、重试前都调用。 |

分析结果不会新增或发布 `campus_events`，也不自动新增校园上报。通知仅称“未核实公开聊天线索”。

## 真实用户关联与撤销

只考虑主动开启新开关的真实用户，排除作者。依据包括：云端`campus_user_preferences.favorite_ids`、非空的显式校园地点/类别订阅、用户明确填写的兴趣词、相反类型且仍有效的本人失物报告。失物报告需同一明确地点、30天内、至少两个原文物品特征；不依靠区域或一个泛词认定归属。没有依据则不通知。

空地点+空类别的泛订阅不匹配普通聊天。新开关不影响原hall-message地区订阅。新提醒使用`type=hall-match,related_type=message`，和原地区提醒共用`dedupe_key=hall-message:<message_id>`，每人每条只保留一条通知。

偏好/收藏/订阅变更、失物完成/撤回、原聊天撤回/删除/编辑都会重新检查并清除不再有效的站内通知和待发任务。关闭后重新开启不会重播。为防止排队期间新增关注导致补发，匹配保守要求新提醒偏好的`updated_at`、收藏变更时间、订阅/失物创建时间不晚于消息；因此更改任意新提醒设置也可能取消一条仍在排队的旧消息。

## 严格每条最多一次模型调用

请求前先通过RPC持久化预占。HTTP已经开始之后，超时、无效输出、完成回写失败或进程崩溃均不自动重发模型请求，任务终态failed。失联租约到期也会终结已预占任务。预占前数据库临时错误仍可用既有队列重试。不会伪造未得到的模型结论。

这保证最多调用一次，不能保证外部服务始终返回成功；故障消息可能没有相关提醒。通知发送继续沿用稳定request_id、设备收据及实时授权复查。

## 审核后上线顺序

1. **先部署worker分支和纯helper**。此时旧数据库没有新kind，不会产生chat-analysis任务。
2. 应用20号SQL，再检查函数权限、RLS和表结构。
3. 发布含新开关的客户端；默认关闭，不迁移或替用户创建兴趣。

若先应用SQL再部署worker，旧v23会将未知kind当作push任务处理并标done，可能漏掉过渡期间的新分析。

生产v23是单文件；`hall-proactive.js`没有import，移除`export `即可嵌入。推荐只移植本次worker的`analyzeHall()`、process中chat-analysis分支和`invalid_ai_input`错误码，保留实际生产其它函数。最新本地整个factory还引用其它新增失物helper，整体替换前须核对依赖。

## 已完成验证

- 新worker聊天分析15项回归通过（先观察缺失行为失败）；与原推送/模型路由合计48项通过。其中商业qwen3.7-flash及日期快照显式关闭思考，自定义V10不添加该参数。
- UI/通知详情相关60项通过，应用构建通过。
- 20号SQL整体语法解析通过；在隔离的本地PostgreSQL兼容运行时实际执行20迁移和回滚事务回归，通过RLS、四类受众、默认关闭、原文关键词/地点、双提醒去重、开启前消息不补发、撤回/关闭/退订/失物完成、一次预占和1000次月上限。
- 生产尚未应用20号SQL、未部署本次worker、未调用真人模型或推送。隔离运行时使用最小生产表结构和实际19号触发器，不能替代主代理审核后对目标项目的迁移检查。

相关测试共108项通过（Node模型/推送33项，Vitest聊天分析+通知UI75项）。完整旧测试集仍有地图/地点数据断言失配及node:test被Vitest错误收集的问题，本次不改动地图和测试运行配置。新聊天测试采用Vitest，不新增错误收集文件。

公开聊天理解使用独立的`AUV_HALL_MODEL`，未配置或空白时默认`qwen3.7-flash`；不复用V10的`AUV_EXTRACT_MODEL`，也不受聊天`AUV_PERSONA_MODEL`的旧值影响。V10仍负责原事件抽取。仅flash别名及日期快照在HTTP请求顶层显式传`enable_thinking:false`，其他可选模型不附加该参数。上述模型回归均为合成桩，真实供应商输出尚未验证；旧事件字段JSON会被严格拒绝，不会伪转成功。

`20-hall-proactive-analysis-regression.sql`只含合成账号，禁用外部唤醒、保留真实生产者，全部ROLLBACK；已有真实AI或地区聊天订阅时拒绝执行，避免触及真人。成功提示在ROLLBACK之前，执行器应遇错立即停止。

可用 `node tools/verifyHallProactiveSql.mjs <本地@electric-sql/pglite的dist/index.js绝对路径>` 复现隔离SQL回归，第三方运行时仅用于本地验证，不加入应用依赖。


### 2026-11-10 模型职责隔离复核

新增7项用例，先确认原实现因误用extract模型而失败，再切换独立模型配置。聊天分析22项通过；原模型映射及推送33项通过；聊天分析、地区通知助手、AI提醒偏好及设置组件合计41项通过。覆盖默认flash、空白配置回退、flash日期快照关闭思考、其他模型无专用参数、V10旧事件JSON拒绝。未调用真实模型，未部署生产，未改变一次预占、160 token输出、2400字节输入上限。

生产单文件worker的移植仍应只插入纯helper、`analyzeHall()`、`process()`开头的chat-analysis分支、`invalid_ai_input`错误码，并将报告分析请求中的商业flash关闭思考补丁单独移植；不要整体替换为本地factory，以免引入其它尚未核对依赖。

## 并发锁顺序复核（2026-11-10）

发现并修正一处部署前阻断问题：生产19号的消息删除清理是 AFTER DELETE，新增分析表又有 ON DELETE CASCADE；若只在完成分析和 AFTER 清理时获取全局锁，会形成“完成：全局锁→任务→分析行 / 删除：分析行→全局锁”的死锁。行级 BEFORE 也太晚，因此使用 BEFORE STATEMENT 门闩。

- 对 hall_messages、campus_reports、campus_user_preferences、campus_subscriptions、新提醒偏好的 UPDATE/DELETE，在读取或修改目标行前获取同一事务级锁。
- auth.users 仅 DELETE 加同一语句门闩，保护注销级联；注册、登录和普通 Auth 更新不受此触发器影响。
- claim/begin/finish 队列 RPC 在行锁前取门闩。已有6个会先 SELECT FOR UPDATE 或先改任务再改来源的 RPC（收藏修改、报告重试、报告完成、报告状态、管理员审核、报修处理）只在原始函数体 begin 后插入一条门闩语句；SQL 用实际生产 prosrc 的 MD5 校验，已有业务、函数身份与 ACL 保留不变，来源漂移时整体迁移回滚，要求重新审核。
- 门闩只覆盖短数据库事务，不跨模型或推送 HTTP 请求。新特性默认关闭且每月自动分析最多1000次；全局串行仍会增加高并发写入的等待，后续扩量应评估。
- 报告变更只清理对应作者的语义提醒，消息编辑只清理这一条消息，避免每次报告更新扫描所有人的相关通知。

隔离 PostgreSQL 运行时已新增8个独立事务场景：硬删除级联、内容更新、撤回、偏好变更、账号删除级联、任务领取、分析预占、任务结束。行/级联/队列探针验证在第一次相关行操作前已持有门闩，实际旧6个函数源基线校验及门闩位置也验证。原完整事务回归另增加硬删除和账号注销清理。迁移重复执行两次、原RLS/关联/限额回归全部通过。PGlite 为单会话隔离运行时，这不是多连接并发压力测试，不据此宣称已完成真实竞争压测。

复核还确认生产 authenticated 不能写 hall_messages.author_id、created_at、content（更新）或 region_id（更新），新分析所用作者、时间戳和原文不会被普通客户端重新赋值。


## 生产上线记录（2026-11-10）

以上为部署前审核记录。用户明确批准后，20 号脚本已应用到项目 hkdblizadnkskxslyjyq，迁移编号 20261110130724；配套 worker v24 ACTIVE、auv-assistant v37 ACTIVE。真实数据库完整回滚回归通过，测试未调用模型或服务商，没有发送真人通知。原通知111条、合成账号0、分析记录0、月预算测试记录0、待处理任务0，外部唤醒触发器恢复，定时调度启用。三张表RLS、内部RPC仅service_role、原6函数正文与ACL均已核对。个人开关默认关闭，尚未发布新签名APK或验收手机送达；聊天AUV_PERSONA_MODEL仍待用户修改。
