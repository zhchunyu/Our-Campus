/**
 * app.js —— 主程序
 * ---------------------------------------------------------------
 * 校园实时态势地图 · 3D 原型
 * 场景 / 相机 / 交互 / UI 联动
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildCampus } from './campus.js';
import {
  EVENT_TYPES, typeOf, createMarker, makeEvent, randomEvent,
  runAIPipeline, AI_STEPS, TEMPLATES,
} from './events.js';
import {
  BUILDINGS, findBuilding, getBuildingNames,
  computeRoute, RouteRenderer,
  setAIConfig, AI_CONFIG,
} from './navigation.js';

/* CanvasRenderingContext2D.roundRect 兜底（旧内核） */
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    this.beginPath();
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
    return this;
  };
}

/* ================================================================
   1. 渲染器 / 场景 / 相机
================================================================ */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;   // PCFSoftShadowMap 已在 three r18x 移除
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05080f);
scene.fog = new THREE.Fog(0x05080f, 400, 950);

const camera = new THREE.PerspectiveCamera(
  50, window.innerWidth / window.innerHeight, 0.5, 2000
);
camera.position.set(0, 62, 400);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 6, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 40;
controls.maxDistance = 640;
controls.maxPolarAngle = Math.PI * 0.46;
controls.enabled = false;              // 开场动画期间禁用

/* 默认俯瞰机位（开场动画终点 / 「重置视角」按钮共用，避免两处写死不一致） */
const HOME_POS = new THREE.Vector3(178, 172, 262);
const HOME_TGT = new THREE.Vector3(0, 6, 0);

/* ================================================================
   2. 构建校园
================================================================ */
const campus = buildCampus(scene);

/* ================================================================
   3. 事件层
================================================================ */
const markerLayer = new THREE.Group();
scene.add(markerLayer);

const events = [];                     // 全部事件（按创建顺序）
const markers = new Map();             // id -> THREE.Group
let selectedId = null;

const hitTargets = [];                 // 用于射线拾取的碰撞体

/* ---- 统计 ---- */
const stats = { reports: 0, merged: 0, latencySum: 0, latencyN: 0 };
let online = 1240;

const $ = (id) => document.getElementById(id);
const el = {
  online: $('stat-online'),
  reports: $('stat-reports'),
  merged: $('stat-merged'),
  latency: $('stat-latency'),
  feedList: $('feed-list'),
  feedCount: $('feed-count'),
  detail: $('detail'),
  detailTitle: $('detail-title'),
  detailBody: $('detail-body'),
  detailClose: $('detail-close'),
  modal: $('modal'),
  pickPos: $('pick-pos'),
  typeGrid: $('type-grid'),
  reportText: $('report-text'),
  aiToast: $('ai-toast'),
  aiStep: $('ai-step'),
  loading: $('loading'),
  // 导航面板
  navPanel: $('nav-panel'),
  navClose: $('nav-close'),
  navFrom: $('nav-from'),
  navTo: $('nav-to'),
  navFromSuggest: $('nav-from-suggest'),
  navToSuggest: $('nav-to-suggest'),
  navGo: $('nav-go'),
  navResult: $('nav-result'),
  nriFrom: $('nri-from'),
  nriTo: $('nri-to'),
  nriDist: $('nri-dist'),
  nriTime: $('nri-time'),
  navFocus: $('nav-focus'),
  navClear: $('nav-clear'),
  navAiStatus: $('nav-ai-status'),
  navAiConfig: $('nav-ai-config'),
  // API 配置弹窗
  aiConfigModal: $('ai-config-modal'),
  aiApiKey: $('ai-api-key'),
  aiApiEndpoint: $('ai-api-endpoint'),
  aiApiModel: $('ai-api-model'),
  aiConfigSave: $('ai-config-save'),
  aiConfigCancel: $('ai-config-cancel'),
};

/* ================================================================
   4. AI 流程 + 打点
================================================================ */

