/**
 * 检查 GPU 后端差异 + PSV 纹理数据是否真正加载
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL_BASE = process.argv[2] || 'http://127.0.0.1:8123';
const PORT = Number(process.argv[3] || 9336);
const GL = process.argv[4] || 'swiftshader';

const profile = path.join(os.tmpdir(), `mx-edge-gl-${GL}-${Date.now()}`);
let nextId = 1;

const glArgs = GL === 'swiftshader'
  ? ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'];

const child = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  ...glArgs,
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
  await sleep(2500);

  await evalJS(ws, `(async()=>{document.getElementById('btnStart').click();await new Promise(r=>setTimeout(r,11000));return 1})()`);

  const info = await evalJS(ws, `(()=>{
    const v = window.__tourViewer;
    const out = { hasViewer: !!v };
    if (v) {
      const td = v.textureData;
      out.textureData = td ? { width: td.width, height: td.height, isCanvas: !!td.canvas } : null;
      try { out.state = JSON.parse(JSON.stringify(v.state || {})); } catch(e) { out.stateErr = String(e); }
      try { out.panorama = v.getPanorama ? String(v.getPanorama()).slice(0,80) : null; } catch(e) { out.panoErr = String(e); }
      try {
        const gpu = v.renderer?.getContext?.() || null;
        if (gpu) {
          const dbg = gpu.getExtension('WEBGL_debug_renderer_info');
          out.renderer = dbg ? gpu.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown';
        }
      } catch(e) { out.rendererErr = String(e); }
    }
    // 读 canvas 像素（若可读）
    try {
      const c = document.querySelector('#viewer canvas');
      if (c) {
        const t = document.createElement('canvas');
        t.width = 200; t.height = 120;
        const ctx = t.getContext('2d');
        ctx.drawImage(c, 0, 0, 200, 120);
        const d = ctx.getImageData(0,0,200,120).data;
        let sum=0, n=0, min=255, max=0;
        for (let i=0;i<d.length;i+=4){ const l=d[i]*0.299+d[i+1]*0.587+d[i+2]*0.114; sum+=l; n++; if(l<min)min=l; if(l>max)max=l; }
        out.canvasPixels = { mean: +(sum/n).toFixed(1), min, max };
      }
    } catch(e) { out.pixelErr = String(e); }
    return out;
  })()`);

  console.log(`== GL backend: ${GL} ==`);
  console.log(JSON.stringify(info.value, null, 1));

  ws.close();
} catch (e) {
  console.log('FAILED', e.message);
  process.exitCode = 1;
} finally {
  child.kill('SIGKILL');
  await sleep(500);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}