/**
 * 验证讲解库的音频绑定功能
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9345;
const URL_BASE = process.argv[2] || 'http://127.0.0.1:8123';
const profile = path.join(os.tmpdir(), `mx-binding-${Date.now()}`);
let nextId = 1;

const child = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
  '--window-size=1440,900', '--hide-scrollbars',
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

  // 打开讲解库，检查结构
  const lib = await evalJS(ws, `(()=>{
    document.getElementById('btnLibrary').click();
    const items = [...document.querySelectorAll('#sheetList .lib-item')];
    const data = items.map(li => ({
      name: li.querySelector('strong').textContent,
      status: li.querySelector('.lib-item__status').textContent,
      options: li.querySelectorAll('select option').length,
      selected: li.querySelector('select').value,
    }));
    return {
      count: items.length,
      hasExport: !!document.querySelector('.lib-foot button'),
      footButtons: [...document.querySelectorAll('.lib-foot button')].map(b=>b.textContent),
      items: data,
    };
  })()`);

  // 把「尚德堂」绑定到「南院楼群」（2180）
  const bindResult = await evalJS(ws, `(()=>{
    const items = [...document.querySelectorAll('#sheetList .lib-item')];
    const target = items.find(li => li.querySelector('strong').textContent === '尚德堂');
    if (!target) return { error: 'item not found' };
    const sel = target.querySelector('select');
    sel.value = '2180';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    const after = [...document.querySelectorAll('#sheetList .lib-item')]
      .find(li => li.querySelector('strong').textContent === '尚德堂');
    const stored = localStorage.getItem('mingxian-tour-bindings-v1');
    return {
      statusAfter: after.querySelector('.lib-item__status').textContent,
      selectedAfter: after.querySelector('select').value,
      stored,
    };
  })()`);

  // 检查该场景是否真的拿到了音频（场景条圆点 + 进入后 audio 标签）
  const sceneCheck = await evalJS(ws, `(async()=>{
    document.getElementById('btnSheetClose').click();
    document.getElementById('btnStart').click();
    await new Promise(r=>setTimeout(r,8000));
    // 跳到第 13 处（南院楼群 2180）
    const chips = [...document.querySelectorAll('#strip .chip')];
    const idx = chips.findIndex(c => c.textContent.includes('南院楼群'));
    chips[idx].click();
    await new Promise(r=>setTimeout(r,7000));
    return {
      chipIndex: idx,
      sceneName: document.getElementById('sceneName').textContent,
      audioLabel: document.getElementById('audioLabel').textContent,
      playDisabled: document.getElementById('btnPlay').disabled,
      chipHasDot: chips[idx].querySelector('.chip__dot') !== null,
    };
  })()`);

  // 恢复默认
  const resetResult = await evalJS(ws, `(()=>{
    document.getElementById('btnLibrary').click();
    const btns = [...document.querySelectorAll('.lib-foot button')];
    const reset = btns.find(b => b.textContent.includes('恢复默认'));
    reset.click();
    const items = [...document.querySelectorAll('#sheetList .lib-item')];
    const sd = items.find(li => li.querySelector('strong').textContent === '尚德堂');
    return { status: sd.querySelector('.lib-item__status').textContent, stored: localStorage.getItem('mingxian-tour-bindings-v1') };
  })()`);

  console.log('== 讲解库结构 ==');
  console.log(JSON.stringify(lib.value, null, 1));
  console.log('== 绑定尚德堂 -> 南院楼群 ==');
  console.log(JSON.stringify(bindResult.value, null, 1));
  console.log('== 该场景是否生效 ==');
  console.log(JSON.stringify(sceneCheck.value, null, 1));
  console.log('== 恢复默认 ==');
  console.log(JSON.stringify(resetResult.value, null, 1));
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