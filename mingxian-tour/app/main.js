/**
 * 铭贤学堂旧址 · 自由游览
 * 纯前端全景漫游：Photo Sphere Viewer 5 + three.js
 */

import { Viewer } from '../vendor/psv.module.js';
import {
  SCENES,
  ORDER,
  AUDIO_LIBRARY,
  AUTOPLAY_HOLD_MS,
  AUTOPLAY_GAP_MS,
  sceneList,
} from './data.js';

/* ---------------- 状态 ---------------- */

const scenes = sceneList();

const state = {
  idx: 0,
  viewer: null,
  audio: new Audio(),
  /** 当前场景播到第几段配音（一个场景可有多段） */
  audioIdx: 0,
  switching: false,
  tourOn: false,
  tourTimer: null,
  tourEndsAt: 0,
  tourBarTimer: null,
  /** 运行时音频绑定覆盖：sceneId -> [音频路径, ...]（存在 localStorage） */
  bindings: {},
};

/* ---------------- 音频绑定（可在「讲解库」里自行指派） ---------------- */

const BINDING_KEY = 'mingxian-tour-bindings-v2';

function loadBindings() {
  try {
    const raw = localStorage.getItem(BINDING_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return {};
    // 兼容旧版单值格式：'xxx.mp3' -> ['xxx.mp3']
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (Array.isArray(v)) out[k] = v.filter((x) => typeof x === 'string');
      else if (typeof v === 'string') out[k] = [v];
    }
    return out;
  } catch {
    return {};
  }
}

function saveBindings() {
  try {
    localStorage.setItem(BINDING_KEY, JSON.stringify(state.bindings));
  } catch { /* 隐私模式下可能失败，忽略 */ }
}

/** 音频路径 -> 可读名称 */
function labelOf(src) {
  const hit = AUDIO_LIBRARY.find((a) => a.src === src);
  if (hit) return hit.name;
  return src.split('/').pop().replace(/\.mp3$/i, '');
}

/**
 * 某场景的配音序列（数组，可多段）。
 * 运行时绑定优先；否则用 data.js 里的默认 audios。
 */
function audiosFor(scene) {
  if (!scene) return [];
  const fromBind = state.bindings[scene.id];
  if (Array.isArray(fromBind)) {
    return fromBind.map((src) => ({ label: labelOf(src), src }));
  }
  return Array.isArray(scene.audios) ? scene.audios : [];
}

/** 当前场景正在播的那一段 */
function currentAudio() {
  const list = audiosFor(current());
  return list[state.audioIdx] || null;
}

/** 哪些场景用到了这段音频（可能不止一个） */
function scenesUsingAudio(src) {
  return scenes.filter((s) => audiosFor(s).some((a) => a.src === src));
}

/** 把所有场景的当前配音状态固化为 bindings，之后以 bindings 为准 */
function snapshotBindings() {
  const snap = {};
  scenes.forEach((s) => {
    const list = audiosFor(s).map((a) => a.src);
    if (list.length) snap[s.id] = list;
  });
  state.bindings = snap;
}

/* ---------------- DOM ---------------- */

const $ = (id) => document.getElementById(id);

const dom = {
  intro: $('intro'),
  introMedia: $('introMedia'),
  btnStart: $('btnStart'),
  btnTour: $('btnTour'),

  stage: $('stage'),
  viewer: $('viewer'),
  sceneName: $('sceneName'),
  sceneIndex: $('sceneIndex'),
  loader: $('loader'),
  loaderText: $('loaderText'),

  note: $('note'),
  noteName: $('noteName'),
  noteText: $('noteText'),

  btnPrev: $('btnPrev'),
  btnNext: $('btnNext'),
  btnFull: $('btnFull'),
  btnHome: $('btnHome'),
  btnLibrary: $('btnLibrary'),

  btnPlay: $('btnPlay'),
  btnReplay: $('btnReplay'),
  btnAudioNext: $('btnAudioNext'),
  audioLabel: $('audioLabel'),
  audioFill: $('audioFill'),

  strip: $('strip'),
  dockPos: $('dockPos'),
  btnTourRun: $('btnTourRun'),

  tourbar: $('tourbar'),
  tourFill: $('tourFill'),
  btnTourStop: $('btnTourStop'),

  sheet: $('sheet'),
  sheetList: $('sheetList'),
  btnSheetClose: $('btnSheetClose'),

  toast: $('toast'),
};

