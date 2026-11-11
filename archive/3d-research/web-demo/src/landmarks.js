/**
 * landmarks.js —— 精细地标建筑
 * ---------------------------------------------------------------
 * 用组合几何体搭建有设计感的校园建筑，替代原来的单一 Box。
 * 每个 builder 返回 { group, dynamics, anchors, height }
 * —— 后续用 Blender 导出的 GLB 替换时，只需替换对应 builder 的实现。
 */

import * as THREE from 'three';

/* ================================================================
   工具
================================================================ */

/**
 * 窗格贴图的规范网格。
 * 贴图只负责"一格窗长什么样"，平铺次数由 facadeMaterials 按建筑实际尺寸决定，
 * 这样任何尺寸的楼都不会把窗格拉伸变形。
 */
export const WINDOW_COLS = 16;
export const WINDOW_ROWS = 24;

/** 夜景窗格贴图（可指定亮度与窗色） */
export function windowTexture({ color = '#7fd4ff', lit = 0.45 } = {}) {
  const cols = WINDOW_COLS;
  const rows = WINDOW_ROWS;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 384;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#070c14';
  ctx.fillRect(0, 0, c.width, c.height);

  const pw = c.width / cols;
  const ph = c.height / rows;
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < cols; i++) {
      if (Math.random() < 1 - lit) continue;
      ctx.globalAlpha = 0.3 + Math.random() * 0.7;
      ctx.fillStyle = color;
      ctx.fillRect(i * pw + pw * 0.16, r * ph + ph * 0.2, pw * 0.68, ph * 0.52);
    }
  }
  ctx.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** 玻璃幕墙贴图（竖向条窗） */
export function curtainTexture({ color = '#8fdcff' } = {}) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#0d1a2c');
  g.addColorStop(0.55, '#132840');
  g.addColorStop(1, '#0a1421');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);

  // 竖向分格
  ctx.strokeStyle = 'rgba(140,200,255,0.22)';
  ctx.lineWidth = 1.5;
  for (let x = 0; x <= 256; x += 16) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 256); ctx.stroke();
  }
  // 横向楼层线
  ctx.strokeStyle = 'rgba(140,200,255,0.14)';
  for (let y = 0; y <= 256; y += 32) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke();
  }
  // 随机亮窗
  for (let i = 0; i < 90; i++) {
    ctx.globalAlpha = 0.15 + Math.random() * 0.5;
    ctx.fillStyle = color;
    ctx.fillRect(Math.floor(Math.random() * 16) * 16 + 2,
                 Math.floor(Math.random() * 8) * 32 + 4, 12, 22);
  }
  ctx.globalAlpha = 1;

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/**
 * 按「面」生成幕墙材质数组。
 *
 * 关键点：BoxGeometry 六个面共用 0→1 的 UV，若整块楼共用一个材质，
 * 46×20 的长立面会把 16×24 的窗格横向拉伸十几倍，看上去就成了"砖块"。
 * 这里按每个面的真实尺寸换算平铺次数，保证窗格始终接近正方形。
 *
 * BoxGeometry 材质槽顺序：+X, -X, +Y, -Y, +Z, -Z
 *
 * @param {THREE.Texture} tex 规范窗格贴图
 * @param {number} accent     自发光色调
 * @param {number} w,h,d      建筑尺寸
 * @param {number} cell       一格窗对应的世界尺寸（米）
 */
export function facadeMaterials(tex, accent, w, h, d, intensity = 0.85, cell = 3.4) {
  const mk = (faceW, faceH) => {
    const t = tex.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(
      Math.max(0.4, Math.round(faceW / cell) / WINDOW_COLS),
      Math.max(0.4, Math.round(faceH / cell) / WINDOW_ROWS),
    );
    // 随机相位：避免同一张贴图在不同楼上"逐格对齐"，看上去像复制粘贴
    t.offset.set(Math.random(), Math.random());
    t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({
      color: 0x0d1624,
      roughness: 0.5,
      metalness: 0.42,
      map: t,
      emissive: new THREE.Color(accent),
      emissiveMap: t,
      emissiveIntensity: intensity,
    });
  };

  const side = mk(d, h);      // ±X 面：宽度 = d
  const front = mk(w, h);     // ±Z 面：宽度 = w
  const cap = new THREE.MeshStandardMaterial({
    color: 0x131d2e, roughness: 0.82, metalness: 0.18,
  });

  return [side, side, cap, cap, front, front];
}

