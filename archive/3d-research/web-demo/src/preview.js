/* preview.js —— 山河大学全园 GLB 预览
 * ------------------------------------------------------------------
 * 与产品 demo（index.html + src/app.js）**互不影响**：
 * 那一套是"实时态势地图"的产品原型，几何是程序化体块；
 * 这一页只做一件事 —— 把 Blender 导出的全园 GLB 放进来，验证模型本身。
 *
 * 坐标系：Blender (x, y, z) → three.js (x, z, −y)
 *   导出时用了 export_yup=True，所以 GLB 已经是 Y 向上，**不需要再手工转轴**。
 *   下面 PRESETS 里的数值是**已经换算过的 three.js 坐标**，
 *   来源是 `blender/configs/rN.json` 里各张成图的真实机位（见注释）。
 *
 * URL 参数：
 *   ?model=<url>     换模型
 *   ?preset=<名称>   直接进某个机位
 *   ?cam=x,y,z&tgt=x,y,z
 *   ?quality=high|balanced|perf
 *                    画质分级（默认 balanced）。三档只改「分辨率 / 阴影」，
 *                    不改几何、不改配色 —— 所以任何档位下看到的都是同一座校园。
 *   ?dpr=1.25        单独覆盖设备像素比（默认按档位取 min(devicePixelRatio, 档位值)）
 *   ?shadow=0        单独关阴影（SwiftShader 之类软渲染下快很多）
 *   ?smapsize=1024   单独覆盖阴影贴图边长
 *   ?softshadow=0    把 PCFSoft 降成 PCF
 *   ?aa=0            关 MSAA
 *   ?adapt=0         关自适应分辨率（默认开：帧率持续偏低时自动降 dpr）
 *   ?trans=1         保留玻璃的 transmission（默认转成普通半透明，省一遍全屏折射渲染）
 *   ?night=1         夜景配色（产品 demo 那套调子）
 *
 * ★★ 画质分级的依据是**实测**，不是拍脑袋（见 99-临时工作区/_perf_probe.py）：
 *   同机位 A/B 实测（1280×720 / SwiftShader）：
 *     · 阴影 autoUpdate=true   → drawn 2,765,364 / calls 605
 *     · 阴影 autoUpdate=false  → drawn 1,230,177 / calls 213   ← **阴影仍在画面上**
 *     · 阴影完全关闭           → drawn 1,230,177 / calls 213
 *   ⇒ 阴影**每帧重算**是最大单一大头（让每帧提交的面数与 draw call 各翻一倍）。
 *     太阳与校园几何都静止，阴影贴图**只需算一次**。
 *   另测 dpr：1.5 → 2.0 使帧耗时 ×1.66 ⇒ 高 DPI 屏上把 dpr 压到 1.5 收益很大。
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import {
  BUILDINGS, findBuilding, getBuildingNames,
  buildAnchors, nearestAnchor, resolveAnchorAlias,
  computeRoute, RouteRenderer, BuildingHighlighter,
  setAIConfig, loadAIConfig, AI_CONFIG,
  parseNaturalLanguage, generateRouteDescription,
  GROUND_Y,
} from './navigation.campus.js';
import {
  EVENT_TYPES, typeOf, createMarker, makeEvent, randomEvent,
  runAIPipeline, extractSchema, spatiotemporalDedupe, computeCredibility,
} from './events.js';
// ★ 文件名带 `.campus` 是刻意的（2026-09-26）：
//   `web-demo/src/navigation.js` 是**产品原型页**（index.html + app.js）用的
//   「演示尺度」版本 —— 图书馆在原点、整个校园只有约 300 m。
//   而这一份是**真实校园尺度**（坐标 ±800 m，来自 Blender 脚本）。
//   两者的 BUILDINGS 数据完全不同，共用一个文件名早晚会互相覆盖。

// ★ 从浏览器本地恢复使用者自己填的 AI 配置（Key 不进代码仓库、不进站点）
loadAIConfig();

const Q = new URLSearchParams(location.search);
const qs = (k, d) => (Q.has(k) ? Q.get(k) : d);
const MODEL = qs('model', './assets/campus.glb');

/* —— 事件系统全局状态 —— */
let eventMarkers = null;    // THREE.Group，所有事件标记的父节点
let events = [];            // 事件数据数组
let anchors = [];           // 锚点表（用于地点匹配）
let selectedEventId = null; // 当前选中的事件 ID
let eventSource = null;     // EventSource 连接
let pickMode = false;       // 地图选点模式
let reportDraft = { type: null, x: 0, z: 0, place: '' };

/* ==================================================================
 * 1. 相机预设 —— 数值来自 blender/configs/rN.json 的真实机位
 *    （Blender 相机 + 36 mm 传感器 ⇒ 水平 FOV；three.js 的 fov 是垂直的，
 *      所以要按视口宽高比换算，见 fovFromLens）
 * ================================================================== */
const PRESETS = {
  // R6_滨水_鸟瞰   pos[0,-520,1080]  tgt[0,400,0]   lens 30
  '鸟瞰·全园': { cam: [0, 1080, 520], tgt: [0, 0, -400], lens: 30 },
  // R4_环廊_鸟瞰
  '环廊·鸟瞰': { cam: [300, 700, 520], tgt: [0, 10, -350], lens: 36 },
  // R5_五区_鸟瞰
  '五区·鸟瞰': { cam: [-560, 480, 430], tgt: [0, 30, -420], lens: 42 },
  // R1_山门_透视
  '山门·透视': { cam: [-175, 62, 165], tgt: [10, 28, -40], lens: 50 },
  // R0_垂直书院_中轴近景（52 mm / pos[0,330,88] / tgt[0,648,48]）
  '中轴·书院': { cam: [0, 88, -330], tgt: [0, 48, -648], lens: 52 },
  // R2_图书馆_中轴
  '中轴·图书馆': { cam: [0, 40, -300], tgt: [0, 24, -518], lens: 40 },
  // R6_滨水_近景
  '滨水·近景': { cam: [-128, 5, -856], tgt: [96, 3, -849], lens: 36 },
};
const NAMES = Object.keys(PRESETS);

/** Blender 镜头（36 mm 水平传感器）→ three.js 垂直 fov（度） */
function fovFromLens(lens, aspect) {
  return 2 * Math.atan((18 / lens) / aspect) * 180 / Math.PI;
}

/* ==================================================================
 * 2. 渲染器 / 场景 / 光照
 * ================================================================== */
/* ------------------------------------------------------------------
 * 画质分级（2026-09-26 加）
 * ------------------------------------------------------------------
 * 三档只动「像素数」和「阴影」，**不动几何、不动配色** ——
 * 任何档位下看到的都是同一座校园，只是清晰度与阴影精度不同。
 * 这样"降画质"不会变成"换了个东西"，对外包装成软件时也好解释。
 * ------------------------------------------------------------------ */
const TIER = qs('quality', 'balanced');
const TIERS = {
  //              dpr 上限          阴影   贴图   PCFSoft  MSAA
  // ★ 贴图边长保持 2048：既然阴影**只算一次**，贴图大小只影响"载入时那一次"的
  //   一次性开销，对每帧代价毫无影响 ⇒ 没有理由为了性能把它调小、牺牲阴影精度。
  high:     { dpr: 2.0, shadow: 1, map: 2048, soft: 1, aa: 1 },
  balanced: { dpr: 1.5, shadow: 1, map: 2048, soft: 1, aa: 1 },
  perf:     { dpr: 1.0, shadow: 0, map: 0,    soft: 0, aa: 0 },
};
const T = TIERS[TIER] || TIERS.balanced;

const DPR       = parseFloat(qs('dpr', String(Math.min(devicePixelRatio, T.dpr))));
const SHADOW    = qs('shadow', String(T.shadow)) === '1';
const SHADOW_MAP= parseInt(qs('smapsize', String(T.map || 1024)), 10);
const SOFT_SHADOW = qs('softshadow', String(T.soft)) === '1';
const ADAPT     = qs('adapt', '1') === '1';

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: qs('aa', String(T.aa)) === '1',
});
renderer.setPixelRatio(DPR);
renderer.setSize(innerWidth, innerHeight);
// 与 Blender 侧的 `view_transform = 'Khronos PBR Neutral'` 对齐
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;

