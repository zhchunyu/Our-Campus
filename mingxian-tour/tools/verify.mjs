/**
 * 用 CDP 验证游览页是否正常运行：
 *  - 是否有 JS 异常 / console.error
 *  - importmap 是否解析成功（PSV 是否加载）
 *  - 点击「开始游览」后 viewer 是否创建、场景是否切换
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9333;
const URL_BASE = process.argv[2] || 'http://127.0.0.1:8123';

const profile = path.join(os.tmpdir(), `mx-edge-prof-${Date.now()}`);

const child = spawn(EDGE, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--enable-unsafe-swiftshader',
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--window-size=1440,900',
  '--hide-scrollbars',
  `${URL_BASE}/index.html`,
], { stdio: 'ignore' });

const errors = [];
const logs = [];

async function getTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch { /* not ready */ }
    await sleep(400);
  }
  throw new Error('CDP target not found');
}

function rpc(ws, id, method, params) {
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    const onMsg = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id === id) {
        ws.removeEventListener('message', onMsg);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      }
    };
    ws.addEventListener('message', onMsg);
    setTimeout(() => reject(new Error(`rpc timeout: ${method}`)), 30000);
  });
}

let nextId = 1;

async function evalJS(ws, expression, awaitPromise = true) {
  const r = await rpc(ws, nextId++, 'Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
    userGesture: true,
  });
  if (r.exceptionDetails) {
    return { error: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
  }
  return { value: r.result?.value };
}

try {
  const target = await getTarget();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });

  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.method === 'Runtime.exceptionThrown') {
      errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ');
      if (msg.params.type === 'error') errors.push(text);
      else logs.push(`[${msg.params.type}] ${text}`);
    }
  });

  await rpc(ws, nextId++, 'Runtime.enable', {});
  await rpc(ws, nextId++, 'Log.enable', {});
  await sleep(3500);

  // 1) 基础结构
  const structure = await evalJS(ws, `(() => ({
    hasStart: !!document.getElementById('btnStart'),
    chips: document.querySelectorAll('#strip .chip').length,
    libItems: document.querySelectorAll('#sheetList li').length,
    introBg: !!document.getElementById('introMedia').style.backgroundImage,
    stageHidden: document.getElementById('stage').hidden,
  }))()`);

  // 2) 点击开始，等待全景加载
  const click = await evalJS(ws, `(async () => {
    document.getElementById('btnStart').click();
    await new Promise(r => setTimeout(r, 9000));
    return {
      stageHidden: document.getElementById('stage').hidden,
      sceneName: document.getElementById('sceneName').textContent,
      sceneIndex: document.getElementById('sceneIndex').textContent,
      loaderHidden: document.getElementById('loader').hidden,
      activeChip: (document.querySelector('.chip--active .chip__name')||{}).textContent || '',
      canvasCount: document.querySelectorAll('#viewer canvas').length,
      audioLabel: document.getElementById('audioLabel').textContent,
      psvPresent: typeof window.PhotoSphereViewer,
    };
  })()`);

  // 3) 切到下一个场景
  const afterNext = await evalJS(ws, `(async () => {
    document.getElementById('btnNext').click();
    await new Promise(r => setTimeout(r, 7000));
    return {
      sceneName: document.getElementById('sceneName').textContent,
      sceneIndex: document.getElementById('sceneIndex').textContent,
      audioLabel: document.getElementById('audioLabel').textContent,
      canvasCount: document.querySelectorAll('#viewer canvas').length,
    };
  })()`);

  console.log('== 结构 ==');
  console.log(JSON.stringify(structure, null, 1));
  console.log('== 点击开始后 ==');
  console.log(JSON.stringify(click, null, 1));
  console.log('== 点下一处后 ==');
  console.log(JSON.stringify(afterNext, null, 1));
  console.log('== console.error / 异常 ==');
  console.log(errors.length ? errors.join('\n---\n') : '(无)');
  console.log('== 其它 console 输出（前 15 条）==');
  console.log(logs.slice(0, 15).join('\n') || '(无)');

  ws.close();
} catch (err) {
  console.log('FAILED:', err.message);
  if (errors.length) console.log(errors.join('\n'));
  process.exitCode = 1;
} finally {
  child.kill('SIGKILL');
  await sleep(600);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}