/** 走一遍 AI 判断流程，然后在地图上打点 */
async function ingest(ev) {
  ev.status = 'analyzing';

  // —— 浮层逐步播放 AI 步骤
  el.aiToast.classList.remove('hidden');
  for (const step of AI_STEPS) {
    el.aiStep.textContent = `${step.label} · ${step.desc}`;
    await sleep(step.key === 'pub' ? 320 : 420);
  }
  el.aiToast.classList.add('hidden');

  // —— 计算 AI 结论
  const ai = runAIPipeline(ev, events);
  ev.ai = ai;
  ev.status = ai.duplicateOf ? 'merged' : 'published';

  // —— 打点
  const marker = createMarker(ev);
  markerLayer.add(marker);
  markers.set(ev.id, marker);
  marker.children.forEach((c) => { if (c.userData.eventId) hitTargets.push(c); });

  // —— 统计
  stats.reports += 1;
  if (ai.duplicateOf) stats.merged += 1;
  stats.latencySum += ai.latency;
  stats.latencyN += 1;
  refreshStats();

  renderFeed();
  if (selectedId === ev.id) renderDetail(ev);

  showTip(ai.duplicateOf
    ? `AI 判定与 ${ai.duplicateOf} 为同一事件，已合并`
    : `已发布 · 可信度 ${(ai.credibility * 100).toFixed(0)}%`);
}

function refreshStats() {
  el.online.textContent = online.toLocaleString();
  el.reports.textContent = stats.reports;
  el.merged.textContent = stats.merged;
  el.latency.textContent = stats.latencyN
    ? (stats.latencySum / stats.latencyN).toFixed(1) + 's'
    : '0.0s';
}

/**
 * 造一条事件并走完 AI 流程。
 * 有 35% 概率落在「已有事件」附近并沿用同一类型 —— 否则随机撒点几乎永远不会
 * 触发时空去重，演示里「AI 合并」会一直是 0，等于把去重这个卖点藏起来了。
 */
function spawnEvent(official = false) {
  let ev;
  if (events.length && Math.random() < 0.35) {
    const src = events[Math.floor(Math.random() * events.length)];
    const ang = Math.random() * Math.PI * 2;
    const dist = Math.random() * 26;
    const pool = TEMPLATES[src.type];
    ev = makeEvent({
      type: src.type,
      x: src.x + Math.cos(ang) * dist,
      z: src.z + Math.sin(ang) * dist,
      text: pool[Math.floor(Math.random() * pool.length)],
      place: src.place,
    });
  } else {
    ev = randomEvent(campus.anchors, official);
  }
  events.push(ev);
  ingest(ev);
  return ev;
}

