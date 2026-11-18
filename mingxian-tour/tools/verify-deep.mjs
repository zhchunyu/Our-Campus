/**
 * 深度验证：
 *  1) 网络层是否有失败请求
 *  2) 有配音场景的音频是否加载（src / duration）
 *  3) 自动巡游能否启动与推进
 *  4) 截屏，供像素分析确认全景确实渲染
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
const PORT = 9334;
const URL_BASE = process.argv[2] || 'http://127.0.0.1:8123';
const profile = path.join(os.tmpdir(), `mx-edge-p2-${Date.now()}`);

const child = spawn(EDGE, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
  '--window-size=1440,900', '--hide-scrollbars',
  `${URL_BASE}/index.html`,
], { stdio: 'ignore' });

const errors = [];
const failedRequests = [];
let nextId = 1;

async function getTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch { /* retry */ }
    await sleep(400);
  }
  throw new Error('CDP target not found');
}

function rpc(ws, method, params) {
  const id = nextId++;
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
    setTimeout(() => reject(new Error(`timeout ${method}`)), 40000);
  });
}

async function evalJS(ws, expression) {
  const r = await rpc(ws, 'Runtime.evaluate', {
    expression, awaitPromise: true, returnByValue: true, userGesture: true,
  });
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
    const msg = JSON.parse(ev.data);
    if (msg.method === 'Runtime.exceptionThrown') {
      errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
    }
    if (msg.method === 'Network.loadingFailed') {
      failedRequests.push(`${msg.params.type} ${msg.params.errorText}`);
    }
    if (msg.method === 'Network.responseReceived') {
      const s = msg.params.response.status;
      if (s >= 400) failedRequests.push(`HTTP ${s} ${msg.params.response.url}`);
    }
  });

  await rpc(ws, 'Runtime.enable', {});
  await rpc(ws, 'Network.enable', {});
  await rpc(ws, 'Page.enable', {});
  await sleep(3000);

  // 进入游览
  await evalJS(ws, `(async()=>{document.getElementById('btnStart').click();await new Promise(r=>setTimeout(r,9000));return 1})()`);

  // 跳到第 3 处（校长院，应有配音）
  const audioScene = await evalJS(ws, `(async()=>{
    document.querySelectorAll('#strip .chip')[2].click();
    await new Promise(r=>setTimeout(r,8000));
    const a = document._probeAudio || null;
    const aud = document.querySelector('audio') || null;
    return {
      sceneName: document.getElementById('sceneName').textContent,
      audioLabel: document.getElementById('audioLabel').textContent,
      playDisabled: document.getElementById('btnPlay').disabled,
      audioSrcTag: aud ? aud.currentSrc || aud.src : '(<audio> not in DOM)',
    };
  })()`);

  // 通过页面里的 audio 元素状态判断（main.js 用 new Audio()，不在 DOM）
  const audioState = await evalJS(ws, `(async()=>{
    const btn = document.getElementById('btnPlay');
    btn.click();                      // 播放
    await new Promise(r=>setTimeout(r,2500));
    const playing = document.getElementById('btnPlay').textContent.trim() !== '▶';
    const fill = document.getElementById('audioFill').style.width;
    btn.click();                      // 暂停
    return { playing, fill };
  })()`);

  // 自动巡游
  const tour = await evalJS(ws, `(async()=>{
    document.getElementById('btnTourRun').click();
    await new Promise(r=>setTimeout(r,4000));
    const barHidden = document.getElementById('tourbar').hidden;
    const label = document.getElementById('btnTourRun').textContent;
    document.getElementById('btnTourStop').click();
    await new Promise(r=>setTimeout(r,800));
    return { barHidden, label, afterHidden: document.getElementById('tourbar').hidden };
  })()`);

  // 截图
  const shot = await rpc(ws, 'Page.captureScreenshot', { format: 'png' });
  await mkdir(join(HERE, '_out'), { recursive: true });
  const shotPath = join(HERE, '_out', 'stage.png');
  await writeFile(shotPath, Buffer.from(shot.data, 'base64'));

  console.log('== 有配音场景（校长院）==');
  console.log(JSON.stringify(audioScene, null, 1));
  console.log('== 播放按钮交互 ==');
  console.log(JSON.stringify(audioState, null, 1));
  console.log('== 自动巡游 ==');
  console.log(JSON.stringify(tour, null, 1));
  console.log('== 失败请求 ==');
  console.log(failedRequests.length ? failedRequests.join('\n') : '(无)');
  console.log('== JS 异常 ==');
  console.log(errors.length ? errors.join('\n---\n') : '(无)');
  console.log('== 截图 ==');
  console.log(shotPath);

  ws.close();
} catch (err) {
  console.log('FAILED:', err.message);
  process.exitCode = 1;
} finally {
  child.kill('SIGKILL');
  await sleep(600);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}