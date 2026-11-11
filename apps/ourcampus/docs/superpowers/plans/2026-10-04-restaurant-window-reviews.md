# Restaurant Window Reviews Implementation Plan

**Goal:** 餐厅地点卡片打开专用手机评价页面；按窗口查看、筛选和填写评价，首版为本机交互原型。

**Architecture:** 保留现有地点 ID。App 管理餐厅评价页的开关；独立页面通过 portal 占满手机视口。示例窗口/评价明确标注，用户提交单独写入本机存储，不调用 Supabase。

**Tech Stack:** 现有 React、Lucide 和 CSS；不新增依赖。

## 已确认的范围

- 用户要求每个窗口独立评价，入口放在餐厅地点详情，进入专用界面。
- 真实窗口名单尚未提供，使用六个明确标为示例的窗口。
- 原型支持窗口浏览、分类搜索、推荐/吐槽筛选、星级/文字/标签/可选消费金额、本机保存。
- 页面沿用校园绿色与米白色，评分用暖橙色。返回地点后保留原选择。

## 实现步骤

- [x] `src/data/restaurantReviews.js`：窗口示例、示例评价、聚合计算、本机数据读写及输入检查。
- [x] `src/features/reviews/RestaurantReviewsPage.jsx`：餐厅总览、窗口详情、筛选、页面返回和键盘焦点。
- [x] `src/features/reviews/ReviewComposer.jsx`：星级/标签/文字/金额表单；保存失败保留内容。
- [x] `src/features/reviews/restaurant-reviews.css`：手机全屏页面、窗口卡片、详情和填写评价抽屉。
- [x] 最小修改 App、LocationDetail、main：只在餐厅地点显示入口，接上专用页面。
- [x] 生产构建和页面外观检查；本次不新增或运行自动化测试，不打包 APK。

## 数据边界

窗口名称、价格及预置评价全部为示例，不能当成真实校园信息。新增评价仅在当前设备保存，不提供跨设备共享、真实点赞、举报审核或云端评分。接入真实名单与评价服务器另行进行。

## 结果

- `npm run build` 成功；已有的主包超过 500 kB 提醒仍在。
- 已在现有手机预览中查看禾香餐厅入口、六个示例窗口、单窗口详情和填写评价抽屉；浏览器错误日志计数为 0。
- 表单按钮固定在底部，内容区域可滚动；截图保存在 `docs/screenshots/2026-10-04-restaurant-window-reviews.jpg` 和 `2026-10-04-window-review-form.jpg`。
- 本次未提交虚构评价或修改线上数据库；本机提交逻辑已实现，但没有运行自动化测试或双设备联调。
