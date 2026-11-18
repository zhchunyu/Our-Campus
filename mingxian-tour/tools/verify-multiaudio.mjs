/**
 * 多段配音验证：
 *  - 崇圣楼应有两段（崇圣楼 / 尚德堂）
 *  - 播放器标签显示 "配音 1/2 · 崇圣楼"，切段后变 "配音 2/2 · 尚德堂"
 *  - 场景条徽章显示段数
 *  - 讲解库 8 段指派状态正确
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9355;
const URL_BASE = process.argv[2] || 'http://127.0.0.1:8123';
const profile = path.join(os.tmpdir(), `mx-audio-${Date.now()}`);
let nextId = 1;
const errors = [];

const child = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
  '--window-size=1440,900', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required',
  `${URL_BASE}/index.html`,
], { stdio: 'ignore' });

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

  // 场景条徽章
  const badges = await evalJS(ws, `(() => {
    const chips = [...document.querySelectorAll('#strip .chip')];
    return chips.map(c => ({
      name: c.querySelector('.chip__name').textContent.trim(),
      badge: (c.querySelector('.chip__badge') || {}).textContent || ''
    })).filter(x => x.badge !== '' || /崇圣楼|校长院|石板院|观赏楼|宣传统战部|南院楼群|党政办/.test(x.name));
  })()`);
  console.log('== 有配音的场景条徽章（数字=段数）==');
  console.log(JSON.stringify(badges.value, null, 1));

  // 进入并跳到崇圣楼（第 4 处）
  const shenglou = await evalJS(ws, `(async () => {
    document.getElementById('btnStart').click();
    await new Promise(r => setTimeout(r, 9000));
    const chips = [...document.querySelectorAll('#strip .chip')];
    const idx = chips.findIndex(c => c.textContent.includes('崇圣楼'));
    chips[idx].click();
    await new Promise(r => setTimeout(r, 8000));
    return {
      sceneName: document.getElementById('sceneName').textContent,
      audioLabel: document.getElementById('audioLabel').textContent,
      nextDisabled: document.getElementById('btnAudioNext').disabled,
      playDisabled: document.getElementById('btnPlay').disabled,
    };
  })()`);
  console.log('== 崇圣楼（应有两段）==');
  console.log(JSON.stringify(shenglou.value, null, 1));

  // 切到第 2 段
  const second = await evalJS(ws, `(async () => {
    document.getElementById('btnAudioNext').click();
    await new Promise(r => setTimeout(r, 4000));
    return {
      audioLabel: document.getElementById('audioLabel').textContent,
      fill: document.getElementById('audioFill').style.width,
    };
  })()`);
  console.log('== 点「下一段」后（应为 2/2 尚德堂）==');
  console.log(JSON.stringify(second.value, null, 1));

  // 单段场景对照：校长院
  const single = await evalJS(ws, `(async () => {
    const chips = [...document.querySelectorAll('#strip .chip')];
    const idx = chips.findIndex(c => c.textContent.includes('校长院'));
    chips[idx].click();
    await new Promise(r => setTimeout(r, 7000));
    return {
      sceneName: document.getElementById('sceneName').textContent,
      audioLabel: document.getElementById('audioLabel').textContent,
      nextDisabled: document.getElementById('btnAudioNext').disabled,
    };
  })()`);
  console.log('== 校长院（应只有 1 段，下一段按钮禁用）==');
  console.log(JSON.stringify(single.value, null, 1));

  // 讲解库
  const lib = await evalJS(ws, `(() => {
    document.getElementById('btnLibrary').click();
    const items = [...document.querySelectorAll('#sheetList .lib-item')];
    return items.map(li => ({
      name: li.querySelector('strong').textContent,
      status: li.querySelector('.lib-item__status').textContent,
    }));
  })()`);
  console.log('== 讲解库 8 段指派状态 ==');
  console.log(JSON.stringify(lib.value, null, 1));

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