/* ---- 自适应分辨率 ----
 * ★ 只调 pixelRatio，**不在运行时开关阴影**：
 *   改 `shadowMap.enabled` 会让 three.js 重编所有材质程序（本场景 54 个），
 *   切换瞬间反而更卡。降 dpr 是唯一"平滑且可逆"的旋钮。
 * ★ 只降不升（单调），避免在阈值附近来回抖。
 * ★★ 两段"不许判"的静默期（2026-09-26 踩到，必须留着）：
 *     ① 模型未就绪：这一段的慢是**加载**，不是渲染；
 *     ② 就绪后前 3 s：PMREM 环境贴图生成、**阴影贴图那一次渲染**、
 *        几十张纹理的首次上传，全挤在这几帧里。
 *   缺了这两条，任何机器（包括独显台式机）开机瞬间都会被判"卡"，
 *   于是**白白降掉分辨率** —— 用户看到的第一个画面就是糊的。
 *   实测就撞到过：无头软渲染下 dpr 从 1.0 一路掉到下限 0.75。
 */
let curDpr = DPR;
const DPR_FLOOR = 0.75;
const ADAPT_WARMUP_MS = 3000;      // 就绪后先观察 3 s 再判
const ADAPT_WINDOW_MS = 2000;      // 每 2 s 出一个 fps 样本
const ADAPT_FPS_LOW  = 30;         // 低于此值算"偏低"
let adaptReadyAt = 0, adaptWinAt = 0, adaptFrames = 0, adaptLow = 0;
function adaptQuality() {
  if (!ADAPT || curDpr <= DPR_FLOOR) return;
  if (!__ready) return;                            // ① 加载期不判
  const now = performance.now();
  if (!adaptReadyAt) { adaptReadyAt = now; adaptWinAt = now; return; }
  if (now - adaptReadyAt < ADAPT_WARMUP_MS) return; // ② 预热期不判
  adaptFrames++;
  const elapsed = now - adaptWinAt;
  if (elapsed < ADAPT_WINDOW_MS) return;
  const fps = adaptFrames * 1000 / elapsed;
  adaptWinAt = now; adaptFrames = 0;
  if (fps < ADAPT_FPS_LOW) {
    // 连续两个窗口都偏低才降，降幅 25%
    if (++adaptLow >= 2) {
      adaptLow = 0;
      const next = Math.max(DPR_FLOOR, +(curDpr * 0.75).toFixed(2));
      if (next < curDpr) {
        curDpr = next;
        renderer.setPixelRatio(curDpr);
        renderer.setSize(innerWidth, innerHeight, false);
        window.__dpr = curDpr;
        window.__adaptLog = (window.__adaptLog || []);
        window.__adaptLog.push({ t: Math.round(now), fps: +fps.toFixed(1), dpr: curDpr });
      }
    }
  } else {
    adaptLow = 0;
  }
}

const NIGHT = qs('night', '0') === '1';
const scene = new THREE.Scene();
if (NIGHT) {
  scene.background = new THREE.Color(0x0b1220);
  scene.fog = new THREE.Fog(0x0b1220, 1800, 5200);
} else {
  scene.background = new THREE.Color(0xb9cbdb);
  scene.fog = new THREE.Fog(0xb9cbdb, 2600, 7000);
}

const camera = new THREE.PerspectiveCamera(
  fovFromLens(30, innerWidth / innerHeight), innerWidth / innerHeight, 1, 30000);
camera.position.set(0, 1080, 520);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI * 0.495;   // 不许钻到地面以下
controls.minDistance = 20;
controls.maxDistance = 6000;
controls.target.set(0, 0, -400);

/* ---- 光照：参数取自 blender/configs/lighting.json ----
 * sun_elev 38° / sun_azim 220°（0°=东 +X，90°=北 +Y，逆时针）
 * 太阳方向 = (cos(az)·cos(el), sin(az)·cos(el), sin(el))，再转到 three.js 轴系 */
const EL = 38 * Math.PI / 180, AZ = 220 * Math.PI / 180;
const sunDir = new THREE.Vector3(
  Math.cos(AZ) * Math.cos(EL),   // → three.x
  Math.sin(EL),                  // → three.y
  -Math.sin(AZ) * Math.cos(EL),  // → three.z（Blender +Y = three −Z）
).normalize();

if (NIGHT) {
  scene.add(new THREE.HemisphereLight(0x4a7fb5, 0x0a1220, 0.55));
  const moon = new THREE.DirectionalLight(0x9fc7ff, 1.6);
  moon.position.copy(sunDir).multiplyScalar(1500);
  scene.add(moon);
} else {
  // ★ 光照强度要**克制**：three.js 的漫反射是 `albedo · I · NdotL / π`，
  //   而 `scene.environment`（PMREM 天空）本身还会给一份**不小的环境辐照**。
  //   两者叠加时很容易过曝 —— 第一版用了 hemi 1.15 + dir 2.35 + env(默认 1.0)，
  //   整个园区被推成一片白，连深色的水面都发白。
  //   这里把 hemi/ambient 压到很低，环境光交给 environmentIntensity 控制。
  scene.add(new THREE.HemisphereLight(0xcfe0ee, 0x6d6455, 0.40));
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.20);
  sun.position.copy(sunDir).multiplyScalar(2200);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xffffff, 0.06));

  if (SHADOW) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = SOFT_SHADOW ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    // ★★ 阴影贴图**只算一次**（2026-09-26 改，本次优化收益最大的一处）★★
    //   实测（同机位、同视口）：
    //     autoUpdate=true  → 每帧 drawn 2,765,364 / calls 605
    //     autoUpdate=false → 每帧 drawn 1,230,177 / calls 213，**而画面上的阴影一模一样**
    //     enabled=false    → 每帧 drawn 1,230,177 / calls 213
    //   ⇒ 校园几何与太阳都是静止的，阴影贴图没有任何理由每帧重算。
    //     关掉 autoUpdate 后，阴影的**观感代价为零、渲染代价归零**。
    //   ★ 什么时候必须重新置 needsUpdate：几何变了、太阳方向变了、
    //     或**模型刚加载完**（见 loader.load 里 scene.add(model) 之后那一次）。
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;      // 兜底渲一次；模型到位后会再置一次
    sun.castShadow = true;
    sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
    const c = sun.shadow.camera;
    // 园区主体 X ±816 / Y 0~1238（→ three Z −1238~0），加一圈余量
    c.left = -1000; c.right = 1000; c.top = 1000; c.bottom = -1000;
    c.near = 200; c.far = 5200;
    sun.target.position.set(0, 0, -620);
    scene.add(sun.target);
    window.__sun = sun;
  }
}

/* ==================================================================
 * 3. 加载 GLB
 * ================================================================== */
const t0 = performance.now();
const bar = document.getElementById('load-bar');
const txt = document.getElementById('load-txt');
const loadBox = document.getElementById('load');

const loader = new GLTFLoader();
// ★ Draco 是**必需**扩展（extensionsRequired 里有 KHR_draco_mesh_compression）：
//   不给 DRACOLoader，GLTFLoader 会直接抛错，而不是"少几个面"。
const draco = new DRACOLoader();
draco.setDecoderPath('./vendor/three/examples/jsm/libs/draco/gltf/');
loader.setDRACOLoader(draco);

let model = null, triTotal = 0, meshCount = 0, matCount = 0;

/* --------------------------------------------------------------------------
 * 统一失败出口（2026-09-25 加）
 * --------------------------------------------------------------------------
 * ★ 为什么必须有它（真实故障，不是假想）：
 *   原来隐藏遮罩的 `loadBox.classList.add('done')` 写在 onLoad 回调的**靠后**位置，
 *   而它前面还有 `PMREMGenerator.fromScene()` 生成环境贴图这一段。
 *   ⇒ 中间**任何一步抛异常**，遮罩就永远不消失，而且**页面上一个错都不报**。
 *
 *   更讽刺的是：本文件本来准备了一段很友好的提示（"请确认已通过 HTTP 打开…"），
 *   但它挂在 GLTFLoader 的 error 回调里 —— 只覆盖"模型下载/解析失败"这一种情况。
 *   脚本自己没跑起来、或 onLoad 中途抛异常，那段提示永远不会出现。
 *   用户看到的就是"3D 预览一直转圈"，无从判断问题在哪。
 *
 * ★ 现在的保证：**任何异常都在遮罩上可见**，并带上协议与地址，便于一眼定位。
 *   `__failed` 是幂等锁 —— 否则 `txt.outerHTML` 会被二次替换而报错。
 *
 * ★ `__ready` 与 `model` 是**两个不同的东西**，别合并（2026-09-25 踩过）：
 *   `model = gltf.scene` 在 `scene.add(model)` **之前**就赋值了，
 *   所以"model 非空"并不代表"画面已经能看了" —— traverse 中途抛异常时 model 也是非空。
 *   若用 `!model` 做超时判据，那种情况就永远等不到兜底。
 *   ⇒ 用 `__ready`（= 遮罩已隐藏、画面已可看）做唯一判据。
 * -------------------------------------------------------------------------- */
