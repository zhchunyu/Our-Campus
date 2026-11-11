/**
 * campus.js —— 校园场景程序化生成
 * ---------------------------------------------------------------
 * 方案：真实校园骨架（体块化建筑 + 路网）＋ 未来感改造（光带 / 全息网格 / 扫描环）
 *
 * 建筑分两级：
 *   · 地标级 —— 由 landmarks.js 精细搭建（图书馆 / 校门 / 体育馆）
 *   · 常规级 —— 由 landmarks.js 的 buildBlock 统一生成（教学楼 / 宿舍 / 食堂 / 行政楼）
 *
 * 后续接入 Blender 资产时，只需把对应的 builder 换成 GLTFLoader 加载 GLB。
 */

import * as THREE from 'three';
import {
  buildLibrary, buildGate, buildGym, buildBlock,
  buildLampPosts, buildLake,
} from './landmarks.js';

/* ------------------------------------------------------------------
   1. 校园布局数据
------------------------------------------------------------------ */
const ROAD_LINES = [-100, -40, 40, 100];
const ROAD_WIDTH = 12;
const ROAD_SPAN = 260;
const GROUND_SIZE = 380;

/* 街块中心坐标：-70 / 0 / 70 */
const BLOCKS = [
  { name: '教学楼A',  x: -70, z: -70, w: 40, d: 28, h: 21, kind: 'teach',   accent: 0x5aa9ff },
  { name: '教学楼B',  x: 0,   z: -70, w: 40, d: 28, h: 23, kind: 'teach',   accent: 0x5aa9ff },
  { name: '教学楼C',  x: 70,  z: -70, w: 40, d: 28, h: 19, kind: 'teach',   accent: 0x5aa9ff },
  { name: '行政楼',   x: -70, z: 0,   w: 34, d: 30, h: 17, kind: 'admin',   accent: 0x6fe3c4 },
  { name: '第一食堂', x: 70,  z: 0,   w: 38, d: 30, h: 14, kind: 'canteen', accent: 0xffc266 },
  { name: '第二食堂', x: 70,  z: 70,  w: 34, d: 28, h: 12, kind: 'canteen', accent: 0xffc266 },

  { name: '1号宿舍',  x: -78, z: -132, w: 30, d: 20, h: 25, kind: 'dorm', accent: 0xff9d7a },
  { name: '2号宿舍',  x: -26, z: -132, w: 30, d: 20, h: 25, kind: 'dorm', accent: 0xff9d7a },
  { name: '3号宿舍',  x: 26,  z: -132, w: 30, d: 20, h: 25, kind: 'dorm', accent: 0xff9d7a },
  { name: '4号宿舍',  x: 78,  z: -132, w: 30, d: 20, h: 25, kind: 'dorm', accent: 0xff9d7a },
];

const LIBRARY = { x: 0, z: 0, accent: 0x7fd4ff };
const GYM     = { x: -70, z: 70, w: 46, d: 38, accent: 0x66d9ff };
const GATE    = { x: 0, z: 126, accent: 0x4dabff };
const FIELD   = { x: 0, z: 70, w: 74, d: 46 };
const LAKE    = { x: -146, z: 20, r: 26 };