/* ================================================================
   5. UI 渲染
================================================================ */
function fmtTime(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function renderFeed() {
  const list = [...events].reverse();
  el.feedCount.textContent = `${list.length} 条`;
  el.feedList.innerHTML = '';

  list.forEach((ev) => {
    const t = typeOf(ev.type);
    const li = document.createElement('li');
    li.className = 'feed-item';
    li.style.setProperty('--c', '#' + t.color.toString(16).padStart(6, '0'));
    li.dataset.id = ev.id;

    const statusTag = ev.status === 'merged'
      ? `<span style="color:#ffb020">已合并</span>`
      : !ev.ai
        ? `<span style="color:#8fa6c4">AI 分析中…</span>`
        : ev.official
          ? `<span style="color:#4dabff">官方源</span>`
          : `<span class="score">可信度 ${(ev.ai.credibility * 100).toFixed(0)}%</span>`;

    li.innerHTML = `
      <div class="fi-icon">${t.icon}</div>
      <div class="fi-main">
        <div class="fi-text">${escapeHtml(ev.text)}</div>
        <div class="fi-meta">
          <span>${ev.place}</span>
          <span>${fmtTime(ev.ts)}</span>
          ${statusTag}
        </div>
      </div>`;

    li.addEventListener('click', () => selectEvent(ev.id, true));
    el.feedList.appendChild(li);
  });
}

function renderDetail(ev) {
  if (!ev) { el.detail.classList.add('hidden'); return; }
  const t = typeOf(ev.type);
  const hex = '#' + t.color.toString(16).padStart(6, '0');
  // 事件可能还在 AI 分析中（ai 为 null），给出安全默认值而不是让页面崩掉
  const ai = ev.ai || {
    confidence: 0, credibility: 0, latency: 0, reach: 0,
    duplicateOf: null, reason: 'AI 正在分析…',
  };

  el.detail.classList.remove('hidden');
  el.detailTitle.textContent = `${t.icon} ${t.label}`;

  const steps = AI_STEPS.map((s) => {
    let val = '';
    if (s.key === 'class')  val = `${t.label} · 置信度 ${(ai.confidence * 100).toFixed(0)}%`;
    if (s.key === 'dedupe') val = ai.duplicateOf ? `命中重复：${ai.duplicateOf}` : '未发现重复上报';
    if (s.key === 'trust')  val = `可信度 ${(ai.credibility * 100).toFixed(0)}%`;
    if (s.key === 'pub')    val = `已推送 ${ai.reach} 名学生`;
    if (s.key === 'parse')  val = `地点「${ev.place}」· 紧急度自动判定`;
    return `<li><span class="tick">✓</span><span><b>${s.label}</b><br><span class="pv">${val}</span></span></li>`;
  }).join('');

  el.detailBody.innerHTML = `
    <div class="d-quote">${escapeHtml(ev.text)}</div>

    <div class="d-sec">
      <h4>基本信息</h4>
      <div class="d-row"><span class="k">事件编号</span><span class="v">${ev.id}</span></div>
      <div class="d-row"><span class="k">上报人</span><span class="v">${ev.reporter}</span></div>
      <div class="d-row"><span class="k">位置</span><span class="v">${ev.place}</span></div>
      <div class="d-row"><span class="k">上报时间</span><span class="v">${fmtTime(ev.ts)}</span></div>
      <div class="d-row"><span class="k">状态</span><span class="v" style="color:${hex}">${
        ev.status === 'merged' ? '已合并' : '已发布'}</span></div>
    </div>

    <div class="d-sec">
      <h4>AI 判断结果</h4>
      <div class="d-row"><span class="k">分类</span><span class="v" style="color:${hex}">${t.label}</span></div>
      <div class="d-row"><span class="k">判断依据</span><span class="v">${ai.reason || '—'}</span></div>
      <div style="margin-top:10px">
        <div style="display:flex;justify-content:space-between;font-size:11px;color:#8fa6c4">
          <span>可信度</span><span>${(ai.credibility * 100).toFixed(0)}%</span>
        </div>
        <div class="bar"><i style="width:${(ai.credibility * 100).toFixed(0)}%"></i></div>
      </div>
      <div style="margin-top:12px">
        <div style="display:flex;justify-content:space-between;font-size:11px;color:#8fa6c4">
          <span>响应耗时</span><span>${(ai.latency || 0).toFixed(1)}s</span>
        </div>
      </div>
    </div>

    <div class="d-sec">
      <h4>处理链路</h4>
      <ul class="pipe">${steps}</ul>
    </div>`;
}

/* ================================================================
   6. 选中 / 视角
================================================================ */
function selectEvent(id, fly = false) {
  selectedId = id;
  const ev = events.find((e) => e.id === id);
  if (!ev) return;
  renderDetail(ev);

  if (fly) {
    const target = new THREE.Vector3(ev.x, 8, ev.z);
    controls.target.lerp(target, 1);
    const dir = camera.position.clone().sub(target).normalize();
    const dest = target.clone().add(dir.multiplyScalar(120));
    dest.y = Math.max(dest.y, 60);
    animateCamera(dest, target, 900);
  }
}

let camAnim = null;
function animateCamera(toPos, toTarget, dur = 1000) {
  camAnim = {
    t0: performance.now(), dur,
    p0: camera.position.clone(), p1: toPos.clone(),
    t0v: controls.target.clone(), t1v: toTarget.clone(),
  };
}

/* ================================================================
   7. 交互：点击拾取
================================================================ */
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let picking = false;                   // 上报表单选点模式
let pickHandler = null;

canvas.addEventListener('pointerdown', (e) => {
  const r = canvas.getBoundingClientRect();
  ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);

  // —— 选点模式：射线打到地面
  if (picking) {
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, hit)) {
      if (pickHandler) pickHandler(hit.x, hit.z);
    }
    return;
  }

  // —— 常规模式：拾取标记
  const hits = raycaster.intersectObjects(hitTargets, false);
  if (hits.length) {
    const id = hits[0].object.userData.eventId;
    selectEvent(id, true);
  } else {
    selectedId = null;
    el.detail.classList.add('hidden');
  }
});