let __failed = false;
let __ready = false;
function fail(err, extra) {
  if (__failed) return;
  __failed = true;
  // 画面已经能看了就别再用错误提示盖住它 —— 只留控制台警告
  if (__ready) {
    console.warn('[preview] 就绪后发生异常（不影响显示）：', err, extra || '');
    return;
  }
  try {
    loadBox.classList.remove('done');       // 出错必须让遮罩可见
    txt.outerHTML = '<div class="err">预览失败：'
      + ((err && err.message) || err)
      + '<br>协议：<code>' + location.protocol + '</code>'
      + '　地址：<code>' + location.href + '</code>'
      + (extra ? '<br>' + extra : '')
      + '<br>请通过 HTTP 打开（<code>python -m http.server 8123</code>，'
      + '或双击站点目录下的 <code>serve.cmd</code>），'
      + '并确认 <code>assets/campus.glb</code> 存在。</div>';
  } catch (e) {
    console.error('[preview] 连错误提示都写不进去', e);
  }
}

// 兜底 1：主线程未捕获异常
addEventListener('error', (e) => fail(e.error || e.message));
// 兜底 2：未处理的 Promise 拒绝
addEventListener('unhandledrejection', (e) => fail(e.reason));
// 兜底 3：**超时**。上面两条都拦不住"请求发出去但永远不回来"这种情况
//   （比如 CDN 卡住、wasm 编译死等）。45 s 远大于正常加载（实测约 1.4 s）。
setTimeout(() => {
  if (!__ready) {
    fail(new Error('加载超时（45 s）'),
      '状态：' + JSON.stringify(window.__preview ? window.__preview() : null));
  }
}, 45000);

/* 模型**已就绪**之后的非致命步骤（环境贴图 / 面板数字 / 机位预设）。
 * ★ 关键：这些失败**绝不能**把遮罩盖回去 —— 那会让一个本来能看的场景被错误提示糊住。
 *   所以它们不走 `fail()`，只警告。 */
function soft(what, fn) {
  try {
    fn();
  } catch (e) {
    console.warn('[preview] ' + what + ' 失败（不影响模型显示）', e);
  }
}

loader.load(MODEL, (gltf) => {
  try {
    model = gltf.scene;

    const keepTrans = qs('trans', '0') === '1';
    const mats = new Map();
    model.traverse((o) => {
      if (!o.isMesh) return;
      meshCount++;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = true;
      const m = o.material;
      if (!m || mats.has(m.uuid)) return;
      mats.set(m.uuid, 1);
      // 玻璃的 transmission 会触发 three 的折射渲染通道（整屏再渲一遍）。
      // 百万面级场景里这个代价太高 ⇒ 默认转成普通半透明。
      if (m.transmission > 0 && !keepTrans) {
        m.transmission = 0;
        m.transparent = true;
        m.opacity = 0.34;
        m.depthWrite = false;
      }
      // glTF 的金属度/粗糙度来自 Blender 的 Principled BSDF，直接用；
      // 只把环境反射补上，否则金属件在无环境贴图时发黑。
    });
    matCount = mats.size;

    model.traverse((o) => {
      if (o.isMesh && o.geometry.index) triTotal += o.geometry.index.count / 3;
      else if (o.isMesh && o.geometry.attributes.position) {
        triTotal += o.geometry.attributes.position.count / 3;
      }
    });

    scene.add(model);

    // ★ 阴影贴图**只在载入后算这一次**（配合上面的 `autoUpdate = false`）。
    //   必须放在 `scene.add(model)` **之后** —— 否则阴影 pass 渲染的是空场景，
    //   得到一张全空的阴影贴图，而且**不会报任何错**，表现为"阴影凭空消失"。
    if (SHADOW) renderer.shadowMap.needsUpdate = true;

    // ★★ 遮罩**在这里**就隐藏（2026-09-25 修）★★
    //   原来这句在函数末尾（面板数字之后）。而它前面还有 PMREM 环境贴图生成，
    //   中间任何一步抛异常 ⇒ 遮罩永不消失且不报错 ⇒ 表现为"3D 预览一直转圈"。
    //   现在：模型已入场景、下面的 tick() 循环在跑，**下一帧就能出图**，
    //   后面的环境贴图 / 面板数字 / 机位预设都只是附加信息，不该阻塞出图。
    loadBox.classList.add('done');
    __ready = true;              // ★ 唯一就绪判据（见 fail() 上方注释）

    // 初始化 AI 导航
    try {
      initNavigation();
      window.__navInited = true;
    } catch (e) {
      console.warn('导航初始化失败:', e);
      window.__navInitError = e.message;
    }

    // 初始化事件系统
    try {
      initEvents();
      window.__eventsInited = true;
    } catch (e) {
      console.warn('事件系统初始化失败:', e);
      window.__eventsInitError = e.message;
    }

    // 金属件需要环境反射 —— 用一个程序化天空做 PMREM，不引外部 HDRI
    soft('环境贴图生成', () => {
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envScene = new THREE.Scene();
      envScene.background = scene.background.clone();
      const env = pmrem.fromScene(envScene, 0.04).texture;
      scene.environment = env;
      // ★ 默认的 1.0 相当于给全场景又加了一盏"天光"，会把浅色材质顶到过曝。
      //   压到 0.3：金属仍有反射，漫反射不再被额外提亮。
      scene.environmentIntensity = 0.30;
      pmrem.dispose();
    });

    // ---- 面板数据 ----
    soft('面板数据', () => {
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const dt = performance.now() - t0;
      document.getElementById('m-file').textContent = MODEL.split('/').pop();
      document.getElementById('m-tri').textContent = Math.round(triTotal).toLocaleString();
      document.getElementById('m-mesh').textContent = meshCount + ' / ' + matCount;
      document.getElementById('m-load').textContent = dt.toFixed(0) + ' ms';
      document.getElementById('m-size').textContent =
        size.x.toFixed(0) + ' × ' + size.z.toFixed(0) + ' × ' + size.y.toFixed(0) + ' m';
      document.getElementById('s-dist').textContent = '—';
    });

    // ★ 只在"没显式给机位"时才套默认预设 ——
    //   否则 `?cam=…&tgt=…` 会先被套上、再被默认预设覆盖掉（等于参数无效）。
    soft('机位预设', () => {
      if (!Q.has('cam') && !Q.has('tgt')) {
        applyPreset(qs('preset', NAMES[0]), false);
      } else {
        if (Q.has('preset')) applyPreset(Q.get('preset'), false);
        camera.updateProjectionMatrix();
      }
    });
  } catch (e) {
    fail(e);
  }
}, (e) => {
  if (e.total) bar.style.width = (e.loaded / e.total * 100).toFixed(0) + '%';
  txt.textContent = (e.loaded / 1048576).toFixed(1) + ' MB'
    + (e.total ? ' / ' + (e.total / 1048576).toFixed(1) + ' MB' : '');
}, (err) => {
  // 统一走 fail()，错误提示里带上协议与地址 —— 便于一眼看出是不是 file:// 的问题
  console.error(err);
  fail(err);
});

/* ==================================================================
 * 4. 相机预设 / 交互
 * ================================================================== */
const presetBox = document.getElementById('presets');
const buttons = {};
NAMES.forEach((n, i) => {
  const b = document.createElement('button');
  b.textContent = n;
  b.onclick = () => applyPreset(n, true);
  presetBox.appendChild(b);
  buttons[n] = b;
});

let tween = null;

function applyPreset(name, animate = true) {
  const p = PRESETS[name];
  if (!p) return;
  NAMES.forEach((n) => buttons[n].classList.toggle('on', n === name));
  const toPos = new THREE.Vector3(...p.cam);
  const toTgt = new THREE.Vector3(...p.tgt);
  const toFov = fovFromLens(p.lens, innerWidth / innerHeight);
  if (!animate) {
    camera.position.copy(toPos);
    controls.target.copy(toTgt);
    camera.fov = toFov;
    camera.updateProjectionMatrix();
    return;
  }
  tween = {
    t: 0,
    p0: camera.position.clone(), p1: toPos,
    t0: controls.target.clone(), t1: toTgt,
    f0: camera.fov, f1: toFov,
  };
}