/** 发光构件材质 */
function glowMat(accent, opacity = 0.9) {
  return new THREE.MeshBasicMaterial({
    color: accent, transparent: true, opacity,
  });
}

/** 建一个 Box 并加到 group */
function box(group, w, h, d, x, y, z, mat, cast = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = true;
  group.add(m);
  return m;
}

/** 顶部发光描边 */
function outline(group, w, h, d, x, y, z, accent, opacity = 0.42) {
  const line = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)),
    new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity })
  );
  line.position.set(x, y, z);
  group.add(line);
  return line;
}

/**
 * 屋顶光冠：用四根细条围成边框。
 * 不能用一整块发光板 —— MeshBasicMaterial 六面都发光，从上方看整个屋顶
 * 会变成一块亮板，楼就像"顶了个发光盖子"。
 */
function crownFrame(group, w, d, y, mat, thick = 0.8, height = 0.55) {
  return [
    box(group, w, height, thick, 0, y, (d - thick) / 2, mat, false),
    box(group, w, height, thick, 0, y, -(d - thick) / 2, mat, false),
    box(group, thick, height, d - thick * 2, (w - thick) / 2, y, 0, mat, false),
    box(group, thick, height, d - thick * 2, -(w - thick) / 2, y, 0, mat, false),
  ];
}