/* ---------------- 工具 ---------------- */

let toastTimer = null;
function toast(msg, ms = 2200) {
  dom.toast.textContent = msg;
  dom.toast.hidden = false;
  dom.toast.classList.remove('toast--out');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    dom.toast.classList.add('toast--out');
    setTimeout(() => { dom.toast.hidden = true; }, 320);
  }, ms);
}

function current() {
  return scenes[state.idx];
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** 按屏幕宽度选素材档位 */
function pickPanorama(scene) {
  return window.innerWidth <= 900 ? scene.mobile : scene.desktop;
}

/* ---------------- 场景条 ---------------- */

function buildStrip() {
  const frag = document.createDocumentFragment();
  scenes.forEach((s, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.dataset.idx = String(i);
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-label', `${s.name}（第 ${i + 1} 处）`);
    const n = audiosFor(s).length;
    const badge = n
      ? `<i class="chip__badge${n > 1 ? ' chip__badge--multi' : ''}">${n > 1 ? n : ''}</i>`
      : '';
    btn.innerHTML = `
      <img class="chip__thumb" src="${s.preview}" alt="" loading="lazy" decoding="async">
      <span class="chip__name">${badge}${s.name}</span>
    `;
    btn.addEventListener('click', () => {
      stopTour();
      goTo(i);
    });
    frag.appendChild(btn);
  });
  dom.strip.innerHTML = '';
  dom.strip.appendChild(frag);
}

function markStrip() {
  const chips = dom.strip.children;
  for (let i = 0; i < chips.length; i++) {
    const on = i === state.idx;
    chips[i].classList.toggle('chip--active', on);
    chips[i].setAttribute('aria-selected', on ? 'true' : 'false');

    // 同步「配音段数」标记（1 段显示点，多段显示数字）
    const nameEl = chips[i].querySelector('.chip__name');
    if (nameEl) {
      const n = audiosFor(scenes[i]).length;
      let badge = nameEl.querySelector('.chip__badge');
      if (n > 0 && !badge) {
        nameEl.insertAdjacentHTML('afterbegin', '<i class="chip__badge"></i>');
        badge = nameEl.querySelector('.chip__badge');
      }
      if (badge) {
        if (n === 0) badge.remove();
        else badge.textContent = n > 1 ? String(n) : '';
        badge.classList.toggle('chip__badge--multi', n > 1);
      }
    }

    if (on) {
      chips[i].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }
}

/* ---------------- 界面同步 ---------------- */

function syncUI() {
  const s = current();
  dom.sceneName.textContent = s.name;
  dom.sceneIndex.textContent = `${state.idx + 1} / ${scenes.length}`;
  dom.dockPos.textContent = `第 ${pad2(state.idx + 1)} 处 / 共 ${pad2(scenes.length)} 处`;

  dom.noteName.textContent = s.name;
  dom.noteText.textContent = s.note || '';

  dom.btnPrev.disabled = state.idx === 0;
  dom.btnNext.disabled = state.idx === scenes.length - 1;

  markStrip();
  syncAudioUI();
}

function syncAudioUI() {
  const list = audiosFor(current());
  const has = list.length > 0;
  dom.btnPlay.disabled = !has;
  dom.btnReplay.disabled = !has;
  dom.btnAudioNext.disabled = list.length < 2;

  if (!has) {
    dom.audioLabel.textContent = '本场景暂无配音';
    dom.audioFill.style.width = '0%';
    return;
  }

  const i = Math.min(state.audioIdx, list.length - 1);
  const item = list[i];
  const multi = list.length > 1 ? `配音 ${i + 1}/${list.length} · ` : '';
  dom.audioLabel.textContent = `${multi}${item.label}`;
  dom.btnPlay.textContent = state.audio.paused ? '▶' : '❚❚';
}

/* ---------------- 音频 ---------------- */

function loadSceneAudio(autoplay) {
  const list = audiosFor(current());
  state.audio.pause();
  dom.audioFill.style.width = '0%';

  if (!list.length) {
    state.audioIdx = 0;
    state.audio.removeAttribute('src');
    state.audio.load();
    syncAudioUI();
    return Promise.resolve();
  }

  if (state.audioIdx >= list.length) state.audioIdx = 0;
  const item = list[state.audioIdx];

  state.audio.src = item.src;
  state.audio.currentTime = 0;
  syncAudioUI();

  if (!autoplay) return Promise.resolve();

  return state.audio.play().then(() => {
    syncAudioUI();
  }).catch(() => {
    // 浏览器拦截自动播放时静默处理，用户点播放键即可
    syncAudioUI();
  });
}

/** 切到本场景的下一段配音 */
function nextAudioInScene() {
  const list = audiosFor(current());
  if (list.length < 2) return;
  state.audioIdx = (state.audioIdx + 1) % list.length;
  loadSceneAudio(true);
}

function bindAudio() {
  const a = state.audio;
  a.preload = 'auto';

  a.addEventListener('timeupdate', () => {
    if (!a.duration || !isFinite(a.duration)) return;
    const pct = Math.min(100, (a.currentTime / a.duration) * 100);
    dom.audioFill.style.width = `${pct}%`;
  });

  a.addEventListener('play', syncAudioUI);
  a.addEventListener('pause', syncAudioUI);

  a.addEventListener('ended', () => {
    dom.audioFill.style.width = '100%';
    const list = audiosFor(current());

    // 同一场景还有下一段：接着讲
    if (state.audioIdx < list.length - 1) {
      state.audioIdx += 1;
      loadSceneAudio(true);
      return;
    }

    syncAudioUI();
    if (state.tourOn) scheduleTourNext(AUTOPLAY_GAP_MS);
  });

  a.addEventListener('error', () => {
    if (!audiosFor(current()).length) return;
    dom.audioLabel.textContent = '配音加载失败';
    syncAudioUI();
  });
}

function togglePlay() {
  if (!audiosFor(current()).length) {
    toast('本场景暂无配音');
    return;
  }
  if (state.audio.paused) {
    if (state.audio.ended) state.audio.currentTime = 0;
    state.audio.play().catch(() => toast('播放被浏览器拦截，请再点一次'));
  } else {
    state.audio.pause();
  }
}

function replayAudio() {
  if (!audiosFor(current()).length) {
    toast('本场景暂无配音');
    return;
  }
  state.audio.currentTime = 0;
  state.audio.play().catch(() => {});
}

/* ---------------- 场景切换 ---------------- */

function showLoader(text) {
  dom.loaderText.textContent = text || '正在加载全景…';
  dom.loader.hidden = false;
  dom.loader.classList.remove('loader--out');
}

function hideLoader() {
  dom.loader.classList.add('loader--out');
  setTimeout(() => { dom.loader.hidden = true; }, 360);
}

async function goTo(idx, opts = {}) {
  if (idx < 0 || idx >= scenes.length) return;
  if (state.switching) return;
  if (idx === state.idx && state.viewer && !opts.force) {
    syncUI();
    return;
  }

  state.switching = true;
  state.idx = idx;
  state.audioIdx = 0;   // 新场景从第一段配音开始
  const s = current();

  syncUI();
  showLoader(`正在加载「${s.name}」…`);

  try {
    await state.viewer.setPanorama(pickPanorama(s), {
      transition: false,
      showLoader: false,
      position: { yaw: 0, pitch: 0 },
    });
    hideLoader();
  } catch (err) {
    hideLoader();
    toast('全景加载失败，请重试');
    // 兜底：换回桌面档再试一次
    try {
      await state.viewer.setPanorama(s.desktop, { transition: false, showLoader: false });
    } catch (_) { /* 放弃 */ }
  }

  await loadSceneAudio(!opts.silent);
  state.switching = false;

  if (state.tourOn && !opts.fromTour) {
    // 用户手动换景，结束巡游
    stopTour();
  }
}

function next() {
  if (state.idx < scenes.length - 1) goTo(state.idx + 1);
}

function prev() {
  if (state.idx > 0) goTo(state.idx - 1);
}

/* ---------------- 自动巡游 ---------------- */

function clearTourTimer() {
  clearTimeout(state.tourTimer);
  state.tourTimer = null;
}

function scheduleTourNext(delay) {
  clearTourTimer();
  state.tourEndsAt = Date.now() + delay;
  state.tourTimer = setTimeout(() => {
    if (!state.tourOn) return;
    if (state.idx >= scenes.length - 1) {
      stopTour();
      toast('巡游结束，已到最后一处');
      return;
    }
    goTo(state.idx + 1, { fromTour: true });
  }, delay);
}

function startTour() {
  state.tourOn = true;
  dom.tourbar.hidden = false;
  dom.btnTourRun.textContent = '巡游中…';
  dom.note.classList.add('note--hide');

  if (dom.stage.hidden) {
    enterStage({ silent: true }).then(() => {
      goTo(0, { fromTour: true, silent: true }).then(() => {
        runTourStep();
      });
    });
  } else {
    goTo(state.idx, { fromTour: true, silent: true }).then(() => runTourStep());
  }

  state.tourBarTimer = setInterval(updateTourBar, 120);
}

function runTourStep() {
  if (!state.tourOn) return;
  const list = audiosFor(current());

  if (list.length) {
    // 有配音：从第一段开始播，播完一段自动接下一段（ended 事件里处理），
    // 全部播完才切场景；若播放被拦截则退化为固定停留
    state.audioIdx = 0;
    state.audio.src = list[0].src;
    state.audio.currentTime = 0;
    state.audio.play().then(() => {
      syncAudioUI();
    }).catch(() => {
      scheduleTourNext(AUTOPLAY_HOLD_MS);
    });
    // 兜底：音频异常长时间不结束时也能推进
    clearTourTimer();
    state.tourTimer = setTimeout(() => {
      if (state.tourOn && state.audio.paused) scheduleTourNext(600);
    }, AUTOPLAY_HOLD_MS * 4);
  } else {
    scheduleTourNext(AUTOPLAY_HOLD_MS);
  }
}

function updateTourBar() {
  if (!state.tourOn) return;
  const total = scenes.length;
  const done = state.idx;
  const within = state.tourEndsAt
    ? Math.min(1, Math.max(0, 1 - (state.tourEndsAt - Date.now()) / Math.max(1, AUTOPLAY_HOLD_MS)))
    : 0;
  const pct = Math.min(100, ((done + within) / total) * 100);
  dom.tourFill.style.width = `${pct}%`;
}

function stopTour() {
  if (!state.tourOn) return;
  state.tourOn = false;
  clearTourTimer();
  clearInterval(state.tourBarTimer);
  state.tourBarTimer = null;
  dom.tourbar.hidden = true;
  dom.tourFill.style.width = '0%';
  dom.btnTourRun.textContent = '自动巡游';
  dom.note.classList.remove('note--hide');
  state.audio.pause();
}

/* ---------------- 全屏 ---------------- */

function toggleFullscreen() {
  const el = document.documentElement;
  if (!document.fullscreenElement) {
    (el.requestFullscreen || el.webkitRequestFullscreen || function () {}).call(el).catch?.(() => {});
  } else {
    (document.exitFullscreen || document.webkitExitFullscreen || function () {}).call(document);
  }
}

/* ---------------- 讲解库 ---------------- */

function buildLibrary() {
  dom.sheetList.innerHTML = '';

  // 重建前清掉上一次的底部操作区与导出结果，避免重复堆叠
  const panel = dom.sheetList.parentElement;
  panel.querySelectorAll('.lib-foot, .lib-export').forEach((el) => el.remove());

  AUDIO_LIBRARY.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'lib-item';

    const info = document.createElement('div');
    info.className = 'lib-item__info';
    const title = document.createElement('strong');
    title.textContent = item.name;
    const status = document.createElement('small');
    status.className = 'lib-item__status';
    info.appendChild(title);
    info.appendChild(status);

    const actions = document.createElement('div');
    actions.className = 'lib-item__actions';

    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'iconbtn';
    playBtn.textContent = '试听';
    playBtn.addEventListener('click', () => {
      state.audio.pause();
      state.audio.src = item.src;
      state.audio.currentTime = 0;
      state.audio.play()
        .then(() => toast(`正在播放：${item.name}`))
        .catch(() => toast('播放失败'));
    });

    const select = document.createElement('select');
    select.className = 'lib-item__select';
    select.setAttribute('aria-label', `${item.name} 绑定到哪个场景`);

    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = '不绑定';
    select.appendChild(noneOpt);

    scenes.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      select.appendChild(opt);
    });

    const refresh = () => {
      const owners = scenesUsingAudio(item.src);
      if (!owners.length) {
        select.value = '';
        status.textContent = '未指派';
        status.classList.remove('is-bound');
        return;
      }
      const owner = owners[0];
      const list = audiosFor(owner);
      const pos = list.findIndex((a) => a.src === item.src);
      select.value = owner.id;
      const more = list.length > 1 ? `（该场景第 ${pos + 1}/${list.length} 段）` : '';
      status.textContent = `已指派：${owner.name}${more}`;
      status.classList.add('is-bound');
    };

    select.addEventListener('change', () => {
      const targetId = select.value;

      // 第一次改动时，把当前全部场景状态固化，之后统一以 bindings 为准
      snapshotBindings();

      // 同一段音频只归属一个场景：先从所有场景移除
      Object.keys(state.bindings).forEach((sid) => {
        state.bindings[sid] = state.bindings[sid].filter((src) => src !== item.src);
        if (!state.bindings[sid].length) delete state.bindings[sid];
      });

      // 追加到目标场景（追加，不覆盖该场景已有的其它配音）
      if (targetId) {
        const arr = state.bindings[targetId] || [];
        if (!arr.includes(item.src)) arr.push(item.src);
        state.bindings[targetId] = arr;
      }

      saveBindings();
      buildLibrary();
      markStrip();
      syncUI();

      if (targetId) {
        const s = SCENES[targetId];
        const n = (state.bindings[targetId] || []).length;
        toast(`「${item.name}」已加入到「${s ? s.name : targetId}」${n > 1 ? `（该场景共 ${n} 段）` : ''}`);
      } else {
        toast(`「${item.name}」已取消指派`);
      }
    });

    actions.appendChild(playBtn);
    actions.appendChild(select);
    li.appendChild(info);
    li.appendChild(actions);
    dom.sheetList.appendChild(li);

    refresh();
  });

  // 底部操作：导出绑定配置
  const foot = document.createElement('div');
  foot.className = 'lib-foot';

  const exportBtn = document.createElement('button');
  exportBtn.type = 'button';
  exportBtn.className = 'iconbtn iconbtn--accent';
  exportBtn.textContent = '导出绑定配置';
  exportBtn.addEventListener('click', () => {
    const map = {};
    scenes.forEach((s) => {
      const list = audiosFor(s).map((a) => a.src);
      if (list.length) map[s.id] = list;
    });
    const json = JSON.stringify(map, null, 2);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(json)
        .then(() => toast('绑定配置已复制到剪贴板'))
        .catch(() => fallbackExport(json));
    } else {
      fallbackExport(json);
    }
  });

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'iconbtn';
  resetBtn.textContent = '恢复默认';
  resetBtn.addEventListener('click', () => {
    state.bindings = {};
    saveBindings();
    buildLibrary();
    markStrip();
    syncUI();
    toast('已恢复为数据文件中的默认绑定');
  });

  foot.appendChild(exportBtn);
  foot.appendChild(resetBtn);
  dom.sheetList.parentElement.appendChild(foot);
}