addEventListener('keydown', (e) => {
  const i = parseInt(e.key, 10);
  if (i >= 1 && i <= NAMES.length) applyPreset(NAMES[i - 1]);
  if (e.key === 'r' || e.key === 'R') controls.autoRotate = !controls.autoRotate;
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  // ★ 用 curDpr（自适应后的当前值），不是初始 DPR —— 否则一改窗口大小，
  //   自适应降下来的分辨率就被"还原"回去了。
  renderer.setPixelRatio(curDpr);
  renderer.setSize(innerWidth, innerHeight);
});

/* URL 直接给机位 */
if (Q.has('cam')) {
  camera.position.fromArray(Q.get('cam').split(',').map(Number));
}
if (Q.has('tgt')) {
  controls.target.fromArray(Q.get('tgt').split(',').map(Number));
}
controls.autoRotateSpeed = 0.35;

/* ==================================================================
 * 5. 主循环
 * ================================================================== */
const sFps = document.getElementById('s-fps');
const sTri = document.getElementById('s-tri');
const sCall = document.getElementById('s-call');
const sDist = document.getElementById('s-dist');
// ★ 特效动画的时间基准：页面自己的单调时钟（替代已废弃的 performance.timing.navigationStart）
const T0 = performance.now();
let last = performance.now(), acc = 0, frames = 0;

function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.min(now - last, 100); last = now;

  if (tween) {
    tween.t = Math.min(1, tween.t + dt / 900);
    const k = tween.t < 0.5 ? 2 * tween.t * tween.t
      : 1 - Math.pow(-2 * tween.t + 2, 2) / 2;      // easeInOutQuad
    camera.position.lerpVectors(tween.p0, tween.p1, k);
    controls.target.lerpVectors(tween.t0, tween.t1, k);
    camera.fov = tween.f0 + (tween.f1 - tween.f0) * k;
    camera.updateProjectionMatrix();
    if (tween.t >= 1) tween = null;
  }

  // 导航相机动画
  if (navTween) {
    navTween.t = Math.min(1, navTween.t + dt / 1200);
    const k = navTween.t < 0.5 ? 2 * navTween.t * navTween.t
      : 1 - Math.pow(-2 * navTween.t + 2, 2) / 2;
    camera.position.lerpVectors(navTween.p0, navTween.p1, k);
    controls.target.lerpVectors(navTween.t0, navTween.t1, k);
    camera.fov = navTween.f0 + (navTween.f1 - navTween.f0) * k;
    camera.updateProjectionMatrix();
    if (navTween.t >= 1) navTween = null;
  }

  controls.update();

  // —— 特效动画必须在 `render()` **之前**更新 ——
  // ★ 原来这两段写在 render() 之后，于是特效的每帧动画**永远晚一帧**才呈现：
  //   相机动画已经在推进了，而光柱/光晕还停在上一帧的位置与不透明度上。
  //   单看一帧看不出来，动起来就是"光晕跟不紧"。
  // ★ 时间基准也不能再用 `performance.timing.navigationStart`（已废弃，
  //   新标准里为 0）—— 换成页面自己的单调时钟，且用秒为单位。
  const tSec = (now - T0) / 1000;

  // —— 导航路径动画 ——
  if (routeRenderer) routeRenderer.update(tSec);

  // —— 建筑高亮动画 ——
  if (buildingHighlighter) buildingHighlighter.update(tSec);

  // —— 事件标记动画 ——
  if (eventMarkers) {
    eventMarkers.children.forEach((m) => {
      if (m.userData.update) m.userData.update(tSec, m.userData.selected);
    });
  }

  renderer.render(scene, camera);

  adaptQuality();

  acc += dt; frames++;
  if (acc >= 500) {
    sFps.textContent = (frames * 1000 / acc).toFixed(0);
    sTri.textContent = (renderer.info.render.triangles / 1000).toFixed(0) + 'k';
    sCall.textContent = renderer.info.render.calls;
    sDist.textContent = camera.position.distanceTo(controls.target).toFixed(0) + ' m';
    acc = 0; frames = 0;
  }
}
requestAnimationFrame(tick);

/* 调试：把统计挂到 window，方便无头截图时读。
 * ★ `ready` 用 `__ready`（= 遮罩已隐藏、画面已可看），**不是** `!!model` ——
 *   model 在 scene.add 之前就赋值了，用它当就绪判据会误报"已就绪"。 */
window.__preview = () => ({
  tri: Math.round(triTotal), mesh: meshCount, mat: matCount,
  calls: renderer.info.render.calls,
  drawn: renderer.info.render.triangles,
  pos: camera.position.toArray().map((v) => +v.toFixed(1)),
  ready: __ready,
  failed: __failed,
  proto: location.protocol,
  tier: TIER, dpr: curDpr, shadow: SHADOW,
});

/* ==================================================================
 * 6. AI 智能导航功能
 * ================================================================== */
let routeRenderer = null;
let buildingHighlighter = null;
let currentRoute = null;
let navTween = null;   // 导航相机动画（独立于预设 tween）

function $(id) { return document.getElementById(id); }