/* ================================================================
   1. 图书馆（地标）
   结构：三层台基 + 主体 + 退台 + 中庭光缝 + 屋顶檐口 + 入口柱廊
================================================================ */
export function buildLibrary({ x, z, accent = 0x7fd4ff }) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const dynamics = [];

  const tex = windowTexture({ color: '#9fdcff', lit: 0.5 });

  const matStone = new THREE.MeshStandardMaterial({
    color: 0x18243a, roughness: 0.72, metalness: 0.22,
  });
  const matFin = new THREE.MeshStandardMaterial({
    color: 0x1b2c44, roughness: 0.35, metalness: 0.65,
    emissive: new THREE.Color(accent), emissiveIntensity: 0.22,
  });

  /* 台基（两层） */
  box(g, 62, 2.2, 48, 0, 1.1, 0, matStone);
  box(g, 56, 2.2, 42, 0, 3.3, 0, matStone);
  outline(g, 56, 2.2, 42, 0, 3.3, 0, accent, 0.3);

  /* 主体 */
  const bodyH = 20;
  box(g, 46, bodyH, 34, 0, 4.4 + bodyH / 2, 0,
    facadeMaterials(tex, accent, 46, bodyH, 34, 0.85));
  outline(g, 46, bodyH, 34, 0, 4.4 + bodyH / 2, 0, accent, 0.4);

  /* 二层退台 */
  const upperH = 11;
  const upperY = 4.4 + bodyH + upperH / 2;
  box(g, 32, upperH, 24, 0, upperY, 0,
    facadeMaterials(tex, accent, 32, upperH, 24, 0.9));
  outline(g, 32, upperH, 24, 0, upperY, 0, accent, 0.45);

  /* 中庭光缝（贯穿的发光竖条） */
  const slot = box(g, 3.4, bodyH + upperH, 1.2, 0, 4.4 + (bodyH + upperH) / 2, 17.4,
    glowMat(accent, 0.85), false);
  dynamics.push({
    obj: slot,
    fn: (o, t) => { o.material.opacity = 0.55 + Math.sin(t * 1.4) * 0.3; },
  });

  /* 屋顶檐口 */
  const roofY = 4.4 + bodyH + upperH;
  box(g, 36, 1.6, 28, 0, roofY + 0.8, 0, matStone);
  const roofGlow = crownFrame(g, 37.5, 29.5, roofY + 1.75, glowMat(accent, 0.8), 0.9, 0.5);
  dynamics.push({
    obj: roofGlow[0],                    // 四根条共用同一材质，改一个即可
    fn: (o, t) => { o.material.opacity = 0.5 + Math.sin(t * 1.8) * 0.3; },
  });

  /* 入口柱廊（南面） */
  const colZ = 20;
  for (let i = -3; i <= 3; i++) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 8, 12), matStone);
    c.position.set(i * 6, 4.4 + 4, colZ);
    c.castShadow = true;
    g.add(c);
  }
  box(g, 46, 1.2, 6, 0, 4.4 + 8.6, colZ, matStone);          // 柱廊顶板
  box(g, 45, 0.4, 5, 0, 4.4 + 9.35, colZ, glowMat(accent, 0.5), false);

  /* 入口台阶 */
  for (let i = 0; i < 4; i++) {
    box(g, 30 - i * 2, 0.9, 3, 0, 0.45 + i * 0.9, colZ + 6 + i * 2.2, matStone);
  }

  /* 东西立面：贴附式竖向遮阳翼
     注意间距必须大于翼片出挑深度，否则斜视时相邻翼片互相遮挡，会糊成一整块板 */
  [-1, 1].forEach((s) => {
    for (let i = -6; i <= 6; i++) {
      box(g, 0.85, bodyH * 0.86, 0.34, s * 23.5, 4.4 + bodyH * 0.44, i * 2.6, matFin, false);
    }
  });

  /* 主体横向楼层线（把大立面切碎，比例更接近真实幕墙） */
  for (let i = 1; i < 6; i++) {
    const y = 4.4 + (bodyH / 6) * i;
    const line = box(g, 46.4, 0.22, 34.4, 0, y, 0,
      new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.16 }), false);
    dynamics.push({
      obj: line,
      fn: (o, t) => { o.material.opacity = 0.1 + Math.sin(t * 1.05 + i * 0.7) * 0.07; },
    });
  }

  /* 地标扫描环 */
  const ringGroup = new THREE.Group();
  ringGroup.position.set(0, roofY + 18, 0);
  for (let i = 0; i < 2; i++) {
    const r = new THREE.Mesh(
      new THREE.TorusGeometry(26 + i * 9, 0.5, 8, 64),
      new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.5 - i * 0.15 })
    );
    r.rotation.x = Math.PI / 2;
    r.userData.dir = i % 2 === 0 ? 1 : -1;
    ringGroup.add(r);
  }
  g.add(ringGroup);
  dynamics.push({
    obj: ringGroup,
    fn: (o, t) => {
      o.children.forEach((c) => { c.rotation.z = t * 0.4 * c.userData.dir; });
      o.position.y = roofY + 18 + Math.sin(t * 0.8) * 1.5;
    },
  });

  /* 屋顶光柱 */
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(7, 12, 46, 16, 1, true),
    new THREE.MeshBasicMaterial({
      color: accent, transparent: true, opacity: 0.055,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    })
  );
  beam.position.set(0, roofY + 26, 0);
  g.add(beam);

  return { group: g, dynamics, anchors: [{ name: '图书馆', x, z }], height: roofY };
}