function fallbackExport(json) {
  const pre = document.createElement('pre');
  pre.className = 'lib-export';
  pre.textContent = json;
  const old = dom.sheetList.parentElement.querySelector('.lib-export');
  if (old) old.remove();
  dom.sheetList.parentElement.appendChild(pre);
  toast('已显示配置，可手动复制');
}

function openSheet() {
  dom.sheet.hidden = false;
}

function closeSheet() {
  dom.sheet.hidden = true;
}

/* ---------------- 进入 / 退出 ---------------- */

async function enterStage(opts = {}) {
  dom.intro.classList.add('intro--out');
  dom.stage.hidden = false;

  if (!state.viewer) {
    state.viewer = new Viewer({
      container: dom.viewer,
      panorama: pickPanorama(current()),
      navbar: false,
      loadingImg: null,
      loadingTxt: '',
      touchmoveTwoFingers: false,
      mousewheelCtrlKey: false,
      defaultZoomLvl: 32,
      minFov: 28,
      maxFov: 92,
      moveSpeed: 1.1,
      zoomSpeed: 1.1,
    });

    await new Promise((resolve) => {
      state.viewer.addEventListener('ready', resolve, { once: true });
      setTimeout(resolve, 15000);
    });

    // 调试/集成出口：便于自动化验证与后续扩展（不影响正常使用）
    window.__tourViewer = state.viewer;

    hideLoader();
    await loadSceneAudio(!opts.silent);
  }

  dom.stage.hidden = false;
  setTimeout(() => { dom.intro.hidden = true; }, 520);
}