function initNavigation() {
  routeRenderer = new RouteRenderer(scene);
  buildingHighlighter = new BuildingHighlighter(scene, camera, canvas);

  // 点击建筑高亮
  canvas.addEventListener('click', (e) => {
    // 忽略面板上的点击
    if (e.target.closest('.panel')) return;

    buildingHighlighter.setMouse(e.clientX, e.clientY);
    const building = buildingHighlighter.checkClick();
    if (building) {
      buildingHighlighter.highlight(building);
    } else {
      buildingHighlighter.clearHighlight();
    }
  });

  const el = {
    panel: $('nav-panel'),
    close: $('nav-close'),
    from: $('nav-from'),
    to: $('nav-to'),
    go: $('nav-go'),
    fromSuggest: $('nav-from-suggest'),
    toSuggest: $('nav-to-suggest'),
    result: $('nav-result'),
    rFrom: $('nri-from'),
    rTo: $('nri-to'),
    rDist: $('nri-dist'),
    rTime: $('nri-time'),
    rDesc: $('nri-desc'),
    // AI 模式
    tabs: document.querySelectorAll('.nav-tab'),
    classic: $('nav-classic'),
    ai: $('nav-ai'),
    aiInput: $('nav-ai-input'),
    aiGo: $('nav-ai-go'),
    aiStatus: $('nav-ai-status'),
    aiConfigBtn: $('nav-ai-config'),
    configModal: $('ai-config-modal'),
    configKey: $('ai-api-key'),
    configUrl: $('ai-api-url'),
    configModel: $('ai-model'),
    configSave: $('ai-config-save'),
    configCancel: $('ai-config-cancel'),
  };

  // 收起/展开面板
  let collapsed = false;
  el.close.addEventListener('click', () => {
    collapsed = !collapsed;
    el.panel.style.height = collapsed ? '44px' : '';
    el.panel.style.overflow = collapsed ? 'hidden' : '';
    el.close.textContent = collapsed ? '+' : '—';
  });

  // 模式切换
  el.tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      el.tabs.forEach(t => t.classList.remove('on'));
      tab.classList.add('on');
      const mode = tab.dataset.mode;
      if (mode === 'classic') {
        el.classic.style.display = 'block';
        el.ai.style.display = 'none';
      } else {
        el.classic.style.display = 'none';
        el.ai.style.display = 'block';
      }
    });
  });

  // —— 自动补全 ——
  const allNames = getBuildingNames();

  function setupSuggest(input, suggestBox) {
    let activeIndex = -1;
    let matches = [];

    input.addEventListener('input', () => {
      const val = input.value.trim();
      if (!val) {
        suggestBox.classList.add('hidden');
        return;
      }

      // 1. 先用别名系统精确匹配（如果命中，优先展示标准名）
      const aliasHit = resolveAnchorAlias(val, anchors);
      const aliasName = aliasHit?.anchor?.name;

      // 2. 名称包含匹配 + 字序模糊匹配
      const fuzzyMatches = allNames.filter(n =>
        n.includes(val) || val.split('').every(c => n.includes(c))
      );

      // 3. 合并：别名命中排第一，去重
      const seen = new Set();
      matches = [];
      if (aliasName && !seen.has(aliasName)) {
        matches.push({ name: aliasName, label: aliasName + '  <span style="color:rgba(232,230,224,.45)">(别名匹配)</span>' });
        seen.add(aliasName);
      }
      for (const n of fuzzyMatches) {
        if (!seen.has(n)) {
          matches.push({ name: n, label: n });
          seen.add(n);
        }
      }
      matches = matches.slice(0, 12);

      if (matches.length === 0) {
        suggestBox.classList.add('hidden');
        return;
      }

      activeIndex = -1;
      suggestBox.innerHTML = matches.map((m, i) =>
        `<div class="suggest-item" data-i="${i}">${m.label}</div>`
      ).join('');

      // —— 浮层定位：移到 body 下用 fixed，避免被面板 overflow 裁剪 ——
      const rect = input.getBoundingClientRect();
      suggestBox.style.position = 'fixed';
      suggestBox.style.left = rect.left + 'px';
      suggestBox.style.top = (rect.bottom + 2) + 'px';
      suggestBox.style.width = rect.width + 'px';
      suggestBox.style.zIndex = '100';
      if (suggestBox.parentElement !== document.body) {
        document.body.appendChild(suggestBox);
      }
      suggestBox.classList.remove('hidden');
    });

    input.addEventListener('keydown', (e) => {
      if (suggestBox.classList.contains('hidden')) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIndex = Math.min(activeIndex + 1, matches.length - 1);
        updateActive();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
        updateActive();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (activeIndex >= 0) {
          input.value = matches[activeIndex].name;
          suggestBox.classList.add('hidden');
        }
      } else if (e.key === 'Escape') {
        suggestBox.classList.add('hidden');
      }
    });

    function updateActive() {
      suggestBox.querySelectorAll('.suggest-item').forEach((item, i) => {
        item.classList.toggle('active', i === activeIndex);
      });
    }

    suggestBox.addEventListener('click', (e) => {
      const item = e.target.closest('.suggest-item');
      if (item) {
        const idx = parseInt(item.dataset.i, 10);
        if (matches[idx]) {
          input.value = matches[idx].name;
        }
        suggestBox.classList.add('hidden');
        input.focus();
      }
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.nav-input-wrap') && !e.target.closest('.suggest-list')) {
        suggestBox.classList.add('hidden');
      }
    });
  }

  setupSuggest(el.from, el.fromSuggest);
  setupSuggest(el.to, el.toSuggest);

  // —— 经典模式导航 ——
  el.go.addEventListener('click', () => handleNavigate(el));
  el.from.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleNavigate(el);
  });
  el.to.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleNavigate(el);
  });

  // —— AI 模式导航 ——
  el.aiGo.addEventListener('click', () => handleAINavigate(el));
  el.aiInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAINavigate(el);
    }
  });

  // —— AI 配置 ——
  // ★ 字段名必须用 `endpoint`（与 navigation.js / app.js 一致）。
  //   旧版这里读写的是 `baseUrl` —— 而 `AI_CONFIG` 里根本没有这个键，
  //   发请求时读的是 `endpoint`。于是弹窗里"服务地址"永远是空的、
  //   保存也只写进一个没人读的 `baseUrl`，**弹窗实际上是坏的**，
  //   只是被 navigation.js 里那段硬编码默认值掩盖了。
  //   现在默认值已按安全要求清空，这个字段名不一致会立刻暴露 ⇒ 必须一起修掉。
  el.aiConfigBtn.addEventListener('click', () => {
    el.configKey.value = AI_CONFIG.apiKey || '';
    el.configUrl.value = AI_CONFIG.endpoint || '';
    el.configModel.value = AI_CONFIG.model || '';
    el.configModal.classList.remove('hidden');
  });

  el.configCancel.addEventListener('click', () => {
    el.configModal.classList.add('hidden');
  });

  el.configSave.addEventListener('click', () => {
    setAIConfig({
      apiKey: el.configKey.value.trim(),
      endpoint: el.configUrl.value.trim(),
      model: el.configModel.value.trim(),
    });
    el.configModal.classList.add('hidden');
    updateAIStatus(el);
  });

  // 初始化 AI 状态
  updateAIStatus(el);

  // 调试：暴露到 window
  // ★ 这里多暴露 renderer/scene/camera —— 是**纯读取**，不改变任何渲染行为，
  //   但让性能量具能在**同一页面、同一机位**下做 A/B（例如运行时开关阴影、
  //   改 pixelRatio），从而把"阴影到底占多少"直接量出来，而不是靠推算。
  window.__debugNav = {
    handleNavigate: () => handleNavigate(el),
    findBuilding,
    computeRoute,
    routeRenderer,
    buildingHighlighter,
    BUILDINGS,
    renderer,
    scene,
    camera,
    controls,
  };
}

function updateAIStatus(el) {
  if (AI_CONFIG.apiKey) {
    el.aiStatus.textContent = '已启用';
    el.aiStatus.previousElementSibling.style.background = '#4caf50';
  } else {
    el.aiStatus.textContent = '未配置';
    el.aiStatus.previousElementSibling.style.background = '#888';
  }
}

/* —— 导航错误兜底：在结果面板里显示友好提示，而不是 alert —— */
function showNavError(el, msg) {
  el.rFrom.textContent = '—';
  el.rTo.textContent = '—';
  el.rDist.textContent = '—';
  el.rTime.textContent = '—';
  el.rDesc.textContent = '⚠ ' + msg;
  el.result.classList.remove('hidden');
  el.result.classList.add('nav-error');
  routeRenderer?.clear();
  currentRoute = null;
}

async function handleNavigate(el) {
  const fromName = el.from.value.trim();
  const toName = el.to.value.trim();

  if (!fromName || !toName) {
    alert('请输入起点和终点');
    return;
  }

  let from = findBuilding(fromName);
  let to = findBuilding(toName);

  // 如果精确查找失败，尝试用别名系统解析
  if (!from) {
    const alias = resolveAnchorAlias(fromName, anchors);
    if (alias?.anchor) from = findBuilding(alias.anchor.name);
  }
  if (!to) {
    const alias = resolveAnchorAlias(toName, anchors);
    if (alias?.anchor) to = findBuilding(alias.anchor.name);
  }

  if (!from) { showNavError(el, '找不到起点：' + fromName + '，试试输入建筑全称（如：中心图书馆）'); return; }
  if (!to) { showNavError(el, '找不到终点：' + toName + '，试试输入建筑全称（如：体育馆）'); return; }

  const route = await computeRoute(from.name, to.name);
  if (!route) {
    showNavError(el, '暂时无法规划这条路线（两点之间没有连通的道路）');
    return;
  }

  currentRoute = route;
  routeRenderer.showRoute(route);

  // 显示结果
  el.rFrom.textContent = from.name;
  el.rTo.textContent = to.name;
  el.rDist.textContent = Math.round(route.distance) + ' 米';
  el.rTime.textContent = '约 ' + Math.round(route.distance / 70) + ' 分钟';
  el.result.classList.remove('hidden');
  el.result.classList.remove('nav-error');

  // 生成 AI 描述
  el.rDesc.textContent = '正在生成路线指引…';
  try {
    const desc = await generateRouteDescription(route);
    el.rDesc.textContent = desc;
  } catch (e) {
    el.rDesc.textContent = '步行约 ' + Math.round(route.distance / 70) +
      ' 分钟，沿道路前行即可到达。';
  }

  // 相机动画：飞到路径上方
  flyToRoute(route);
}

