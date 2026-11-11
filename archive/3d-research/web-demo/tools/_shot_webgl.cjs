/* _shot_webgl.js —— 用 Playwright 给 WebGL 页面截图（可等待条件，绕开虚拟时间）
 *
 * ★ 为什么不用 `msedge --headless --screenshot --virtual-time-budget`：
 *   虚拟时间（virtual time）**不作用于 Web Worker**。本项目预览页的 Draco
 *   解码跑在 Worker 里 ⇒ 页面永远停在"加载中"，截图只能拍到遮罩。
 *   而页面本身没问题（GLB 已 100% 下载完，只是解不出来）。
 *   Playwright 是真实时间 + 可 `waitForFunction`，不受这个限制。
 *
 * 用法：
 *   node _shot_webgl.js <url> <输出png> [超时ms] [等待就绪的表达式]
 * 例：
 *   node _shot_webgl.js "http://localhost:8123/preview.html?shadow=0" out.png 180000 "window.__preview&&window.__preview().ready"
 */
const { chromium } = require('playwright-core');

const [url, out, tmo = '180000', readyExpr = 'window.__preview && window.__preview().ready'] = process.argv.slice(2);
const EXE = process.env.PW_CHROME ||
  'C:/Users/31967/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe';

(async () => {
  const browser = await chromium.launch({
    executablePath: EXE,
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader',
           '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('console', (m) => console.log('[console:%s] %s', m.type(), m.text()));
  page.on('pageerror', (e) => console.log('[pageerror] %s', e.message));
  page.on('requestfailed', (r) => console.log('[reqfail] %s  %s', r.url(), r.failure() && r.failure().errorText));

  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  console.log('[shot] 页面已加载 %.0f ms，等待就绪…', Date.now() - t0);
  try {
    await page.waitForFunction(readyExpr, null, { timeout: Number(tmo) });
    console.log('[shot] 就绪 %.0f ms', Date.now() - t0);
  } catch (e) {
    console.log('[shot] ⚠ 等待超时，仍截图（用于诊断）');
  }
  await page.waitForTimeout(2500);          // 让首帧/动画稳定
  const st = await page.evaluate(() => (window.__preview ? window.__preview() : null));
  console.log('[shot] 统计 %s', JSON.stringify(st));
  await page.screenshot({ path: out });
  console.log('[shot] 已写入 %s', out);
  await browser.close();
})().catch((e) => { console.error('[shot] 失败', e); process.exit(1); });
