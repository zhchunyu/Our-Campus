# 聊天通知接口与上线检查

2026-11-08 已只读核对生产。此目录的 19 号 SQL 由主代理评审执行；本次子任务没有应用生产 SQL、部署函数或发送消息。

## 已核实的边界

- 当前聊天是五个地区的登录用户公开大厅：teaching/living/dorm/sports/gate。没有私聊、会话成员或 channel_id。
- hall_messages 有 reply_to，但现有客户端发送和读取都未使用；本次不新增回复功能或隐式回复收件人。
- 现生产 notifications.type 不含 hall-message，related_type 已允许 message；已有按 (recipient_id,dedupe_key) 的部分唯一索引。
- campus_subscriptions 原主键为 (user_id,location_id,kind)，RLS 限本人；空地点/空类型仅是校园信息通配，绝不能成为聊天同意。
- 19 号 SQL 只增加 hall-message，保留当前生产所有原 kind；activity 的 14 号功能另行升级。

## 最小完整行为

聊天提醒默认全关。用户在“订阅与通知设置”的五个地区开关逐个同意，写入 campus_subscriptions，kind=hall-message、location_id=hall-region:<regionId>。不迁移或默认生成任何订阅，不补推历史聊天。

仅新 INSERT 生成通知：同地区明确订阅者、排除消息作者、订阅早于消息。每个收件人和消息最多一条通知；客户端重试已有 (author_id,client_message_id) 唯一键，通知重试已有 dedupe 唯一键。相同消息的更新不会再次通知。普通聊天正文不会进入 AI。

通知使用 type=hall-message、related_type=message、related_id=<message UUID>、dedupe_key=hall-message:<message UUID>。锁屏仅使用通用新消息文案；消息详情通过现有 RLS 查对应、未撤回的 hall_messages，展示正文和照片。源消息不存在/已撤回时不显示旧正文或跳转。

撤回/删除消息会删除相关聊天通知，取消尚未完成的推送任务；退订仅清理该用户该地区的聊天通知和未完成任务。重新订阅不恢复旧任务。已经被系统展示的通知无法收回。退订与新消息通过订阅行锁串行化；外部发送前最后一次检查之后仍存在网络调用固有的瞬时竞争窗口。

## Worker 契约（必须一同实现）

仅 service_role 可调用 public.campus_hall_push_context(p_notification_id uuid)，返回 JSONB：

- 可发送：{deliverable:true,region_id:"teaching",message_id:"<uuid>"}。
- 已读/退订/撤回/删除/作者本人/后来才订阅/不属于聊天类型：{deliverable:false}。

发送 hall-message 时，每台设备向提供商发送前调用一次；RPC 错误按失败重试，不得当作可发送；false 则跳过。原 worker 的 campus-event 分支不能直接处理 message，应新增聊天 deliveryContext，通用标题正文来自通知，不从已删源消息拼内容。保持按设备 receipts 去重和提供商 request_id 稳定。前台和 Android 继续共用 notifications -> push jobs 链。

## App 回调契约

NotificationCenter 新增可选 onOpenChat(regionId: string)，只传五个合法地区之一。主 App 收到后关闭通知中心、设置 hallRegionId、hallSection='chat'、hallFullscreen=true、activeTab='hall'。子任务未改 App.jsx。

## 上线前验证（事务回滚，不向真实用户发测试）

在隔离环境或包裹 BEGIN/ROLLBACK 的事务内，用新建的虚构 fixture 账号/消息验证。不要复用真实聊天正文；事务中禁用/回滚 worker wake，确保测试不能提交外发任务。

1. 未订阅/旧空通配订阅/不同地区不会收到；同地区明确订阅者收到且作者本人不收。
2. 同 client_message_id 重试失败或返回已有消息；每个收件人源消息只有一条通知和一个 push job；更新消息不新增通知。
3. 禁止 anon 操作；用户不能写他人的订阅；hall-message 空地点/无效地区被 RLS 拒绝；合法校园地点订阅保持原行为。
4. 通知源、标题、related_type、dedupe_key 正确，不包含聊天正文；已有 information_push_enqueue 自动生成任务。
5. 服务角色 RPC 对新、未读、有效订阅通知为 true；客户端角色无 EXECUTE；已读/退订/撤回后为 false。
6. 撤回/硬删源消息清理通知且取消 pending/running/retry job；退订只影响本人该地区聊天。重新订阅没有旧消息补发。
7. 两个并发会话交错“新消息/退订”，最终无已退订者有效聊天通知；提供商发送前重复检查 RPC。
8. 两台实际 Android 设备分别验证前台横幅、后台通知栏、点击回正确地区；自发消息不提示、退订无后续提醒。原签名打包由保管原密钥的队友完成。

当前前端 helper 测试覆盖精确同意、旧通配排除、作者标识不可覆写、只删除本人精确订阅、未升级错误、撤回消息及非法跳转防护；这些不代替真实数据库 RLS/触发器与设备投递测试。

## 主代理上线回执（2026-11-08）

19号 SQL 已在生产执行，campus-information-worker 已更新至 v23 并逐字回读匹配。回滚事务验证真实 producer、收件范围、RLS、去重、已读、退订、撤回与硬删通过；虚构Auth用户0，notifications仍111、hall_messages仍35，worker唤醒触发器已恢复启用。未向真实用户发送测试消息。

App已接onOpenChat回调，前台提醒保留待展示队列，公开AppID已配置；前端34项及worker30项检查、生产构建、安卓资源同步通过。APK须由持有原签名的队友生成；设备登记、后台到达和厂商离线通道仍待真机验收。