async function handleAINavigate(el) {
  const text = el.aiInput.value.trim();
  if (!text) return;

  // ★ 未配置 AI 时给一句人话，而不是让它掉进下面 "找不到起点：null" 的分支。
  //   （默认配置里已经没有硬编码 Key 了，所以这是最常见的入口状态。）
  if (!AI_CONFIG.enabled) {
    alert('自然语言导航需要先配置 AI 服务：\n\n' +
          '点右上角「⚙ AI 设置」，填入你自己的 API Key 与服务地址即可。\n' +
          '配置只保存在你这台设备的浏览器里，不会写进代码或站点。\n\n' +
          '不配置也能用：左侧「经典」模式直接选起点/终点，路径规划在本地完成。');
    return;
  }

  el.aiGo.disabled = true;
  el.aiGo.textContent = 'AI 思考中…';

  try {
    const result = await parseNaturalLanguage(text);
    if (result.error) {
      alert(result.error);
      return;
    }

    let from = findBuilding(result.from);
    let to = findBuilding(result.to);

    // 如果精确查找失败，尝试用别名系统解析
    if (!from) {
      const alias = resolveAnchorAlias(result.from, anchors);
      if (alias?.anchor) from = findBuilding(alias.anchor.name);
    }
    if (!to) {
      const alias = resolveAnchorAlias(result.to, anchors);
      if (alias?.anchor) to = findBuilding(alias.anchor.name);
    }

    if (!from) { showNavError(el, '找不到起点：' + result.from + '，试试说全称（如：从中心图书馆出发）'); return; }
    if (!to) { showNavError(el, '找不到终点：' + result.to + '，试试说全称（如：到体育馆）'); return; }

    const route = await computeRoute(from.name, to.name);
    if (!route) { showNavError(el, '暂时无法规划这条路线（两点之间没有连通的道路）'); return; }

    currentRoute = route;
    routeRenderer.showRoute(route);

    // 显示结果
    el.rFrom.textContent = from.name;
    el.rTo.textContent = to.name;
    el.rDist.textContent = Math.round(route.distance) + ' 米';
    el.rTime.textContent = '约 ' + Math.round(route.distance / 70) + ' 分钟';
    el.result.classList.remove('hidden');
    el.result.classList.remove('nav-error');

    // 生成 AI 描述
    el.rDesc.textContent = '正在生成路线指引…';
    try {
      const desc = await generateRouteDescription(route);
      el.rDesc.textContent = desc;
    } catch (e) {
      el.rDesc.textContent = '步行约 ' + Math.round(route.distance / 70) +
        ' 分钟，沿道路前行即可到达。';
    }

    // 相机动画
    flyToRoute(route);

    // 切回经典模式并填充输入框
    document.querySelector('.nav-tab[data-mode="classic"]').click();
    el.from.value = from.name;
    el.to.value = to.name;

  } finally {
    el.aiGo.disabled = false;
    el.aiGo.textContent = 'AI 帮我找路';
  }
}

function flyToRoute(route) {
  // 计算路径中心点
  let cx = 0, cz = 0;
  route.points.forEach(p => { cx += p.x; cz += p.z; });
  cx /= route.points.length;
  cz /= route.points.length;

  // 相机位置：路径上方，俯视角度
  const dist = Math.max(300, route.distance * 0.6);
  const camPos = new THREE.Vector3(cx, dist * 0.7, cz + dist * 0.5);
  const tgtPos = new THREE.Vector3(cx, 0, cz);

  if (navTween) navTween = null;
  navTween = {
    p0: camera.position.clone(),
    p1: camPos,
    t0: controls.target.clone(),
    t1: tgtPos,
    f0: camera.fov,
    f1: fovFromLens(36, innerWidth / innerHeight),
    t: 0,
  };
}

/* ==================================================================
 * 7. 事件系统（EventSource + 手动上报 + 地图标记）
 * ==================================================================
 * 模式：
 *   readonly     公网只读模式（默认）—— 只展示事件，隐藏上报入口
 *   interactive  现场交互模式 —— 显示上报入口，可手动上报
 *
 * 事件源：
 *   · EventSource (SSE) —— 配置了 ?events=<url> 时使用，实时推送
 *   · 模拟事件        —— 未配置时自动生成，用于演示
 *   · 手动上报        —— interactive 模式下用户提交
 * ================================================================== */
function initEvents() {
  // 1. 准备锚点表（用于地点匹配）
  anchors = buildAnchors();

  // 2. 创建标记组，加到场景里
  eventMarkers = new THREE.Group();
  eventMarkers.name = 'eventMarkers';
  scene.add(eventMarkers);

  // 3. 初始化 UI
  initEventUI();

  // 4. 模式设置
  const mode = Q.get('mode') || 'readonly';
  setMode(mode);

  // 5. 连接事件源
  const eventsUrl = Q.get('events');
  if (eventsUrl) {
    connectEventSource(eventsUrl);
  } else {
    // 演示模式：自动生成随机事件
    startDemoEvents();
  }

  // 6. 射线拾取（地图选点 + 点击事件标记）
  setupEventPicking();
}

/* —— UI 初始化 —— */
function initEventUI() {
  const panel = document.getElementById('event-panel');
  const list = document.getElementById('ev-list');
  const count = document.getElementById('ev-count');
  const toggleBtn = document.getElementById('ev-toggle');
  const reportBtn = document.getElementById('report-btn');
  const modal = document.getElementById('report-modal');
  const cancelBtn = document.getElementById('report-cancel');
  const submitBtn = document.getElementById('report-submit');
  const typeGrid = document.getElementById('report-types');
  const pickBtn = document.getElementById('pick-on-map');
  const textarea = document.getElementById('report-text');
  const placeInput = document.getElementById('report-place');

  // 折叠面板
  toggleBtn.addEventListener('click', () => {
    panel.classList.toggle('collapsed');
    toggleBtn.textContent = panel.classList.contains('collapsed') ? '□' : '—';
  });

  // 上报按钮
  reportBtn.addEventListener('click', () => {
    reportDraft = { type: null, x: 0, z: 0, place: '' };
    typeGrid.querySelectorAll('.report-type-item').forEach((el) => el.classList.remove('selected'));
    textarea.value = '';
    placeInput.value = '';
    submitBtn.disabled = true;
    modal.classList.remove('hidden');
  });

  // 取消
  cancelBtn.addEventListener('click', () => {
    modal.classList.add('hidden');
    exitPickMode();
  });

  // 类型选择
  typeGrid.addEventListener('click', (e) => {
    const item = e.target.closest('.report-type-item');
    if (!item) return;
    typeGrid.querySelectorAll('.report-type-item').forEach((el) => el.classList.remove('selected'));
    item.classList.add('selected');
    reportDraft.type = item.dataset.type;
    updateSubmitState();
  });

  // 地图选点
  pickBtn.addEventListener('click', () => {
    if (pickMode) {
      exitPickMode();
    } else {
      enterPickMode();
    }
  });

  // 文本输入
  textarea.addEventListener('input', updateSubmitState);

  function updateSubmitState() {
    const ok = reportDraft.type && reportDraft.place && textarea.value.trim().length > 0;
    submitBtn.disabled = !ok;
  }

  // 提交
  submitBtn.addEventListener('click', () => {
    if (submitBtn.disabled) return;
    submitReport();
    modal.classList.add('hidden');
  });

  // 面板 tab 切换
  document.querySelectorAll('.panel-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      switchPanel(tab.dataset.panel);
    });
  });

  // 审核工作台交互
  initModerationUI();
}

/* —— 审核工作台 UI 初始化 —— */
let selectedModId = null;

function initModerationUI() {
  const approveBtn = document.getElementById('mod-approve');
  const rejectBtn = document.getElementById('mod-reject');
  const dismissBtn = document.getElementById('mod-dismiss');

  if (approveBtn) {
    approveBtn.addEventListener('click', () => {
      if (!selectedModId) return;
      moderateEvent(selectedModId, 'approve');
    });
  }
  if (rejectBtn) {
    rejectBtn.addEventListener('click', () => {
      if (!selectedModId) return;
      moderateEvent(selectedModId, 'reject');
    });
  }
  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => {
      if (!selectedModId) return;
      moderateEvent(selectedModId, 'dismiss');
    });
  }
}

/* —— 徽标弹跳动画（新事件来时跳一下）—— */
function bounceBadge() {
  const badge = document.getElementById('mod-badge');
  if (!badge) return;
  badge.classList.remove('bounce');
  // 强制重排以重启动画
  void badge.offsetWidth;
  badge.classList.add('bounce');
  setTimeout(() => badge.classList.remove('bounce'), 500);
}

