# CampusTwin 公网网站发布设计

## 背景

本地开发地址 `http://127.0.0.1:5174/` 只在运行项目的电脑上有效。现有 Cloudflare Quick Tunnel 依赖电脑持续连出，且当前网络无法稳定连通隧道所需端口，无法满足队友随时访问的目标。

项目是 Vite 静态前端，没有服务端或账号认证。地图地点和管理演示数据保存在访问者自己的浏览器中。

## 目标

- 为队友提供可从公网随时访问的固定 HTTPS 网站地址。
- 在现有私有 GitHub 仓库 `zhchunyu/Chun-Yu` 中，从 `campustwin-afternoon` 分支自动构建和发布。
- 保持 GitHub 仓库私有，不修改远程 `main` 分支。
- 后续向 `campustwin-afternoon` 推送代码时，自动更新网站。

## 方案

使用 Cloudflare Pages 的 GitHub 集成连接私有仓库。Cloudflare 从仓库根目录构建，构建命令为 `npm run build`，发布目录为 `dist`，生产分支为 `campustwin-afternoon`。项目名由 Cloudflare 账户中可用的名称确定，首次部署后使用其 `*.pages.dev` 地址。

Cloudflare GitHub App 只授权访问 `zhchunyu/Chun-Yu`。部署流水线在 Cloudflare 侧运行，不依赖开发电脑、局域网或 Quick Tunnel。

## 大文件处理

`public/assets/campus-extracted.glb` 约 40 MB；当前地图配置实际加载的是 `public/assets/campus.glb`，没有引用该大文件。Cloudflare Pages 单个站点资源的上限是 25 MiB。

因此，Pages 专用构建步骤会在 `vite build` 后从 `dist/assets/` 移除 `campus-extracted.glb`。Git 仓库中的原始模型保留，队友仍可下载和修改整个项目；该模型不进入公网部署产物。

## 访问范围和数据边界

- 网站 URL 对任何持有链接的人开放，无登录门槛。
- 当前访客、学生和管理员角色仅用于演示，不构成账号或权限保护。
- 页面数据保存在访问者浏览器本地，不会在队友之间同步；本次发布不新增后端或数据共享能力。

## 验收

1. Cloudflare Pages 能从 `campustwin-afternoon` 成功构建并发布 `dist`。
2. `*.pages.dev` 地址在不与开发电脑同网的设备上可打开。
3. 3D 校园模型、二维底图、路线规划和移动端页面可正常加载。
4. 后续向 `campustwin-afternoon` 推送提交会触发新部署。
5. GitHub 仓库保持私有，远程 `main` 不变。

## 未采用的方案

- **GitHub Pages：**私有仓库发布受 GitHub 账号方案限制；改为公开仓库会超出本次只发布网站的范围。
- **Cloudflare Quick Tunnel：**依赖电脑持续运行，且当前电脑网络到隧道边缘节点的连接失败。

## 依赖与限制

首次创建 Pages 项目需要在 Cloudflare 控制台完成登录，并授权 Cloudflare GitHub App 读取此仓库。Cloudflare Pages 对单个发布资源有 25 MiB 上限，因此需排除上述未使用模型。

## 参考

- [Cloudflare Pages Git 集成](https://developers.cloudflare.com/pages/configuration/git-integration/)
- [Cloudflare Pages 平台限制](https://developers.cloudflare.com/pages/platform/limits/)
- [Cloudflare GitHub 集成](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/)