/* ================================================================
   2. 校门
================================================================ */
export function buildGate({ x, z, accent = 0x4dabff }) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const dynamics = [];

  const matStone = new THREE.MeshStandardMaterial({
    color: 0x16223a, roughness: 0.62, metalness: 0.35,
    emissive: new THREE.Color(accent), emissiveIntensity: 0.09,
  });

  /* 两侧门柱（带收分） */
  [-1, 1].forEach((s) => {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.6, 17, 6), matStone);
    p.position.set(s * 17, 8.5, 0);
    p.castShadow = true;
    g.add(p);
    outline(g, 7.2, 17, 7.2, s * 17, 8.5, 0, accent, 0.3);

    // 柱身竖向灯带
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + Math.PI / 6;
      const strip = box(g, 0.28, 15, 0.28,
        s * 17 + Math.cos(a) * 3.05, 8.4, Math.sin(a) * 3.05,
        glowMat(accent, 0.75), false);
      dynamics.push({
        obj: strip,
        fn: (o, t) => { o.material.opacity = 0.45 + Math.sin(t * 1.7 + k) * 0.3; },
      });
    }

    // 柱顶发光环
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3.1, 0.28, 8, 28),
      new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.85 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(s * 17, 17.2, 0);
    g.add(ring);
    dynamics.push({
      obj: ring,
      fn: (o, t) => { o.material.opacity = 0.5 + Math.sin(t * 2 + s) * 0.35; },
    });
  });

  /* 横梁 + 发光字带 */
  box(g, 42, 2.6, 6, 0, 17.4, 0, matStone);
  const band = box(g, 34, 1.1, 0.6, 0, 17.4, 3.2, glowMat(accent, 0.9), false);
  dynamics.push({
    obj: band,
    fn: (o, t) => { o.material.opacity = 0.6 + Math.sin(t * 1.6) * 0.3; },
  });

  /* 弧形顶棚：细拱 + 肋条，压在横梁之上，不遮挡门楣 */
  const archBase = 18.7;
  const archR = 5.2;
  const arch = new THREE.Mesh(
    new THREE.CylinderGeometry(archR, archR, 36, 24, 1, true, 0, Math.PI),
    new THREE.MeshStandardMaterial({
      color: 0x0e1a2c, roughness: 0.45, metalness: 0.55,
      side: THREE.DoubleSide,
      emissive: new THREE.Color(accent), emissiveIntensity: 0.12,
    })
  );
  arch.rotation.z = Math.PI / 2;
  arch.position.set(0, archBase, 0);
  g.add(arch);

  for (let i = -4; i <= 4; i++) {
    const rib = new THREE.Mesh(
      new THREE.TorusGeometry(archR + 0.12, 0.16, 6, 26, Math.PI),
      new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.5 })
    );
    rib.rotation.y = Math.PI / 2;
    rib.position.set(i * 4.2, archBase, 0);
    g.add(rib);
  }

  /* 地面发光引导线 */
  for (let i = 0; i < 5; i++) {
    const l = box(g, 30 - i * 3, 0.12, 1.2, 0, 0.2, 4 + i * 5,
      glowMat(accent, 0.35), false);
    dynamics.push({
      obj: l,
      fn: (o, t) => { o.material.opacity = 0.18 + Math.abs(Math.sin(t * 1.2 - i * 0.4)) * 0.4; },
    });
  }

  return { group: g, dynamics, anchors: [{ name: '校门', x, z }], height: 24 };
}