/* —— 渲染审核列表 —— */
function renderModerationList() {
  const list = document.getElementById('mod-list');
  const pendingStat = document.getElementById('mod-stat-pending');
  const publishedStat = document.getElementById('mod-stat-published');
  const endedStat = document.getElementById('mod-stat-ended');
  const badge = document.getElementById('mod-badge');

  if (!list) return;

  // 统计
  const pending = events.filter((e) => e.status === 'pending' || e.status === 'verifying');
  const published = events.filter((e) => e.status === 'published');
  const ended = events.filter((e) => e.status === 'ended');

  if (pendingStat) pendingStat.textContent = pending.length;
  if (publishedStat) publishedStat.textContent = published.length;
  if (endedStat) endedStat.textContent = ended.length;
  if (badge) badge.textContent = pending.length;

  // 列表（按时间倒序，待审核在前）
  const sorted = [...events].sort((a, b) => {
    const order = { pending: 0, verifying: 1, published: 2, ended: 3 };
    const oa = order[a.status] ?? 9;
    const ob = order[b.status] ?? 9;
    if (oa !== ob) return oa - ob;
    return b.ts - a.ts;
  });

  if (sorted.length === 0) {
    list.innerHTML = '<div class="ev-empty" style="padding:20px;text-align:center;color:rgba(232,230,224,.4);font-size:12px">暂无事件</div>';
    return;
  }

  list.innerHTML = sorted.map((ev) => {
    const type = typeOf(ev.type);
    const hex = '#' + type.color.toString(16).padStart(6, '0');
    const cred = ev.ai?.credibility?.score ?? 0;
    const credLevel = cred >= 0.7 ? 'high' : cred >= 0.5 ? 'mid' : 'low';
    const time = new Date(ev.ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    const selected = ev.id === selectedModId ? 'selected' : '';
    const statusCls = 'status-' + ev.status;
    const credPct = Math.round(cred * 100);

    return `
      <div class="mod-item ${selected} ${statusCls}" data-id="${ev.id}">
        <div class="top">
          <span class="type" style="background:${hex}22;color:${hex}">${type.icon} ${type.label}</span>
          <span class="cred ${credLevel}">${credPct}%</span>
        </div>
        <div class="text">${ev.text}</div>
        <div class="place">📍 ${ev.place || '校园内'} · ${time}</div>
      </div>
    `;
  }).join('');

  // 绑定点击
  list.querySelectorAll('.mod-item').forEach((el) => {
    el.addEventListener('click', () => {
      selectedModId = el.dataset.id;
      showModerationDetail(selectedModId);
      renderModerationList();
    });
  });
}

/* —— 显示审核详情（证据链）—— */
function showModerationDetail(id) {
  const ev = events.find((e) => e.id === id);
  const detail = document.getElementById('mod-detail');
  if (!ev || !detail) return;

  detail.style.display = 'block';

  // 地点候选 Top3
  const placesEl = document.getElementById('mod-places');
  const candidates = ev.ai?.schema?.place_candidates || [];
  if (placesEl && candidates.length > 0) {
    placesEl.innerHTML = candidates.map((c, i) => {
      const isTop = i === 0;
      const pct = Math.round(c.score * 100);
      return `<div class="place-cand ${isTop ? 'top' : ''}">
        <span class="rank">${i + 1}</span>
        <span class="pname">${c.name}</span>
        <span class="pdist">${c.distance}m</span>
        <span class="pscore">${pct}%</span>
      </div>`;
    }).join('');
  } else if (placesEl) {
    placesEl.innerHTML = '<div style="font-size:11px;color:rgba(232,230,224,.35)">暂无候选地点</div>';
  }

  // 原文引用
  const quoteEl = document.getElementById('mod-quote');
  if (quoteEl) {
    quoteEl.textContent = ev.ai?.schema?.original_quote || ev.text;
  }

  // 可信度分解
  const bdEl = document.getElementById('mod-breakdown');
  const totalEl = document.getElementById('mod-total');
  const bd = ev.ai?.credibility?.breakdown;
  const score = ev.ai?.credibility?.score ?? 0;
  const threshold = ev.ai?.credibility?.threshold ?? 0.65;

  if (bd && bdEl) {
    const rows = [
      { k: '基础分', v: bd.base, pos: bd.base > 0 },
      { k: '来源权重', v: bd.source, pos: bd.source > 0 },
      { k: '群体佐证', v: bd.crowd, pos: bd.crowd > 0, note: bd.crowd_note },
      { k: '常识校验', v: bd.commonSense, pos: bd.commonSense >= 0, note: bd.commonSense_note },
      { k: '文本质量', v: bd.text, pos: bd.text > 0 },
    ];
    bdEl.innerHTML = rows.map((r) => {
      const val = (r.v >= 0 ? '+' : '') + (r.v * 100).toFixed(0) + '%';
      const cls = r.pos ? 'pos' : 'neg';
      const note = r.note ? ` <span style="color:rgba(232,230,224,.35)">(${r.note})</span>` : '';
      return `<div class="bd-row"><span class="k">${r.k}${note}</span><span class="v ${cls}">${val}</span></div>`;
    }).join('');
  }

  if (totalEl) {
    const pct = Math.round(score * 100);
    const thrPct = Math.round(threshold * 100);
    totalEl.textContent = `${pct}% / 阈值 ${thrPct}%`;
  }

  // 相机飞到事件位置
  selectEvent(id);
}

/* —— 审核操作（通过/驳回/忽略）—— */
function moderateEvent(id, action) {
  const ev = events.find((e) => e.id === id);
  if (!ev) return;

  if (action === 'approve') {
    ev.status = 'published';
    if (!ev.ai) ev.ai = {};
    ev.ai.credibility = ev.ai.credibility || { score: 0.85, passed: true };
    ev.ai.credibility.passed = true;
    ev.ai.credibility.score = Math.max(ev.ai.credibility.score, 0.85);
    ev.ai.reason = '信息员人工审核通过';
  } else if (action === 'reject') {
    ev.status = 'ended';
    if (!ev.ai) ev.ai = {};
    ev.ai.reason = '信息员驳回：信息不实或不符合规范';
  } else {
    // dismiss：放回队列，不操作
  }

  selectedModId = null;
  document.getElementById('mod-detail').style.display = 'none';
  renderModerationList();
  renderEventList();
  updateEventMarkers();
}

/* —— 模式切换 —— */
function setMode(mode) {
  const badge = document.getElementById('mode-badge');
  const reportBtn = document.getElementById('report-btn');
  const panelTabs = document.getElementById('panel-tabs');
  const modTab = document.getElementById('mod-tab');

  badge.className = mode;
  if (mode === 'interactive') {
    badge.textContent = 'INTERACTIVE · 交互模式';
    reportBtn.classList.remove('hidden');
    if (modTab) modTab.style.display = '';   // 显示审核 tab
  } else {
    badge.textContent = 'READONLY · 只读模式';
    reportBtn.classList.add('hidden');
    if (modTab) modTab.style.display = 'none';  // 隐藏审核 tab
    // 只读模式下强制切到导航 tab
    switchPanel('nav');
  }
}

/* —— 面板 tab 切换（导航/审核）—— */
function switchPanel(name) {
  const tabs = document.querySelectorAll('.panel-tab');
  const navContent = document.getElementById('nav-panel-content');
  const modPanel = document.getElementById('mod-panel');
  const title = document.getElementById('panel-title');

  tabs.forEach((t) => t.classList.toggle('on', t.dataset.panel === name));

  if (name === 'nav') {
    navContent.style.display = '';
    modPanel.classList.remove('visible');
    title.innerHTML = '🧭 <em>AI 智能导航</em>';
  } else {
    navContent.style.display = 'none';
    modPanel.classList.add('visible');
    title.innerHTML = '🛡️ <em>信息员审核</em>';
    renderModerationList();
  }
}

/* —— EventSource 连接 —— */
function connectEventSource(url) {
  try {
    eventSource = new EventSource(url);
    eventSource.addEventListener('event', (e) => {
      try {
        const ev = JSON.parse(e.data);
        addEvent(ev);
      } catch (err) {
        console.warn('事件解析失败:', err);
      }
    });
    eventSource.onerror = () => {
      console.warn('EventSource 连接断开，5s 后重连…');
    };
  } catch (e) {
    console.warn('EventSource 不可用，降级为模拟事件:', e.message);
    startDemoEvents();
  }
}

/* —— 演示模式：定时生成随机事件 —— */
function startDemoEvents() {
  // 先发 3 条初始事件
  for (let i = 0; i < 3; i++) {
    setTimeout(() => {
      const ev = randomEvent(anchors, i === 0); // 第一条是官方通知
      addEvent(ev);
    }, i * 800);
  }
  // 之后每 8-15 秒来一条
  function next() {
    const delay = 8000 + Math.random() * 7000;
    setTimeout(() => {
      const ev = randomEvent(anchors);
      addEvent(ev);
      // 只保留最近 50 条（防内存泄漏，但不截断演示效果）
      if (events.length > 50) events.pop();
      next();
    }, delay);
  }
  next();
}

/* —— 添加事件（地图标记 + 列表）—— */
function addEvent(ev) {
  // 去重
  if (events.find((e) => e.id === ev.id)) return;

  events.unshift(ev);

  // 找对应锚点（用于可信度计算和 Schema）
  const anchor = nearestAnchor(ev.x, ev.z, anchors);

  // 地图标记（所有非结束事件都打点；安全类待核实为半透明幽灵标记）
  if (!shouldHideMarker(ev)) {
    const marker = createMarker(ev, GROUND_Y + 0.2, {
      clusterCount: getClusterCount(ev),
      ghost: isGhostMarker(ev),
    });
    eventMarkers.add(marker);
  }

  // 列表更新
  renderEventList();
  // 审核列表也更新（如果在审核 tab）
  const modPanel = document.getElementById('mod-panel');
  if (modPanel?.classList.contains('visible')) {
    renderModerationList();
  }
  // 徽标弹跳动画
  bounceBadge();

  // AI 处理（模拟延迟）
  if (ev.status === 'pending') {
    ev.status = 'verifying';
    setTimeout(() => {
      ev.ai = runAIPipeline(ev, events, anchor, anchors);
      // 根据可信度决定状态
      if (ev.ai.credibility.passed) {
        ev.status = 'published';
      } else {
        ev.status = 'pending';  // 保持待核实，等人工审核
      }
      // AI 处理完后重建标记（状态/簇人数/幽灵模式可能都变了）
      updateEventMarkers();
      renderEventList();
      if (modPanel?.classList.contains('visible')) {
        renderModerationList();
      }
    }, 800 + Math.random() * 1500);
  }
}

/** 判断事件是否应该隐藏地图标记 */
function shouldHideMarker(ev) {
  if (ev.status === 'ended') return true;
  return false;
}

/** 判断事件是否为幽灵标记（安全类待核实 = 半透明虚线圈） */
function isGhostMarker(ev) {
  if (ev.type !== 'safety') return false;
  const passed = ev.ai?.credibility?.passed;
  return !passed && ev.status !== 'published';
}

/** 计算某事件所属簇的独立上报人数 */
function getClusterCount(ev) {
  if (ev.ai?.dedupe?.count) return ev.ai.dedupe.count;
  // 如果还没 AI 处理，手动算一下同位置同类型事件数
  const same = events.filter((e) =>
    e.id !== ev.id && e.type === ev.type && e.status !== 'ended' &&
    Math.hypot(e.x - ev.x, e.z - ev.z) < 60
  );
  return same.length + 1;
}

/** 同步事件标记与事件状态（状态变化时重建/移除标记） */
function updateEventMarkers() {
  if (!eventMarkers) return;

  // 移除所有标记
  while (eventMarkers.children.length > 0) {
    eventMarkers.remove(eventMarkers.children[0]);
  }

  // 重新添加应该显示的
  events.forEach((ev) => {
    if (shouldHideMarker(ev)) return;
    const marker = createMarker(ev, GROUND_Y + 0.2, {
      clusterCount: getClusterCount(ev),
      ghost: isGhostMarker(ev),
    });
    eventMarkers.add(marker);
  });
}

/* —— 渲染事件列表 —— */
function renderEventList() {
  const list = document.getElementById('ev-list');
  const count = document.getElementById('ev-count');

  count.textContent = events.length;

  if (events.length === 0) {
    list.innerHTML = '<div class="ev-empty">暂无事件<br><span style="font-size:11px">等待上报或实时推送…</span></div>';
    return;
  }

  list.innerHTML = events.map((ev) => {
    const type = typeOf(ev.type);
    const hex = '#' + type.color.toString(16).padStart(6, '0');
    const time = new Date(ev.ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    const selected = ev.id === selectedEventId ? 'selected' : '';
    return `
      <div class="ev-item ${selected}" data-id="${ev.id}">
        <div class="ev-item-top">
          <span class="ev-type" style="background:${hex}22;color:${hex}">${type.icon} ${type.label}</span>
          <span class="ev-time">${time}</span>
        </div>
        <div class="ev-text">${ev.text}</div>
        <div class="ev-place">📍 ${ev.place || '校园内'}</div>
      </div>
    `;
  }).join('');

  // 绑定点击
  list.querySelectorAll('.ev-item').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      selectEvent(id);
    });
  });
}

