/**
 * navigation.js —— AI 智能导航模块
 * ---------------------------------------------------------------
 * 功能：
 *   1. 大楼/地标数据管理
 *   2. 路径绘制（Three.js 发光指引线）
 *   3. AI 接口预留（后续接入真实 API 做路径规划）
 *
 * 接入 AI：
 *   只需设置 AI_CONFIG.apiKey 和 AI_CONFIG.endpoint，
 *   然后把 computeRoute 里的本地计算替换为 API 调用即可。
 */

import * as THREE from 'three';

/* ================================================================
   1. AI 配置（预留接口，等用户提供 API Key）
================================================================ */
export const AI_CONFIG = {
  apiKey: '',        // 用户后续填入
  endpoint: '',      // AI 服务地址
  model: '',         // 使用的模型名称
  enabled: false,    // 是否已启用 AI
};

/** 设置 AI 配置 */
export function setAIConfig(cfg) {
  Object.assign(AI_CONFIG, cfg);
  AI_CONFIG.enabled = !!(AI_CONFIG.apiKey && AI_CONFIG.endpoint);
}

/* ================================================================
   2. 大楼/地标数据
   （与 campus.js 保持一致，集中管理便于后续扩展）
================================================================ */
export const BUILDINGS = [
  // 地标建筑
  { name: '图书馆',   x: 0,    z: 0,    type: 'landmark', accent: 0x7fd4ff },
  { name: '体育馆',   x: -70,  z: 70,   type: 'landmark', accent: 0x66d9ff },
  { name: '校门',     x: 0,    z: 126,  type: 'landmark', accent: 0x4dabff },
  { name: '运动场',   x: 0,    z: 70,   type: 'landmark', accent: 0x2ee6a8 },
  { name: '湖畔',     x: -146, z: 20,   type: 'landmark', accent: 0x2f9fd0 },
  // 教学楼
  { name: '教学楼A',  x: -70,  z: -70,  type: 'teach',    accent: 0x5aa9ff },
  { name: '教学楼B',  x: 0,    z: -70,  type: 'teach',    accent: 0x5aa9ff },
  { name: '教学楼C',  x: 70,   z: -70,  type: 'teach',    accent: 0x5aa9ff },
  // 行政/食堂
  { name: '行政楼',   x: -70,  z: 0,    type: 'admin',    accent: 0x6fe3c4 },
  { name: '第一食堂', x: 70,   z: 0,    type: 'canteen',  accent: 0xffc266 },
  { name: '第二食堂', x: 70,   z: 70,   type: 'canteen',  accent: 0xffc266 },
  // 宿舍
  { name: '1号宿舍',  x: -78,  z: -132, type: 'dorm',     accent: 0xff9d7a },
  { name: '2号宿舍',  x: -26,  z: -132, type: 'dorm',     accent: 0xff9d7a },
  { name: '3号宿舍',  x: 26,   z: -132, type: 'dorm',     accent: 0xff9d7a },
  { name: '4号宿舍',  x: 78,   z: -132, type: 'dorm',     accent: 0xff9d7a },
];

/** 按名称查找大楼（支持模糊匹配） */
export function findBuilding(name) {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  // 精确匹配
  let hit = BUILDINGS.find((b) => b.name.toLowerCase() === n);
  if (hit) return hit;
  // 包含匹配
  hit = BUILDINGS.find((b) => b.name.toLowerCase().includes(n));
  if (hit) return hit;
  // 反向：输入简称（如"图"匹配"图书馆"）
  hit = BUILDINGS.find((b) => b.name.toLowerCase().startsWith(n));
  return hit || null;
}

/** 获取所有大楼名称（用于自动补全） */
export function getBuildingNames() {
  return BUILDINGS.map((b) => b.name);
}

/* ================================================================
   3. 路径计算
   ---------------------------------------------------------------
   当前实现：本地简易路径（直线 + 沿道路拐点）
   后续接入 AI：把 computeRoute 换成 API 调用
================================================================ */

/**
 * 计算从起点到终点的路径
 * @param {string} fromName 起点大楼名
 * @param {string} toName   终点大楼名
 * @returns {Promise<{points: THREE.Vector3[], distance: number, from: object, to: object}>}
 */