/* ================================================================
   8. 上报流程
================================================================ */
let pendingType = 'traffic';
let pendingPos = null;

function buildTypeGrid() {
  el.typeGrid.innerHTML = '';
  EVENT_TYPES.forEach((t) => {
    const b = document.createElement('div');
    b.className = 'type-btn' + (t.key === pendingType ? ' on' : '');
    b.style.setProperty('--c', '#' + t.color.toString(16).padStart(6, '0'));
    b.textContent = `${t.icon} ${t.label}`;
    b.addEventListener('click', () => {
      pendingType = t.key;
      [...el.typeGrid.children].forEach((c) => c.classList.remove('on'));
      b.classList.add('on');
      // 自动填充一条示例描述，降低演示门槛
      const list = TEMPLATES[t.key];
      el.reportText.value = list[Math.floor(Math.random() * list.length)];
    });
    el.typeGrid.appendChild(b);
  });
}

$('btn-report').addEventListener('click', () => {
  pendingPos = null;
  el.pickPos.textContent = '未选择（点击地图选点）';
  el.pickPos.classList.remove('set');
  el.reportText.value = '';
  el.modal.classList.remove('hidden');

  // 打开选点模式
  picking = true;
  pickHandler = (x, z) => {
    pendingPos = { x, z };
    const near = nearestAnchor(x, z);
    el.pickPos.textContent = `${near.name}附近  (${x.toFixed(0)}, ${z.toFixed(0)})`;
    el.pickPos.classList.add('set');
  };
  showTip('请在地图上点击选择位置');
});

$('modal-cancel').addEventListener('click', closeModal);
function closeModal() {
  el.modal.classList.add('hidden');
  picking = false;
  pickHandler = null;
}

$('modal-submit').addEventListener('click', () => {
  const text = el.reportText.value.trim() || TEMPLATES[pendingType][0];
  let pos = pendingPos;
  if (!pos) {
    const a = campus.anchors[Math.floor(Math.random() * campus.anchors.length)];
    pos = { x: a.x, z: a.z };
  }
  const near = nearestAnchor(pos.x, pos.z);

  const ev = makeEvent({
    type: pendingType, x: pos.x, z: pos.z, text,
    place: near.name, reporter: '我',
  });
  closeModal();
  events.push(ev);
  ingest(ev);
});

function nearestAnchor(x, z) {
  let best = campus.anchors[0];
  let bd = Infinity;
  campus.anchors.forEach((a) => {
    const d = Math.hypot(a.x - x, a.z - z);
    if (d < bd) { bd = d; best = a; }
  });
  return best;
}

/* ================================================================
   9. 自动演示
================================================================ */
let autoTimer = null;
let autoOn = false;

$('btn-play').addEventListener('click', () => {
  autoOn = !autoOn;
  $('btn-play').textContent = autoOn ? '⏸ 暂停演示' : '▶ 自动演示';
  if (autoOn) {
    autoTimer = setInterval(() => {
      // 每 4 条里插 1 条官方来源，体现「官方渠道 + UGC」双流
      spawnEvent(stats.reports % 4 === 3);
    }, 4200);
  } else {
    clearInterval(autoTimer);
  }
});

$('btn-reset').addEventListener('click', () => {
  animateCamera(HOME_POS.clone(), HOME_TGT.clone(), 1100);
});

el.detailClose.addEventListener('click', () => {
  selectedId = null;
  el.detail.classList.add('hidden');
});

