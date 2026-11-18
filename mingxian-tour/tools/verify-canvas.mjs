/**
 * 纯画布截图：隐藏所有 UI 层，只保留 viewer，确认全景本体是否渲染。
 * 输出 tools/_out/canvas-<idx>.png
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { rm, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import os from 'node:os';
import path from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = 9335;
const URL_BASE = process.argv[2] || 'http://127.0.0.1:8123';
const profile = path.join(os.tmpdir(), `mx-edge-p3-${Date.now()}`);
let nextId = 1;

const child = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
  '--window-size=1280,800', '--hide-scrollbars',
  `${URL_BASE}/index.html`,
], { stdio: 'ignore' });

async function getTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch { /* retry */ }
    await sleep(400);
  }
  throw new Error('no target');
}

function rpc(ws, method, params) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    const onMsg = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id === id) {
        ws.removeEventListener('message', onMsg);
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      }
    };
    ws.addEventListener('message', onMsg);
    setTimeout(() => reject(new Error(`timeout ${method}`)), 40000);
  });
}

async function evalJS(ws, expression) {
  const r = await rpc(ws, 'Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) return { error: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
  return { value: r.result?.value };
}

try {
  const target = await getTarget();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });

  await rpc(ws, 'Runtime.enable', {});
  await rpc(ws, 'Page.enable', {});
  await sleep(3000);

  await evalJS(ws, `(async()=>{document.getElementById('btnStart').click();await new Promise(r=>setTimeout(r,11000));return 1})()`);

  // 隐藏所有 UI 覆盖层
  await evalJS(ws, `(()=>{
    const hide = ['topbar','loader','note','btnPrev','btnNext','dock','tourbar','toast','intro'];
    hide.forEach(id => { const el = document.getElementById(id); if (el) el.style.display='none'; });
    document.querySelectorAll('.topbar,.dock,.note,.navarrow,.tourbar,.loader').forEach(el=>el.style.display='none');
    const c = document.querySelector('#viewer canvas');
    const r = c ? c.getBoundingClientRect() : null;
    return { canvas: !!c, w: r?Math.round(r.width):0, h: r?Math.round(r.height):0 };
  })()`);

  await sleep(1200);

  await mkdir(join(HERE, '_out'), { recursive: true });
  for (const label of ['first']) {
    const shot = await rpc(ws, 'Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const p = join(HERE, '_out', `canvas-${label}.png`);
    await writeFile(p, Buffer.from(shot.data, 'base64'));
    console.log('saved', p);
  }

  // 顺带读取 PSV 状态
  const pos = await evalJS(ws, `(()=>{
    const c = document.querySelector('#viewer canvas');
    return { canvasW: c?.width, canvasH: c?.height, dpr: window.devicePixelRatio };
  })()`);
  console.log('canvas info', JSON.stringify(pos.value));

  ws.close();
} catch (e) {
  console.log('FAILED', e.message);
  process.exitCode = 1;
} finally {
  child.kill('SIGKILL');
  await sleep(600);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}