/* ================================================================
   3. 体育馆（桶形拱顶）
================================================================ */
export function buildGym({ x, z, w = 46, d = 38, accent = 0x66d9ff }) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const dynamics = [];

  const matWall = new THREE.MeshStandardMaterial({
    color: 0x101a2b, roughness: 0.55, metalness: 0.4,
    emissive: new THREE.Color(accent), emissiveIntensity: 0.2,
  });
  const tex = windowTexture({ color: '#7fe3ff', lit: 0.4 });

  /* 基座 */
  box(g, w + 4, 2.4, d + 4, 0, 1.2, 0, matWall);

  /* 两侧墙体（按墙面真实尺寸校正窗格比例） */
  const wallH = 9;
  box(g, w, wallH, 2.2, 0, 2.4 + wallH / 2, d / 2,
    facadeMaterials(tex, accent, w, wallH, 2.2, 0.7));
  box(g, w, wallH, 2.2, 0, 2.4 + wallH / 2, -d / 2,
    facadeMaterials(tex, accent, w, wallH, 2.2, 0.7));
  box(g, 2.2, wallH, d, w / 2, 2.4 + wallH / 2, 0,
    facadeMaterials(tex, accent, 2.2, wallH, d, 0.7));
  box(g, 2.2, wallH, d, -w / 2, 2.4 + wallH / 2, 0,
    facadeMaterials(tex, accent, 2.2, wallH, d, 0.7));

  /* 桶形拱顶 */
  const vaultR = w / 2;
  const vault = new THREE.Mesh(
    new THREE.CylinderGeometry(vaultR, vaultR, d, 28, 1, true, 0, Math.PI),
    new THREE.MeshStandardMaterial({
      color: 0x0d1826, roughness: 0.35, metalness: 0.55,
      side: THREE.DoubleSide,
      emissive: new THREE.Color(accent), emissiveIntensity: 0.16,
    })
  );
  vault.rotation.z = Math.PI / 2;
  vault.rotation.y = Math.PI / 2;
  vault.position.set(0, 2.4 + wallH, 0);
  g.add(vault);

  /* 拱顶肋条 */
  for (let i = -3; i <= 3; i++) {
    const rib = new THREE.Mesh(
      new THREE.TorusGeometry(vaultR, 0.22, 6, 24, Math.PI),
      new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.55 })
    );
    rib.rotation.y = Math.PI / 2;
    rib.position.set(0, 2.4 + wallH, i * (d / 7));
    g.add(rib);
  }

  /* 拱顶天窗光带 */
  const skylight = new THREE.Mesh(
    new THREE.PlaneGeometry(d * 0.8, 2.4),
    new THREE.MeshBasicMaterial({
      color: accent, transparent: true, opacity: 0.5,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  skylight.rotation.x = -Math.PI / 2;
  skylight.rotation.z = Math.PI / 2;
  skylight.position.set(0, 2.4 + wallH + vaultR - 0.6, 0);
  g.add(skylight);
  dynamics.push({
    obj: skylight,
    fn: (o, t) => { o.material.opacity = 0.3 + Math.sin(t * 1.5) * 0.22; },
  });

  return {
    group: g, dynamics,
    anchors: [{ name: '体育馆', x, z }],
    height: 2.4 + wallH + vaultR,
  };
}

/* ================================================================
   4. 通用教学楼 / 宿舍 / 食堂
================================================================ */
export function buildBlock({
  x, z, w, d, h, kind = 'teach', accent = 0x5aa9ff, name = '',
}) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const dynamics = [];

  const tex = windowTexture({
    color: '#' + accent.toString(16).padStart(6, '0'),
    lit: kind === 'dorm' ? 0.62 : 0.42,
  });
  const matBase = new THREE.MeshStandardMaterial({
    color: 0x141f33, roughness: 0.7, metalness: 0.25,
  });

  /* 基座裙房 */
  box(g, w + 2.5, 2.0, d + 2.5, 0, 1.0, 0, matBase);

  /* 主体 */
  box(g, w, h, d, 0, 2.0 + h / 2, 0,
    facadeMaterials(tex, accent, w, h, d, kind === 'dorm' ? 0.95 : 0.8));
  outline(g, w, h, d, 0, 2.0 + h / 2, 0, accent, 0.32);

  /* 楼层腰线 */
  const floors = Math.max(3, Math.round(h / 3.6));
  for (let i = 1; i < floors; i++) {
    const y = 2.0 + (h / floors) * i;
    const line = box(g, w + 0.5, 0.18, d + 0.5, 0, y, 0,
      new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.2 }), false);
    dynamics.push({ obj: line, fn: (o, t) => { o.material.opacity = 0.12 + Math.sin(t * 1.1 + i) * 0.08; } });
  }

  /* 屋顶设备与光冠 */
  const roofY = 2.0 + h;
  box(g, w * 0.3, 1.6, d * 0.3, w * 0.2, roofY + 0.8, -d * 0.15, matBase);
  const crown = crownFrame(g, w * 1.02, d * 1.02, roofY + 0.35, glowMat(accent, 0.8));
  dynamics.push({
    obj: crown[0],
    fn: (o, t) => { o.material.opacity = 0.45 + Math.sin(t * 1.6 + x * 0.05) * 0.3; },
  });

  /* 宿舍：加阳台横带 */
  if (kind === 'dorm') {
    for (let i = 0; i < floors; i++) {
      const y = 2.0 + (h / floors) * (i + 0.55);
      box(g, w + 1.2, 0.3, d + 1.2, 0, y, 0,
        new THREE.MeshBasicMaterial({ color: 0xff9d7a, transparent: true, opacity: 0.16 }), false);
    }
  }

  /* 食堂：加天窗 */
  if (kind === 'canteen') {
    for (let i = -1; i <= 1; i++) {
      const sk = box(g, w * 0.22, 0.3, d * 0.5, i * w * 0.26, roofY + 0.6, 0, glowMat(accent, 0.7), false);
      dynamics.push({ obj: sk, fn: (o, t) => { o.material.opacity = 0.4 + Math.sin(t * 1.9 + i) * 0.28; } });
    }
  }

  /* 顶部光柱 */
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(w * 0.2, w * 0.3, h * 1.4, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: accent, transparent: true, opacity: 0.05,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    })
  );
  beam.position.set(0, roofY + h * 0.7, 0);
  g.add(beam);

  return { group: g, dynamics, anchors: name ? [{ name, x, z }] : [], height: roofY };
}