export async function computeRoute(fromName, toName) {
  const from = findBuilding(fromName);
  const to = findBuilding(toName);

  if (!from) throw new Error(`找不到起点：${fromName}`);
  if (!to) throw new Error(`找不到终点：${toName}`);
  if (from.name === to.name) throw new Error('起点和终点不能相同');

  // —— 如果启用了 AI，调用 AI 接口 ——
  if (AI_CONFIG.enabled) {
    try {
      return await computeRouteWithAI(from, to);
    } catch (e) {
      console.warn('AI 路径规划失败，使用本地计算：', e);
      // 降级到本地计算
    }
  }

  // —— 本地简易路径计算 ——
  const points = computeLocalRoute(from, to);
  const distance = calculatePathDistance(points);

  return {
    from,
    to,
    points,
    distance,
    mode: 'local',   // 标记为本地计算
  };
}

/**
 * 本地路径计算：简单的曼哈顿路径（沿道路走）
 * 道路线：x = [-100, -40, 40, 100], z = [-100, -40, 40, 100]
 */
function computeLocalRoute(from, to) {
  const ROAD_X = [-100, -40, 40, 100];
  const ROAD_Z = [-100, -40, 40, 100];

  // 找离起点最近的道路交叉口
  const fromSnap = snapToNearestRoad(from.x, from.z, ROAD_X, ROAD_Z);
  // 找离终点最近的道路交叉口
  const toSnap = snapToNearestRoad(to.x, to.z, ROAD_X, ROAD_Z);

  const points = [];
  // 起点位置
  points.push(new THREE.Vector3(from.x, 0.5, from.z));
  // 从起点走到最近的道路点
  points.push(new THREE.Vector3(fromSnap.x, 0.5, fromSnap.z));

  // 沿道路走：先沿 X 方向，再沿 Z 方向（曼哈顿路径）
  if (fromSnap.x !== toSnap.x) {
    points.push(new THREE.Vector3(toSnap.x, 0.5, fromSnap.z));
  }
  if (fromSnap.z !== toSnap.z) {
    points.push(new THREE.Vector3(toSnap.x, 0.5, toSnap.z));
  }

  // 从道路点走到终点
  points.push(new THREE.Vector3(toSnap.x, 0.5, to.z));
  points.push(new THREE.Vector3(to.x, 0.5, to.z));

  return points;
}

/** 找到离 (x,z) 最近的道路交叉口 */
function snapToNearestRoad(x, z, roadX, roadZ) {
  let bestX = roadX[0], bestZ = roadZ[0];
  let bestDist = Infinity;
  for (const rx of roadX) {
    for (const rz of roadZ) {
      const d = Math.hypot(x - rx, z - rz);
      if (d < bestDist) {
        bestDist = d;
        bestX = rx;
        bestZ = rz;
      }
    }
  }
  return { x: bestX, z: bestZ };
}

/** 计算路径总长度 */
function calculatePathDistance(points) {
  let dist = 0;
  for (let i = 1; i < points.length; i++) {
    dist += points[i].distanceTo(points[i - 1]);
  }
  return dist;
}

/* ================================================================
   4. AI 路径规划接口（预留）
================================================================ */

/**
 * 调用 AI 进行路径规划
 * （当前只是占位实现，等用户提供 API Key 后完善）
 */
async function computeRouteWithAI(from, to) {
  // TODO: 等用户提供 API 后实现真实调用
  // 示例伪代码：
  // const res = await fetch(AI_CONFIG.endpoint, {
  //   method: 'POST',
  //   headers: {
  //     'Content-Type': 'application/json',
  //     'Authorization': `Bearer ${AI_CONFIG.apiKey}`,
  //   },
  //   body: JSON.stringify({
  //     model: AI_CONFIG.model,
  //     messages: [
  //       { role: 'system', content: '你是一个校园导航助手，根据起点和终点规划最优路径...' },
  //       { role: 'user', content: `从 ${from.name} 到 ${to.name}` }
  //     ],
  //   }),
  // });
  // const data = await res.json();
  // ... 解析 AI 返回的路径点 ...

  // 暂时降级到本地计算
  const points = computeLocalRoute(from, to);
  return {
    from, to, points,
    distance: calculatePathDistance(points),
    mode: 'ai-fallback',
  };
}

/* ================================================================
   5. 路径可视化（Three.js 发光线 + 端点标记）
================================================================ */