function goHome() {
  stopTour();
  state.audio.pause();
  dom.stage.hidden = true;
  dom.intro.hidden = false;
  dom.intro.classList.remove('intro--out');
}

/* ---------------- 事件绑定 ---------------- */

function bindEvents() {
  dom.btnStart.addEventListener('click', () => {
    enterStage().then(() => goTo(0, { force: true }));
  });

  dom.btnTour.addEventListener('click', () => {
    enterStage({ silent: true }).then(() => startTour());
  });

  dom.btnPrev.addEventListener('click', () => { stopTour(); prev(); });
  dom.btnNext.addEventListener('click', () => { stopTour(); next(); });

  dom.btnPlay.addEventListener('click', togglePlay);
  dom.btnReplay.addEventListener('click', replayAudio);
  dom.btnAudioNext.addEventListener('click', nextAudioInScene);
  dom.btnFull.addEventListener('click', toggleFullscreen);
  dom.btnHome.addEventListener('click', goHome);
  dom.btnLibrary.addEventListener('click', openSheet);
  dom.btnSheetClose.addEventListener('click', closeSheet);

  dom.btnTourRun.addEventListener('click', () => {
    if (state.tourOn) stopTour();
    else startTour();
  });
  dom.btnTourStop.addEventListener('click', stopTour);

  dom.sheet.addEventListener('click', (e) => {
    if (e.target === dom.sheet) closeSheet();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!dom.sheet.hidden) { closeSheet(); return; }
      if (state.tourOn) { stopTour(); return; }
    }
    if (dom.stage.hidden) {
      if (e.key === 'Enter' || e.key === ' ') dom.btnStart.click();
      return;
    }
    if (e.target instanceof HTMLInputElement) return;

    switch (e.key) {
      case 'ArrowLeft':
        stopTour(); prev(); break;
      case 'ArrowRight':
        stopTour(); next(); break;
      case ' ':
        e.preventDefault(); togglePlay(); break;
      case 'f': case 'F':
        toggleFullscreen(); break;
      default:
        break;
    }
  });

  // 窗口尺寸变化时，在移动/桌面档之间切换像素密度（仅重设当前场景）
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!state.viewer || dom.stage.hidden) return;
      // 轻量处理：不改动已加载的全景，避免打断浏览
    }, 400);
  });
}

/* ---------------- 启动 ---------------- */

function init() {
  // 首屏背景用第一张缩略图放大模糊
  dom.introMedia.style.backgroundImage = `url("${scenes[0].preview}")`;

  state.bindings = loadBindings();

  buildStrip();
  buildLibrary();
  bindAudio();
  bindEvents();
  syncUI();

  // 预加载首屏与下一场景缩略图
  [0, 1, 2].forEach((i) => {
    if (scenes[i]) {
      const img = new Image();
      img.src = scenes[i].preview;
    }
  });

  // 直接进入：?autostart=1 跳过首屏；&s=3 指定起始场景（从 1 开始计数）
  // 注意：无用户手势时浏览器会拦截音频自动播放，进入后需手动点播放
  const params = new URLSearchParams(location.search);
  if (params.get('autostart') === '1') {
    const sParam = Number(params.get('s'));
    const startIdx = Number.isFinite(sParam) && sParam >= 1 && sParam <= scenes.length
      ? sParam - 1
      : 0;
    dom.intro.hidden = true;
    enterStage({ silent: true }).then(() => goTo(startIdx, { force: true, silent: true }));
  }
}

init();