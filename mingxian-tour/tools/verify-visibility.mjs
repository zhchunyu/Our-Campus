/**
 * 视觉可见性验证（不依赖截图）：
 * 用 element.checkVisibility() + computed display 判断元素是否真的看得见。
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9350;
const URL_BASE = process.argv[2] || 'http://127.0.0.1:8123';
const profile = path.join(os.tmpdir(), `mx-vis-${Date.now()}`);
let nextId = 1;

const child = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
  '--window-size=1440,900', '--hide-scrollbars', '--force-device-scale-factor=1',
  `${URL_BASE}/index.html`,
], { stdio: 'ignore' });

const errors = [];

async function getTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (p) return p;
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

// 每次检查都重新取元素状态
const PROBE = (ids) => `(() => {
  const out = {};
  const names = ${JSON.stringify(ids)};
  for (const id of names) {
    const el = document.getElementById(id);
    if (!el) { out[id] = 'MISSING'; continue; }
    const cs = getComputedStyle(el);
    const visible = typeof el.checkVisibility === 'function'
      ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
      : cs.display !== 'none';
    out[id] = { hiddenAttr: el.hidden, display: cs.display, visible };
  }
  return out;
})()`;

try {
  const target = await getTarget();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
  });

  await rpc(ws, 'Runtime.enable', {});
  await sleep(3000);

  const ids = ['intro', 'stage', 'sheet', 'tourbar', 'loader', 'toast'];

  console.log('== 首屏状态（期望：intro 可见，stage/sheet/tourbar 不可见）==');
  console.log(JSON.stringify((await evalJS(ws, PROBE(ids))).value, null, 1));

  // 点开始游览
  const afterStart = await evalJS(ws, `(async () => {
    document.getElementById('btnStart').click();
    await new Promise(r => setTimeout(r, 9000));
    return 1;
  })()`);
  void afterStart;
  console.log('== 点「开始游览」后（期望：stage 可见，sheet/tourbar 不可见）==');
  console.log(JSON.stringify((await evalJS(ws, PROBE(ids))).value, null, 1));

  // 打开讲解库
  await evalJS(ws, `(()=>{document.getElementById('btnLibrary').click();return 1})()`);
  await sleep(600);
  console.log('== 点「讲解库」后（期望：sheet 可见）==');
  console.log(JSON.stringify((await evalJS(ws, PROBE(ids))).value, null, 1));

  // 关闭讲解库
  await evalJS(ws, `(()=>{document.getElementById('btnSheetClose').click();return 1})()`);
  await sleep(600);
  console.log('== 点「关闭」后（期望：sheet 不可见）==');
  console.log(JSON.stringify((await evalJS(ws, PROBE(ids))).value, null, 1));

  // 全景画布尺寸（确认游览图占满）
  const canvas = await evalJS(ws, `(()=>{
    const c = document.querySelector('#viewer canvas');
    const r = c ? c.getBoundingClientRect() : null;
    return { canvas: !!c, w: r ? Math.round(r.width) : 0, h: r ? Math.round(r.height) : 0,
             sceneName: document.getElementById('sceneName').textContent };
  })()`);
  console.log('== 全景画布 ==');
  console.log(JSON.stringify(canvas.value, null, 1));

  console.log('== JS 异常 ==');
  console.log(errors.length ? errors.join('\n') : '(无)');

  ws.close();
} catch (e) {
  console.log('FAILED', e.message);
  process.exitCode = 1;
} finally {
  child.kill('SIGKILL');
  await sleep(500);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}