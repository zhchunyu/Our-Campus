# A · 清爽校园样式预览

用户范围：只应用选定的界面风格，保留现有功能和底层逻辑。本次只更新网页预览，未同步 Android 或重新打包 APK。

## 改动

- `src/main.jsx`：末尾主题引用从 `wechatTheme.css` 切换到 `campusFreshTheme.css`，保留旧主题文件。
- 新主题：暖白底色、浅绿色点缀、自然中文字重、细线图标、间距与卡片外观；服务、社区、我的及相关子页面采用一致配色。
- `ExplorePanel.jsx`：调整首页入口排布和展示文案，添加纯装饰 SVG。课表、AI、各服务入口仍调用原有回调。
- `HallPanel.jsx`、`MePanel.jsx`：仅增加装饰性品牌文字。
- `CampusIllustration.jsx`：无事件、无状态的校园 SVG 插画。

## 范围核对

基准为 `tmp/fresh-campus-20261015-120051/`，结果保存于该目录的 `scope-check.json`。

- 原服务分类定义、所有现有事件处理均保留。目录入口由原列表中的一项改为单独展示，仍调用 `onSectionChange('directory')`。
- 服务子页 JSX、服务目录文件与基准完全一致。
- 社区、我的文件移除新增装饰文字后与基准完全一致。
- 未修改地图、AI 请求、账号认证、数据存储、返回导航、后端或 Android 逻辑。

## 验证

- `npm run build`：通过，2028 modules。保留原有大于 500 kB 的包体积提示。
- `npm test -- src/app/backNavigation.test.js`：7/7 通过。
- 实际浏览器手机预览 387 × 837：新主题生效，无页面横向溢出。
- 点击确认课表、AI、16 项校园服务目录、校园聊天及其返回；服务、社区、我的外观已检查。未发送 AI 请求或聊天消息，未修改用户数据。
- 浏览器捕获的 error 日志为空。
- 截图：`docs/screenshots/2026-10-15-fresh-campus-service-1210.jpg`。

验证边界：网页预览和构建通过；未进行实体手机验收，本次样式尚未进入 APK。

## 服务页铃铛随内容滚动

用户反馈服务页右上角铃铛未随内容滚动。复现发现 `.primary-page-actions` 是服务滚动面板外的兄弟节点，并使用 `position: fixed`：面板滚动 58.91 px，铃铛仍停在 y=31 px。

将现有按钮通过 `headerActions` 放入服务标题栏，限定该标题栏内的按钮使用绝对定位。仅更换组件呈现位置，原 `information.unread` 和 `openInformation()` 保留；首页及其他页面的位置不变。

- 修正后面板滚动 58.91 px，铃铛从 y=31 移至 y=-27.91，同步移动 58.91 px。
- 通知按钮可正常打开校园消息并返回服务；首页仍保留固定的 AI 和消息入口，各页面只有一个消息按钮。
- `npm run build` 通过，仍只有原包体积提示。
- 涉及源码仅 `src/App.jsx`、`ExplorePanel.jsx`、`navigation.css`，修改前备份及浏览器结果在 `tmp/service-bell-scroll-20261015/`。
- 滚动后的截图：`docs/screenshots/2026-10-15-service-bell-scroll.jpg`。