/* ================================================================
   5. 路灯（沿路网排列）
================================================================ */
export function buildLampPosts(roadLines, span, accent = 0x8fd8ff) {
  const g = new THREE.Group();
  const dynamics = [];

  const poleMat = new THREE.MeshStandardMaterial({ color: 0x1a2638, roughness: 0.6, metalness: 0.5 });
  const headMat = new THREE.MeshBasicMaterial({ color: accent });

  const spots = [];
  roadLines.forEach((p) => {
    for (let v = -span / 2 + 14; v < span / 2; v += 34) {
      spots.push([p + 8.5, v]);
      spots.push([p - 8.5, v]);
    }
  });

  const poleGeo = new THREE.CylinderGeometry(0.22, 0.3, 9, 6);
  const headGeo = new THREE.SphereGeometry(0.7, 10, 10);

  const poles = new THREE.InstancedMesh(poleGeo, poleMat, spots.length);
  const heads = new THREE.InstancedMesh(headGeo, headMat, spots.length);
  const m = new THREE.Matrix4();
  spots.forEach(([x, z], i) => {
    m.makeTranslation(x, 4.5, z);
    poles.setMatrixAt(i, m);
    m.makeTranslation(x, 9.2, z);
    heads.setMatrixAt(i, m);
  });
  poles.castShadow = true;
  g.add(poles, heads);

  return { group: g, dynamics };
}

/* ================================================================
   6. 校园水体（湖）
================================================================ */
export function buildLake({ x, z, r = 30, accent = 0x2f9fd0 }) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const dynamics = [];

  /* 池岸 */
  const bank = new THREE.Mesh(
    new THREE.RingGeometry(r, r + 5, 48),
    new THREE.MeshStandardMaterial({ color: 0x1a2c3d, roughness: 0.9 })
  );
  bank.rotation.x = -Math.PI / 2;
  bank.position.y = 0.18;
  g.add(bank);

  /* 水面 */
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(r, 48),
    new THREE.MeshStandardMaterial({
      color: 0x0a2b44, roughness: 0.08, metalness: 0.85,
      emissive: new THREE.Color(accent), emissiveIntensity: 0.22,
    })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.3;
  g.add(water);

  /* 岸边发光环 */
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(r + 4.2, r + 4.9, 64),
    new THREE.MeshBasicMaterial({
      color: accent, transparent: true, opacity: 0.55, side: THREE.DoubleSide,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.42;
  g.add(ring);
  dynamics.push({
    obj: ring,
    fn: (o, t) => { o.material.opacity = 0.3 + Math.sin(t * 1.3) * 0.25; },
  });

  return { group: g, dynamics, anchors: [{ name: '湖畔', x, z }] };
}
