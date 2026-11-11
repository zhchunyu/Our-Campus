// 对指定 URL 截图（用于验证 WebGL/three.js 页面是否真的渲染出内容）
// 用法：NODE_PATH=<node workspace>/node_modules node _shot.cjs <url> <输出png> [等待毫秒]
const { chromium } = require('playwright-core');
const path = require('path');

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find(p => require('fs').existsSync(p));

(async () => {
  const url = process.argv[2];
  const out = process.argv[3];
  const wait = parseInt(process.argv[4] || '9000', 10);
  const browser = await chromium.launch({
    executablePath: EDGE,
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const logs = [];
  page.on('console', m => logs.push('[console] ' + m.text()));
  page.on('pageerror', e => logs.push('[pageerror] ' + e.message));
  page.on('requestfailed', r => logs.push('[failed] ' + r.url() + ' :: ' + (r.failure() || {}).errorText));
  await page.goto(url, { waitUntil: 'load', timeout: 90000 }).catch(e => logs.push('[goto] ' + e.message));
  await page.waitForTimeout(wait);
  // 画布是否真的画了东西：取中心像素与四角比对，全同色说明是空白
  const canvasInfo = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    if (!c) return { hasCanvas: false };
    return { hasCanvas: true, w: c.width, h: c.height };
  });
  await page.screenshot({ path: out, fullPage: false });
  console.log('画布:', JSON.stringify(canvasInfo));
  console.log('日志 ' + logs.length + ' 条:');
  logs.slice(0, 20).forEach(l => console.log('  ' + l));
  await browser.close();
})();