/* ------------------------------------------------------------------
   2. 工具贴图
------------------------------------------------------------------ */
function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 8;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 64, 0);
  g.addColorStop(0, 'rgba(77,171,255,0)');
  g.addColorStop(0.5, 'rgba(140,220,255,1)');
  g.addColorStop(1, 'rgba(77,171,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 8);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ------------------------------------------------------------------
   3. 场景构建
------------------------------------------------------------------ */
export function buildCampus(scene) {
  const root = new THREE.Group();
  root.name = 'Campus';
  scene.add(root);

  const dynamics = [];
  const anchors = [];
  const buildings = [];

  /** 统一挂载一个 builder 的产物 */
  function mount(result) {
    root.add(result.group);
    if (result.dynamics) dynamics.push(...result.dynamics);
    if (result.anchors) anchors.push(...result.anchors);
    return result;
  }

  /* ---------- 3.1 地面 ---------- */
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
    new THREE.MeshStandardMaterial({ color: 0x0a1220, roughness: 0.95, metalness: 0.05 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  root.add(ground);

  /* ---------- 3.2 全息地面网格 ---------- */
  const grid = new THREE.GridHelper(GROUND_SIZE, 76, 0x2a6fa8, 0x14314d);
  grid.position.y = 0.03;
  grid.material.transparent = true;
  grid.material.opacity = 0.3;
  root.add(grid);

  /* ---------- 3.3 路网 + 光带 ---------- */
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x121c2b, roughness: 0.7, metalness: 0.25 });
  const glowTex = makeGlowTexture();
  const bandMat = new THREE.MeshBasicMaterial({
    map: glowTex, transparent: true, opacity: 0.8,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });

  ROAD_LINES.forEach((p) => {
    const ns = new THREE.Mesh(new THREE.BoxGeometry(ROAD_WIDTH, 0.12, ROAD_SPAN), roadMat);
    ns.position.set(p, 0.06, 0);
    ns.receiveShadow = true;
    root.add(ns);

    const bn = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_SPAN, 2.2), bandMat);
    bn.rotation.x = -Math.PI / 2;
    bn.rotation.z = Math.PI / 2;
    bn.position.set(p, 0.14, 0);
    root.add(bn);

    const ew = new THREE.Mesh(new THREE.BoxGeometry(ROAD_SPAN, 0.12, ROAD_WIDTH), roadMat);
    ew.position.set(0, 0.06, p);
    ew.receiveShadow = true;
    root.add(ew);

    const be = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_SPAN, 2.2), bandMat);
    be.rotation.x = -Math.PI / 2;
    be.position.set(0, 0.14, p);
    root.add(be);
  });

  /* ---------- 3.4 运动场 ---------- */
  {
    const g = new THREE.Group();
    const turf = new THREE.Mesh(
      new THREE.BoxGeometry(FIELD.w, 0.3, FIELD.d),
      new THREE.MeshStandardMaterial({ color: 0x14503a, roughness: 0.9 })
    );
    turf.position.set(FIELD.x, 0.15, FIELD.z);
    turf.receiveShadow = true;
    g.add(turf);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1, 1.06, 64),
      new THREE.MeshBasicMaterial({ color: 0x4dabff, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.scale.set(FIELD.w / 2 + 6, FIELD.d / 2 + 6, 1);
    ring.position.set(FIELD.x, 0.35, FIELD.z);
    g.add(ring);
    dynamics.push({ obj: ring, fn: (o, t) => { o.material.opacity = 0.35 + Math.sin(t * 2) * 0.2; } });

    root.add(g);
    anchors.push({ name: '运动场', x: FIELD.x, z: FIELD.z });
  }

  /* ---------- 3.5 地标建筑 ---------- */
  mount(buildLibrary(LIBRARY));
  mount(buildGym(GYM));
  mount(buildGate(GATE));

  /* ---------- 3.5b 校门广场（含进校引导灯带） ---------- */
  {
    const plaza = new THREE.Mesh(
      new THREE.BoxGeometry(92, 0.18, 74),
      new THREE.MeshStandardMaterial({ color: 0x16222f, roughness: 0.86, metalness: 0.12 })
    );
    plaza.position.set(GATE.x, 0.09, 136);
    plaza.receiveShadow = true;
    root.add(plaza);

    // 从主路到校门的引导灯带
    for (let i = 0; i < 3; i++) {
      const band = new THREE.Mesh(
        new THREE.PlaneGeometry(64 - i * 14, 1.8),
        new THREE.MeshBasicMaterial({
          map: glowTex, transparent: true, opacity: 0.5,
          blending: THREE.AdditiveBlending, depthWrite: false,
        })
      );
      band.rotation.x = -Math.PI / 2;
      band.position.set(GATE.x, 0.2, 108 + i * 6);
      root.add(band);
      dynamics.push({
        obj: band,
        fn: (o, t) => {
          o.material.opacity = 0.26 + Math.abs(Math.sin(t * 1.1 - i * 0.6)) * 0.4;
        },
      });
    }
  }

  /* ---------- 3.6 常规建筑 ---------- */
  BLOCKS.forEach((b) => {
    mount(buildBlock(b));
    buildings.push(b);
  });

  /* ---------- 3.7 路灯 ---------- */
  mount(buildLampPosts(ROAD_LINES, ROAD_SPAN, 0x8fd8ff));

  /* ---------- 3.8 校园水体 ---------- */
  mount(buildLake(LAKE));

  /* ---------- 3.9 绿化 ---------- */
  {
    const trunkGeo = new THREE.CylinderGeometry(0.5, 0.7, 3, 5);
    const leafGeo = new THREE.ConeGeometry(3.2, 8, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x1b2a3a, roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({
      color: 0x1d4d3a, emissive: 0x1f6b4d, emissiveIntensity: 0.35, roughness: 0.85,
    });

    const blockers = [
      ...BLOCKS,
      { x: LIBRARY.x, z: LIBRARY.z, w: 64, d: 50 },
      { x: GYM.x, z: GYM.z, w: GYM.w + 8, d: GYM.d + 8 },
      { x: GATE.x, z: GATE.z, w: 46, d: 22 },
      { x: GATE.x, z: 140, w: 92, d: 72 },      // 校门前广场：留空，不种树
    ];

    const spots = [];
    let guard = 0;
    while (spots.length < 110 && guard < 4000) {
      guard += 1;
      const x = (Math.random() - 0.5) * 330;
      const z = (Math.random() - 0.5) * 330;

      if (ROAD_LINES.some((p) => Math.abs(x - p) < 12 || Math.abs(z - p) < 12)) continue;
      if (blockers.some((b) =>
        Math.abs(x - b.x) < b.w / 2 + 10 && Math.abs(z - b.z) < b.d / 2 + 10)) continue;
      if (Math.abs(x - FIELD.x) < FIELD.w / 2 + 8 && Math.abs(z - FIELD.z) < FIELD.d / 2 + 8) continue;
      if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 10) continue;

      spots.push([x, z]);
    }

    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, spots.length);
    const m = new THREE.Matrix4();
    spots.forEach(([x, z], i) => {
      const s = 0.55 + Math.random() * 0.5;
      m.compose(new THREE.Vector3(x, 1.5 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
      trunks.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(x, 7 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
      leaves.setMatrixAt(i, m);
    });
    trunks.castShadow = leaves.castShadow = true;
    root.add(trunks, leaves);
  }

  /* ---------- 3.10 数据流粒子 ---------- */
  {
    const COUNT = 260;
    const positions = new Float32Array(COUNT * 3);
    const lanes = [];
    ROAD_LINES.forEach((p) => {
      lanes.push({ axis: 'x', fixed: p });
      lanes.push({ axis: 'z', fixed: p });
    });

    const seeds = [];
    for (let i = 0; i < COUNT; i++) {
      seeds.push({
        lane: lanes[i % lanes.length],
        t: Math.random(),
        speed: 0.03 + Math.random() * 0.07,
        dir: Math.random() > 0.5 ? 1 : -1,
      });
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0x7fd4ff, size: 1.5, transparent: true, opacity: 0.75,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    }));
    root.add(pts);

    dynamics.push({
      obj: pts,
      fn: () => {
        const arr = geo.attributes.position.array;
        seeds.forEach((s, i) => {
          s.t += s.speed * s.dir * 0.016;
          if (s.t > 1) s.t -= 1;
          if (s.t < 0) s.t += 1;
          const v = (s.t - 0.5) * ROAD_SPAN;
          if (s.lane.axis === 'x') {
            arr[i * 3] = s.lane.fixed; arr[i * 3 + 1] = 0.5; arr[i * 3 + 2] = v;
          } else {
            arr[i * 3] = v; arr[i * 3 + 1] = 0.5; arr[i * 3 + 2] = s.lane.fixed;
          }
        });
        geo.attributes.position.needsUpdate = true;
      },
    });
  }

  /* ---------- 3.11 灯光 ---------- */
  scene.add(new THREE.HemisphereLight(0x4a7fb5, 0x0a1220, 0.85));

  const moon = new THREE.DirectionalLight(0x9fc7ff, 1.15);
  moon.position.set(-90, 150, 70);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -190;
  moon.shadow.camera.right = 190;
  moon.shadow.camera.top = 190;
  moon.shadow.camera.bottom = -190;
  moon.shadow.camera.far = 520;
  scene.add(moon);

  const fill = new THREE.DirectionalLight(0x2f6fa8, 0.5);
  fill.position.set(120, 80, -100);
  scene.add(fill);

  const p1 = new THREE.PointLight(0x7fd4ff, 240, 200, 2);
  p1.position.set(0, 56, 0);
  scene.add(p1);

  /* ---------- 3.12 返回 ---------- */
  return {
    root,
    buildings,
    anchors,
    gate: GATE,
    bounds: { x: 195, z: 195 },
    update(t) { dynamics.forEach((d) => d.fn(d.obj, t)); },
  };
}