/* ================================================================
   10. 提示条
================================================================ */
let tipEl = null;
let tipTimer = null;
function showTip(msg) {
  if (tipEl) tipEl.remove();
  clearTimeout(tipTimer);
  tipEl = document.createElement('div');
  tipEl.id = 'toast-tip';
  tipEl.textContent = msg;
  document.body.appendChild(tipEl);
  tipTimer = setTimeout(() => { tipEl && tipEl.remove(); tipEl = null; }, 2600);
}

/* ================================================================
   11. 开场动画
================================================================ */
const intro = {
  t0: performance.now(),
  dur: 4200,
  p0: new THREE.Vector3(0, 62, 400),
  p1: HOME_POS.clone(),
  t0v: new THREE.Vector3(0, 20, 0),
  t1v: HOME_TGT.clone(),
  done: false,
};

const easeInOut = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

let bootEventCount = 1;                // 首屏自动播报条数（调试参数可关掉）

/* ----------------------------------------------------------------
   调试入口：用 URL 参数直接指定机位，便于自动化截图核查地标细节
     ?cam=0,40,120&tgt=0,15,0   指定相机与视点
     ?nointro=1                 跳过开场动画
     ?auto=1                    自动开始演示
     ?events=3                  预置 N 条事件
---------------------------------------------------------------- */
(function debugBoot() {
  const q = new URLSearchParams(location.search);
  const num3 = (s, fallback) => {
    const v = String(s).split(',').map(Number);
    return v.length === 3 && v.every((n) => Number.isFinite(n)) ? v : fallback;
  };

  const cam = num3(q.get('cam'), null);
  const tgt = num3(q.get('tgt'), null);

  if (cam) {
    camera.position.set(cam[0], cam[1], cam[2]);
    intro.p0.copy(camera.position);
    intro.p1.copy(camera.position);
  }
  if (tgt) {
    controls.target.set(tgt[0], tgt[1], tgt[2]);
    intro.t0v.copy(controls.target);
    intro.t1v.copy(controls.target);
  }
  if (cam || tgt || q.has('nointro')) intro.dur = 1;

  const preset = Number(q.get('events'));
  if (Number.isFinite(preset) && preset > 0) {
    bootEventCount = 0;                  // 交由预置事件填充首屏
    setTimeout(() => {
      for (let i = 0; i < preset; i++) spawnEvent(i === preset - 1);
    }, 950);
  }
  if (q.get('auto') === '1') setTimeout(() => $('btn-play').click(), 1200);
})();

/* ================================================================
   12. AI 导航功能
================================================================ */
let routeRenderer = null;
let currentRoute = null;

/** 初始化导航 */
function initNavigation() {
  routeRenderer = new RouteRenderer(scene);

  // —— 收起/展开面板 ——
  el.navClose.addEventListener('click', () => {
    el.navPanel.classList.toggle('collapsed');
    el.navClose.textContent = el.navPanel.classList.contains('collapsed') ? '□' : '—';
  });

  // —— 输入框自动补全 ——
  setupAutocomplete(el.navFrom, el.navFromSuggest);
  setupAutocomplete(el.navTo, el.navToSuggest);

  // —— 开始导航 ——
  el.navGo.addEventListener('click', handleNavigate);

  // —— 回车触发导航 ——
  el.navTo.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleNavigate();
  });
  el.navFrom.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') el.navTo.focus();
  });

  // —— 聚焦路径 ——
  el.navFocus.addEventListener('click', () => {
    if (!currentRoute) return;
    focusOnRoute(currentRoute);
  });

  // —— 清除路径 ——
  el.navClear.addEventListener('click', clearRoute);

  // —— AI 配置 ——
  el.navAiConfig.addEventListener('click', openAIConfig);
  el.aiConfigCancel.addEventListener('click', closeAIConfig);
  el.aiConfigSave.addEventListener('click', saveAIConfig);

  // 从 localStorage 读取已保存的配置
  loadAIConfig();
  updateAIStatus();
}

