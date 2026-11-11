# CampusTwin 公网部署实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 发布一个无需开发电脑在线、任何持有链接的人都能通过 HTTPS 访问的 CampusTwin 网站。

**Architecture:** 使用 Cloudflare Pages GitHub 集成，从私有仓库 `zhchunyu/Chun-Yu` 的 `campustwin-afternoon` 分支自动构建。Vite 输出到 `dist`；Pages 专用构建命令在构建后移除未被应用引用的 40 MiB 模型，保留仓库源文件。

**Tech Stack:** React 19、Vite 8、Node.js、Cloudflare Pages、GitHub。

---

### Task 1: 为 Pages 构建排除未使用的大模型

**Files:**
- Modify: `package.json`
- Create: `scripts/prepare-pages.mjs`

- [ ] **Step 1: 增加专用 Pages 构建命令**

在 `package.json` 的 `scripts` 中增加：

```json
"build:pages": "npm run build && node scripts/prepare-pages.mjs"
```

该命令先运行现有 Vite build，再清理仅不应进入发布产物的大文件。

- [ ] **Step 2: 添加发布产物清理脚本**

创建 `scripts/prepare-pages.mjs`：

```js
import { rm } from 'node:fs/promises'

const unusedCampusModel = new URL('../dist/assets/campus-extracted.glb', import.meta.url)

await rm(unusedCampusModel, { force: true })
console.log('Excluded unused campus-extracted.glb from the Pages deployment.')
```

脚本只移除 `dist/assets/campus-extracted.glb`，不改动 `public/assets` 中的原始文件。

- [ ] **Step 3: 构建并检查发布目录**

运行：

```powershell
npm run build:pages
```

预期：Vite 构建成功，`dist/assets/campus.glb` 和 `dist/assets/shanhe-campus-plan.svg` 存在，`dist/assets/campus-extracted.glb` 不存在。此步骤不运行 Vitest 测试套件。

- [ ] **Step 4: 提交并推送构建配置**

```powershell
git add package.json scripts/prepare-pages.mjs
git commit -m "build: prepare CampusTwin for Cloudflare Pages"
git push origin campustwin-afternoon
```

### Task 2: 连接私有 GitHub 仓库并创建 Pages 部署

**Files:**
- No repository file changes; configure Cloudflare Pages in its dashboard.

- [ ] **Step 1: 使用 Cloudflare 控制台创建 Pages 项目**

登录 Cloudflare，选择 Pages 的 Git 集成并连接 GitHub。只授权 Cloudflare GitHub App 读取 `zhchunyu/Chun-Yu`，选择仓库和 `campustwin-afternoon` 生产分支。

- [ ] **Step 2: 配置 Vite 构建参数**

设置生产构建命令为 `npm run build:pages`，构建输出目录为 `dist`。不配置后端、环境变量或访问密码。

- [ ] **Step 3: 首次部署并记录公开 URL**

等待 Cloudflare Pages 构建成功，记录其 `https://<project-name>.pages.dev` 地址。该 URL 对任何访问者开放；演示数据仍分别保存在访问者自己的浏览器中。

### Task 3: 确认公网访问和自动更新

**Files:**
- No further repository file changes.

- [ ] **Step 1: 检查部署页面和静态资源**

用手机蜂窝网络或其他外部网络打开 Pages 提供的 HTTPS URL，确认页面加载，且网络请求能获取 `/assets/campus.glb` 与 `/assets/shanhe-campus-plan.svg`。确认 `/assets/campus-extracted.glb` 不在部署产物中。

- [ ] **Step 2: 确认分支自动部署状态**

在 Cloudflare Pages 项目中确认生产分支是 `campustwin-afternoon`，Git 集成显示已连接，并将项目地址交给队友访问。

## 验收对照

- 部署来自 `campustwin-afternoon`，不更改远程 `main`。
- GitHub 仓库维持私有；网站地址不要求访问者登录。
- 电脑关闭后，已部署的 HTTPS 网站仍可访问。
- 页面使用的 3D 模型与二维底图包含在发布产物中；未使用的大模型只从发布产物排除。
- 访问数据仍为浏览器本地数据，不在用户之间同步。
