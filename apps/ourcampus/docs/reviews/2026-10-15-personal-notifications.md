# 相关提醒与个人 AI 上下文验证

当前状态：本地实现及验证完成，云端部署、双账号 Realtime 和实体手机验收未执行；未打包新 APK。

## 验证通过

- `npm test -- src/data/notificationRelevance.test.js src/app/backNavigation.test.js`：25/25，含 18 项通知/匹配检查与 7 项既有返回测试。结构化结果在 `tmp/relevant-notices-20261015/focused-vitest.json`。
- `node --test server/personalNotifications.test.mjs`：4/4。检查上下文脱敏、忽略客户端伪造用户 ID、Worker 跨地点匹配及模型不可用的明确降级。
- 独立 PostgreSQL/WASM：执行实际 01/09/14 迁移，14 号重复执行通过；14 项检查通过，覆盖 RLS、活动订阅、收藏合并、无关用户不接收、重要事项全员、失物双方去重、关闭匹配开关、分析期间完成后停止、未来活动审核和不登记厂商推送。
- `npm run build`：通过。保留已有大于 500 kB 的主包提示。
- 实际手机尺寸浏览器：原页面可打开；通知偏好显示新增内容，未部署时明确提示不可用且禁用相关操作，原消息入口保留。

## 审查修正

只读代码审查发现并已修复：设备旧收藏覆盖另一个账号/云端收藏；历史分页误弹；附属物颜色掩盖主色冲突；匹配依据绕过联系方式脱敏；活动订阅遗漏数据库约束；滚动时间水位导致延迟新通知遗漏及毫秒截断数据库微秒。对应核心情形已有回归检查。

## 既有未通过用例

本次扩大检查发现仓库全量测试尚未通过，不能宣称全仓库测试通过：

- `npm test -- src`：114 通过、14 失败，另有一个 `tmp/map-update-20261011/remote/...` 旧拷贝缺少依赖导致套件失败。失败断言涉及旧的 30 个地点、默认 3D、旧坐标、旧楼名和地图比例；这些数据/地图模块不在本轮改动范围。
- `node --test server/auv.test.mjs`：7/8；“西车间二号”旧别名断言失败。该别名识别代码与本轮基准一致，未为通过测试改动校园地点或别名。

## 复现文件

- 改动前旧文件备份：`tmp/relevant-notices-20261015/`。
- 数据库脚本：`tmp/relevant-notices-20261015/verify-database.mjs`；结果 `database-results.json`。运行时仅安装在该目录的 `pg-runtime/`，应用依赖未新增。
- 在项目根目录复现数据库验证：先运行 `npm install --prefix tmp/relevant-notices-20261015/pg-runtime --no-save --ignore-scripts --package-lock=false --registry=https://registry.npmjs.org @electric-sql/pglite`，再运行 `node tmp/relevant-notices-20261015/verify-database.mjs`。
- 迁移与函数部署说明：`docs/personal-campus-notifications-2026-10-15.md`。

本地数据库只有单连接，不用于证明线上并发负载或 Supabase Realtime；模型测试均为 mock，不声称真实模型已回复或线上已自动提醒。