/** 自动补全 */
function setupAutocomplete(input, suggestBox) {
  let activeIndex = -1;
  const allNames = getBuildingNames();

  input.addEventListener('input', () => {
    const val = input.value.trim().toLowerCase();
    if (!val) {
      suggestBox.classList.add('hidden');
      return;
    }
    const matches = BUILDINGS.filter((b) =>
      b.name.toLowerCase().includes(val)
    ).slice(0, 8);

    if (matches.length === 0) {
      suggestBox.classList.add('hidden');
      return;
    }

    activeIndex = -1;
    suggestBox.innerHTML = matches.map((b, i) => `
      <div class="suggest-item" data-name="${b.name}" data-idx="${i}">
        <span>${b.name}</span>
        <span class="si-type">${typeLabel(b.type)}</span>
      </div>
    `).join('');
    suggestBox.classList.remove('hidden');

    // 绑定点击事件
    suggestBox.querySelectorAll('.suggest-item').forEach((item) => {
      item.addEventListener('click', () => {
        input.value = item.dataset.name;
        suggestBox.classList.add('hidden');
      });
    });
  });

  // 键盘导航
  input.addEventListener('keydown', (e) => {
    const items = suggestBox.querySelectorAll('.suggest-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
      updateActive(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      updateActive(items);
    } else if (e.key === 'Escape') {
      suggestBox.classList.add('hidden');
    }
  });

  function updateActive(items) {
    items.forEach((it, i) => it.classList.toggle('active', i === activeIndex));
    if (activeIndex >= 0 && items[activeIndex]) {
      input.value = items[activeIndex].dataset.name;
    }
  }

  // 点击外部关闭
  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !suggestBox.contains(e.target)) {
      suggestBox.classList.add('hidden');
    }
  });
}

/** 建筑类型中文标签 */
function typeLabel(type) {
  const map = {
    landmark: '地标', teach: '教学楼', admin: '行政',
    canteen: '食堂', dorm: '宿舍',
  };
  return map[type] || type;
}

/** 执行导航 */
async function handleNavigate() {
  const fromName = el.navFrom.value.trim();
  const toName = el.navTo.value.trim();

  if (!fromName) { showTip('请输入起点'); el.navFrom.focus(); return; }
  if (!toName)   { showTip('请输入终点'); el.navTo.focus(); return; }

  const fromB = findBuilding(fromName);
  const toB = findBuilding(toName);

  if (!fromB) { showTip(`找不到大楼：${fromName}`); return; }
  if (!toB)   { showTip(`找不到大楼：${toName}`); return; }
  if (fromB.name === toB.name) { showTip('起点和终点不能相同'); return; }

  // 自动补全修正后的名称
  el.navFrom.value = fromB.name;
  el.navTo.value = toB.name;

  // 显示 AI 处理状态
  showAIToast('路径规划中…', '正在计算最优路线');

  try {
    const route = await computeRoute(fromB.name, toB.name);
    currentRoute = route;
    routeRenderer.showRoute(route);

    // 更新结果面板
    el.nriFrom.textContent = route.from.name;
    el.nriTo.textContent = route.to.name;
    el.nriDist.textContent = route.distance.toFixed(0) + ' 米';
    // 按 1.2 m/s 的步行速度估算时间
    const minutes = Math.ceil(route.distance / 1.2 / 60);
    el.nriTime.textContent = `约 ${minutes} 分钟`;
    el.navResult.classList.remove('hidden');

    // 自动聚焦路径
    focusOnRoute(route);

    hideAIToast();
    showTip(`已规划路线：${route.from.name} → ${route.to.name}`);
  } catch (e) {
    hideAIToast();
    showTip('导航失败：' + e.message);
  }
}

/** 相机聚焦到路径 */
function focusOnRoute(route) {
  const { from, to, points } = route;

  // 计算路径中心点
  let cx = 0, cz = 0;
  points.forEach((p) => { cx += p.x; cz += p.z; });
  cx /= points.length;
  cz /= points.length;

  // 计算合适的视距
  const dist = Math.hypot(from.x - to.x, from.z - to.z);
  const height = Math.max(80, dist * 0.9);
  const camDist = Math.max(120, dist * 1.2);

  const target = new THREE.Vector3(cx, 6, cz);
  const camPos = new THREE.Vector3(cx + camDist * 0.4, height, cz + camDist * 0.6);

  animateCamera(camPos, target, 1000);
}

