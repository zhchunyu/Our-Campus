// 一条命令启动「电脑浏览器 + 手机同尺寸预览」，方便在 PC 上测你画我猜等功能。
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const port = Number(process.env.OURCAMPUS_PREVIEW_PORT || 5180)
const url = `http://127.0.0.1:${port}/?preview=phone`
const noOpen = process.env.OURCAMPUS_PREVIEW_NO_OPEN === '1'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function openBrowser(target) {
  const [command, args] = process.platform === 'win32'
    ? ['cmd', ['/c', 'start', '', target]]
    : process.platform === 'darwin'
      ? ['open', [target]]
      : ['xdg-open', [target]]
  spawn(command, args, { detached: true, stdio: 'ignore' }).unref()
}

async function ensureDependencies() {
  if (existsSync(path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'))) return
  console.log('首次运行：正在安装依赖（npm ci），请稍候…')
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const install = spawn(npm, ['ci', '--no-audit', '--no-fund'], { cwd: root, stdio: 'inherit' })
  const code = await new Promise((resolve) => install.on('exit', resolve))
  if (code !== 0) throw new Error('依赖安装失败，请手动执行 npm ci')
}

async function waitForServer() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: 'follow' })
      if (response.ok) return true
    } catch { /* 还没起来 */ }
    await sleep(500)
  }
  return false
}

await ensureDependencies()

const vite = spawn(
  process.execPath,
  [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  { cwd: root, stdio: 'inherit' },
)

vite.on('exit', (code) => {
  if (code !== 0) console.error(`预览服务已退出（code ${code}）。端口 ${port} 可能被占用，可用 OURCAMPUS_PREVIEW_PORT 换一个。`)
  process.exit(code ?? 0)
})

const ready = await waitForServer()
if (!ready) {
  console.error('预览服务启动超时，请检查上方 Vite 输出。')
  vite.kill()
  process.exit(1)
}

console.log('')
console.log(`手机同尺寸预览：${url}`)
console.log('  · 浏览器里看到的是 430 × 880 的手机画面，交互与真机一致')
console.log('  · 社区 → 你画我猜 即可测试；改动代码会自动热更新')
console.log('  · 按 Ctrl+C 结束预览')
console.log('')

if (!noOpen) openBrowser(url)

const shutdown = () => { try { vite.kill() } catch { /* 已退出 */ } process.exit(0) }
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