export class RouteRenderer {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'RouteOverlay';
    scene.add(this.group);
    this.currentRoute = null;
    this.animTime = 0;
  }

  /**
   * 显示路径
   * @param {object} route computeRoute 返回的结果
   */
  showRoute(route) {
    this.clear();
    this.currentRoute = route;

    const { points, from, to } = route;

    // —— 主路径线（发光效果）——
    const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x4dabff,
      transparent: true,
      opacity: 0.9,
      linewidth: 2,
    });
    const line = new THREE.Line(lineGeo, lineMat);
    this.group.add(line);

    // —— 外发光线（更粗更淡，形成光晕）——
    const glowMat = new THREE.LineBasicMaterial({
      color: 0x7fd4ff,
      transparent: true,
      opacity: 0.35,
      linewidth: 6,
    });
    const glowLine = new THREE.Line(lineGeo.clone(), glowMat);
    this.group.add(glowLine);

    // —— 起点标记（绿色）——
    this.addEndpointMarker(from.x, from.z, 0x2ee6a8, '起点');
    // —— 终点标记（橙色）——
    this.addEndpointMarker(to.x, to.z, 0xffb020, '终点');

    // —— 流动粒子（沿路径移动）——
    this.addFlowParticles(points);

    return this;
  }

  /** 添加端点标记：垂直光柱 + 底部圆环 */
  addEndpointMarker(x, z, color, label) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);

    // 底部圆环
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(4, 5, 32),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.7,
        side: THREE.DoubleSide,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    g.add(ring);

    // 垂直光柱
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 2.5, 40, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.12,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    beam.position.y = 20;
    g.add(beam);

    // 存储动画引用
    g.userData = { ring, beam, color, label };
    this.group.add(g);

    return g;
  }

  /** 添加沿路径流动的粒子 */
  addFlowParticles(points) {
    const COUNT = 12;
    const positions = new Float32Array(COUNT * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const pts = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0x7fd4ff,
      size: 3,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    }));

    pts.userData = { points, count: COUNT, offset: 0 };
    this.group.add(pts);
    this.flowParticles = pts;
  }

  /** 清除当前路径 */
  clear() {
    while (this.group.children.length > 0) {
      const child = this.group.children[0];
      this.group.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    }
    this.currentRoute = null;
    this.flowParticles = null;
  }

  /** 每帧更新动画 */
  update(t) {
    this.animTime = t;

    // 端点圆环呼吸动画
    this.group.children.forEach((child) => {
      if (child.userData && child.userData.ring) {
        const { ring, beam } = child.userData;
        const pulse = 0.6 + Math.sin(t * 2) * 0.25;
        ring.material.opacity = 0.5 + pulse * 0.3;
        ring.scale.setScalar(1 + Math.sin(t * 1.5) * 0.08);
        beam.material.opacity = 0.08 + pulse * 0.06;
      }
    });

    // 流动粒子
    if (this.flowParticles) {
      const { points, count } = this.flowParticles.userData;
      const arr = this.flowParticles.geometry.attributes.position.array;

      // 计算路径总长度
      let totalLen = 0;
      const segLens = [];
      for (let i = 1; i < points.length; i++) {
        const l = points[i].distanceTo(points[i - 1]);
        segLens.push(l);
        totalLen += l;
      }

      for (let i = 0; i < count; i++) {
        // 每个粒子在路径上的位置（0~1 循环）
        const progress = ((t * 0.15 + i / count) % 1 + 1) % 1;
        const dist = progress * totalLen;

        // 找到对应的线段
        let acc = 0;
        let segIdx = 0;
        for (let j = 0; j < segLens.length; j++) {
          if (acc + segLens[j] >= dist) { segIdx = j; break; }
          acc += segLens[j];
        }
        const localT = (dist - acc) / (segLens[segIdx] || 1);

        const p0 = points[segIdx];
        const p1 = points[Math.min(segIdx + 1, points.length - 1)];
        arr[i * 3]     = p0.x + (p1.x - p0.x) * localT;
        arr[i * 3 + 1] = 1 + Math.sin(t * 3 + i) * 0.5;
        arr[i * 3 + 2] = p0.z + (p1.z - p0.z) * localT;
      }
      this.flowParticles.geometry.attributes.position.needsUpdate = true;
    }
  }

  dispose() {
    this.clear();
    this.scene.remove(this.group);
  }
}