/** 清除路径 */
function clearRoute() {
  if (routeRenderer) routeRenderer.clear();
  currentRoute = null;
  el.navResult.classList.add('hidden');
}

/** 显示 AI 处理浮层 */
function showAIToast(title, step) {
  el.aiToast.classList.remove('hidden');
  el.aiToast.querySelector('b').textContent = title;
  el.aiStep.textContent = step;
}

function hideAIToast() {
  el.aiToast.classList.add('hidden');
}

/* ---- AI 配置相关 ---- */
function openAIConfig() {
  el.aiApiKey.value = AI_CONFIG.apiKey || '';
  el.aiApiEndpoint.value = AI_CONFIG.endpoint || '';
  el.aiApiModel.value = AI_CONFIG.model || '';
  el.aiConfigModal.classList.remove('hidden');
}

function closeAIConfig() {
  el.aiConfigModal.classList.add('hidden');
}

function saveAIConfig() {
  const apiKey = el.aiApiKey.value.trim();
  const endpoint = el.aiApiEndpoint.value.trim();
  const model = el.aiApiModel.value.trim();

  if (!apiKey) { showTip('请输入 API Key'); return; }

  setAIConfig({ apiKey, endpoint, model });

  // 保存到 localStorage
  try {
    localStorage.setItem('shanhe_ai_config', JSON.stringify({
      apiKey, endpoint, model,
    }));
  } catch (e) { /* 忽略存储错误 */ }

  updateAIStatus();
  closeAIConfig();
  showTip(AI_CONFIG.enabled ? 'AI 已启用' : '配置已保存');
}

function loadAIConfig() {
  try {
    const saved = localStorage.getItem('shanhe_ai_config');
    if (saved) {
      const cfg = JSON.parse(saved);
      setAIConfig(cfg);
    }
  } catch (e) { /* 忽略 */ }
}

function updateAIStatus() {
  if (AI_CONFIG.enabled) {
    el.navAiStatus.textContent = '已启用';
    el.navAiStatus.classList.add('on');
  } else {
    el.navAiStatus.textContent = '未启用';
    el.navAiStatus.classList.remove('on');
  }
}

/* ================================================================
   13. 主循环
================================================================ */
const T0 = performance.now();
let onlineTimer = 0;

function tick() {
  requestAnimationFrame(tick);
  const now = performance.now();
  const t = (now - T0) / 1000;          // 秒；不再依赖已废弃的 THREE.Clock

  // —— 开场动画
  if (!intro.done) {
    const k = Math.min(1, (now - intro.t0) / intro.dur);
    const e = easeInOut(k);
    camera.position.lerpVectors(intro.p0, intro.p1, e);
    controls.target.lerpVectors(intro.t0v, intro.t1v, e);
    if (k >= 1) {
      intro.done = true;
      controls.enabled = true;
    }
  } else if (camAnim) {
    // —— 点击定位动画
    const k = Math.min(1, (now - camAnim.t0) / camAnim.dur);
    const e = easeInOut(k);
    camera.position.lerpVectors(camAnim.p0, camAnim.p1, e);
    controls.target.lerpVectors(camAnim.t0v, camAnim.t1v, e);
    if (k >= 1) camAnim = null;
  }

  controls.update();
  campus.update(t);

  // —— 导航路径动画 ——
  if (routeRenderer) routeRenderer.update(t);

  // —— 标记动画
  markers.forEach((m, id) => m.userData.update(t, id === selectedId));

  // —— 在线人数轻微波动
  onlineTimer += 1;
  if (onlineTimer > 120) {
    onlineTimer = 0;
    online = Math.max(900, online + Math.round((Math.random() - 0.45) * 26));
    refreshStats();
  }

  renderer.render(scene, camera);
}

/* ================================================================
   14. 启动
================================================================ */
buildTypeGrid();
refreshStats();
initNavigation();
tick();

setTimeout(() => {
  el.loading.classList.add('done');
  setTimeout(() => el.loading.remove(), 700);
  // 开场后自动跑一条，保证首屏就有内容
  if (bootEventCount > 0) spawnEvent(false);
}, 900);

/* 自适应 */
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