/* —— 选中事件（定位 + 高亮）—— */
function selectEvent(id) {
  selectedEventId = id;
  const ev = events.find((e) => e.id === id);
  if (!ev) return;

  // 标记高亮
  eventMarkers.children.forEach((m) => {
    m.userData.selected = m.userData.eventId === id;
  });

  // 相机飞到事件位置
  const dist = 260;
  const camPos = new THREE.Vector3(ev.x + dist * 0.4, dist * 0.7, ev.z + dist * 0.5);
  const tgtPos = new THREE.Vector3(ev.x, GROUND_Y + 10, ev.z);
  if (navTween) navTween = null;
  navTween = {
    p0: camera.position.clone(),
    p1: camPos,
    t0: controls.target.clone(),
    t1: tgtPos,
    f0: camera.fov,
    f1: fovFromLens(40, innerWidth / innerHeight),
    t: 0,
  };

  renderEventList();
}

/* —— 射线拾取（点击事件标记 + 地图选点）—— */
let _raycaster, _mouse;
function setupEventPicking() {
  _raycaster = new THREE.Raycaster();
  _mouse = new THREE.Vector2();

  const canvas = document.getElementById('scene');
  canvas.addEventListener('click', onCanvasClick);
}

function onCanvasClick(e) {
  // 地图选点模式
  if (pickMode) {
    const point = raycastGround(e);
    if (point) {
      reportDraft.x = point.x;
      reportDraft.z = point.z;
      // 找最近锚点作为地点名
      const anchor = nearestAnchor(point.x, point.z, anchors);
      reportDraft.place = anchor ? anchor.name : '校园内';
      document.getElementById('report-place').value = reportDraft.place;
      updateReportSubmitState();
      exitPickMode();
    }
    return;
  }

  // 点击事件标记
  if (!eventMarkers || eventMarkers.children.length === 0) return;

  const canvas = document.getElementById('scene');
  const rect = canvas.getBoundingClientRect();
  _mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  _mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  _raycaster.setFromCamera(_mouse, camera);
  const hits = _raycaster.intersectObjects(eventMarkers.children, true);

  if (hits.length > 0) {
    // 找到对应的标记组
    let obj = hits[0].object;
    while (obj && !obj.userData.eventId) obj = obj.parent;
    if (obj && obj.userData.eventId) {
      selectEvent(obj.userData.eventId);
    }
  }
}

/* —— 射线与地面求交（用于地图选点）—— */
function raycastGround(e) {
  const canvas = document.getElementById('scene');
  const rect = canvas.getBoundingClientRect();
  _mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  _mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  _raycaster.setFromCamera(_mouse, camera);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -GROUND_Y);
  const point = new THREE.Vector3();
  _raycaster.ray.intersectPlane(plane, point);
  return point;
}

/* —— 地图选点模式 —— */
function enterPickMode() {
  pickMode = true;
  document.getElementById('pick-hint').classList.remove('hidden');
  document.getElementById('pick-on-map').classList.add('active');
  document.getElementById('pick-on-map').textContent = '取消选点';
  document.body.style.cursor = 'crosshair';
}

function exitPickMode() {
  pickMode = false;
  document.getElementById('pick-hint').classList.add('hidden');
  const pickBtn = document.getElementById('pick-on-map');
  if (pickBtn) {
    pickBtn.classList.remove('active');
    pickBtn.textContent = '地图选点';
  }
  document.body.style.cursor = '';
}

function updateReportSubmitState() {
  const btn = document.getElementById('report-submit');
  const textarea = document.getElementById('report-text');
  const ok = reportDraft.type && reportDraft.place && textarea.value.trim().length > 0;
  btn.disabled = !ok;
}

/* —— 提交上报 —— */
function submitReport() {
  const textarea = document.getElementById('report-text');
  const text = textarea.value.trim();
  if (!reportDraft.type || !text) return;

  const ev = makeEvent({
    type: reportDraft.type,
    x: reportDraft.x,
    z: reportDraft.z,
    text,
    place: reportDraft.place,
    reporter: '你',
  });
  ev.status = 'pending';
  addEvent(ev);

  // 如果有事件源，也 POST 一份（演示模式忽略）
  const eventsUrl = Q.get('events');
  if (eventsUrl) {
    fetch(eventsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ev),
    }).catch(() => {});
  }
}
