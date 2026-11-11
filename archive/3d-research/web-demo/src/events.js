/**
 * events.js —— 信息事件系统 + AI 判断流程模拟
 * ---------------------------------------------------------------
 * 演示闭环：学生上报 → AI 判断（语义/分类/去重/可信度）→ 地图打点 → 他人可见
 */

import * as THREE from 'three';

/* ------------------------------------------------------------------
   1. 事件类型定义
------------------------------------------------------------------ */
export const EVENT_TYPES = [
  { key: 'safety',  label: '安全预警', color: 0xff4d6d, icon: '⚠' },
  { key: 'traffic', label: '通行拥堵', color: 0xffb020, icon: '⇄' },
  { key: 'service', label: '生活服务', color: 0x2ee6a8, icon: '☕' },
  { key: 'notice',  label: '校园通知', color: 0x4dabff, icon: '◆' },
  { key: 'help',    label: '互助求助', color: 0xb07dff, icon: '✚' },
];

export const typeOf = (key) => EVENT_TYPES.find((t) => t.key === key) || EVENT_TYPES[3];

/* ------------------------------------------------------------------
   2. 上报模板（模拟真实学生语言）
------------------------------------------------------------------ */
export const TEMPLATES = {
  traffic: [
    '操场东侧这条路堵死了，刚下课人流太大，骑车根本过不去',
    '三食堂门口排队排到马路上了，队伍占了一半车道',
    '图书馆西侧路口两车剐蹭，暂时只能单边通行',
    '体育馆南门在施工，围挡占道，建议绕行教学楼那边',
  ],
  safety: [
    '实验楼后面的路灯坏了两盏，晚上那块特别黑，女生别单独走',
    '宿舍楼下电动车充电线乱拉，看着挺危险的',
    '操场西南角地面有块地砖翘起来了，刚才有人差点绊倒',
    '湖边护栏有一处松动，靠近水那边要小心',
  ],
  service: [
    '第一食堂二楼的麻辣香锅今天开窗口了，人不多',
    '图书馆三楼自习区现在空位挺多，想安静学习的可以来',
    '浴室今天热水很足，不用排队，速来',
    '快递驿站积压件清完了，取件不用等',
  ],
  notice: [
    '教务处通知：下周三下午全校停电检修，实验室提前保存数据',
    '体育场本周六有校运动会彩排，下午场地不对外开放',
    '图书馆国庆期间开馆时间调整为 9:00-17:00',
    '校医院本周开展免费体检，需提前在系统预约',
  ],
  help: [
    '有没有人捡到一张校园卡，姓名缩写 LXY，捡到请联系我',
    '求组队参加下周的算法比赛，还差一个会前端的',
    '有人在教学楼B 302 看到我的黑色雨伞吗',
    '拼车去高铁站，周五下午四点出发，还差两个人',
  ],
};

/* ------------------------------------------------------------------
   3. 标签精灵（用 Canvas 画文字贴在 3D 空间里）
------------------------------------------------------------------ */
function makeLabelSprite(text, colorHex) {
  const pad = 16;
  const fontSize = 30;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = `600 ${fontSize}px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
  const w = ctx.measureText(text).width;

  c.width = Math.ceil(w + pad * 2);
  c.height = fontSize + pad * 1.4;

  const ctx2 = c.getContext('2d');
  ctx2.font = `600 ${fontSize}px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx2.textBaseline = 'middle';

  // 背板
  const r = c.height / 2;
  ctx2.fillStyle = 'rgba(6,12,22,0.88)';
  ctx2.strokeStyle = colorHex;
  ctx2.lineWidth = 3;
  ctx2.beginPath();
  ctx2.roundRect(1.5, 1.5, c.width - 3, c.height - 3, r);
  ctx2.fill();
  ctx2.stroke();

  ctx2.fillStyle = colorHex;
  ctx2.fillText(text, pad, c.height / 2 + 1);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map: tex, transparent: true, depthTest: false, depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  // 标签作为「地图注记」始终可见，但尺寸要收敛，避免近景时压住建筑
  const scale = 0.052;
  sprite.scale.set(c.width * scale, c.height * scale, 1);
  sprite.renderOrder = 20;
  return sprite;
}

/** 人数徽标（圆形，金色底白字，醒目） */
function makeCountBadge(count) {
  const size = 56;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');

  // 圆形背景（金色渐变）
  const grad = ctx.createRadialGradient(size/2, size/2, 4, size/2, size/2, size/2);
  grad.addColorStop(0, '#ffd966');
  grad.addColorStop(1, '#e89a1a');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(size/2, size/2, size/2 - 2, 0, Math.PI * 2);
  ctx.fill();

  // 白色外圈
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // 数字
  ctx.fillStyle = '#3d2200';
  ctx.font = 'bold 26px -apple-system, "PingFang SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(count), size/2, size/2 + 1);

  // "人"小字
  ctx.font = '600 11px -apple-system, sans-serif';
  ctx.fillText('人', size/2, size/2 + 16);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map: tex, transparent: true, depthTest: false, depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  const s = 0.07;
  sprite.scale.set(size * s, size * s, 1);
  sprite.renderOrder = 25;
  return sprite;
}

/* ------------------------------------------------------------------
   4. 标记（光柱 + 脉冲环 + 标签 + 簇人数徽标）
   · clusterCount: 同簇独立上报人数，≥2 时显示人数徽标，光柱加粗
   · ghost: 是否为"待核实"幽灵标记（半透明虚线圈，安全类待核实用）
------------------------------------------------------------------ */
export function createMarker(ev, groundY = 0.2, opts = {}) {
  const { clusterCount = 1, ghost = false } = opts;
  const type = typeOf(ev.type);
  const hex = '#' + type.color.toString(16).padStart(6, '0');
  const g = new THREE.Group();
  g.position.set(ev.x, groundY, ev.z);

  // 簇强度系数：人数越多，光柱越粗越亮，脉冲环越大
  const intensity = Math.min(2.2, 1 + (clusterCount - 1) * 0.35);
  const beamR1 = 1.1 * intensity;
  const beamR2 = 2.4 * intensity;
  const beamOpacity = ghost ? 0.06 : 0.14 * Math.min(1.6, intensity);
  const ringOpacity = ghost ? 0.35 : 0.85;
  const coreScale = ghost ? 0.7 : 1;

  // —— 光柱（叠加混合会叠正反面，透明度要压得比直觉更低）
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(beamR1, beamR2, 34, 14, 1, true),
    new THREE.MeshBasicMaterial({
      color: type.color, transparent: true, opacity: beamOpacity,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    })
  );
  beam.position.y = 17;
  g.add(beam);

  // —— 地面脉冲环（幽灵模式下是虚线/半透）
  const rings = [];
  const ringCount = ghost ? 1 : 2;
  for (let i = 0; i < ringCount; i++) {
    const innerR = 3 * intensity;
    const outerR = (3.7 + i * 0.4) * intensity;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(innerR, outerR, ghost ? 24 : 40),
      new THREE.MeshBasicMaterial({
        color: type.color, transparent: true, opacity: ringOpacity,
        side: THREE.DoubleSide, depthWrite: false,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.userData.phase = i * 0.5;
    g.add(ring);
    rings.push(ring);
  }

  // —— 核心光点
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(1.5 * coreScale * intensity, 16, 16),
    new THREE.MeshBasicMaterial({
      color: type.color,
      transparent: ghost,
      opacity: ghost ? 0.5 : 1,
    })
  );
  core.position.y = 3.2;
  g.add(core);

  // —— 标签
  const label = makeLabelSprite(`${type.icon} ${type.label}`, hex);
  label.position.y = 34;
  if (ghost) label.material.opacity = 0.55;
  g.add(label);

  // —— 簇人数徽标（≥2 人时显示，在标签右侧）
  let countBadge = null;
  if (clusterCount >= 2) {
    countBadge = makeCountBadge(clusterCount);
    countBadge.position.y = 38;
    countBadge.position.x = label.scale.x * 0.55 + 1.5;
    g.add(countBadge);
  }

  // —— 拾取用透明碰撞体
  const hitR = 6 * intensity;
  const hit = new THREE.Mesh(
    new THREE.CylinderGeometry(hitR, hitR, 40, 8),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hit.position.y = 20;
  hit.userData.eventId = ev.id;
  g.add(hit);

  g.userData = { eventId: ev.id, rings, beam, core, label, countBadge, type, intensity, ghost };

  g.userData.update = (t, selected) => {
    rings.forEach((r, i) => {
      const p = ((t * 0.55 + r.userData.phase) % 1);
      const s = 1 + p * 3.4;
      r.scale.set(s, s, 1);
      const baseOp = ghost ? 0.3 : (selected ? 0.95 : 0.6);
      r.material.opacity = (1 - p) * baseOp;
    });
    core.scale.setScalar((1 + Math.sin(t * 3 + ev.x) * 0.14) * intensity * coreScale);
    const beamBase = ghost ? 0.06 : (selected ? 0.26 : 0.13 * Math.min(1.6, intensity));
    beam.material.opacity = beamBase + Math.sin(t * 2) * 0.03;
    label.position.y = 34 + Math.sin(t * 1.5 + ev.z * 0.1) * 1.2;
    if (countBadge) {
      countBadge.position.y = 34 + Math.sin(t * 1.5 + ev.z * 0.1) * 1.2;
      countBadge.position.x = label.scale.x * 0.6 + 2 + Math.sin(t * 2) * 0.3;
    }
  };

  return g;
}

/* ------------------------------------------------------------------
   5. AI 判断流程（模拟）
------------------------------------------------------------------ */
export const AI_STEPS = [
  { key: 'parse',  label: '语义解析', desc: '提取地点、事件、紧急度' },
  { key: 'class',  label: '分类打标', desc: '归入校园事件类型体系' },
  { key: 'dedupe', label: '去重比对', desc: '与近 30 分钟同类上报做时空比对' },
  { key: 'trust',  label: '可信度评分', desc: '结合上报人数与官方源交叉验证' },
  { key: 'pub',    label: '发布上线', desc: '写入实时信息流并推送周边学生' },
];

/* ================================================================
   5.1 事件 Schema（8 字段结构化抽取）
   ==================================================================
   所有来源（UGC / 官方 / 自动检测）输出同一种结构。
   地点字段锚定到 anchor_id（不是自由文本）—— 这是时空去重的前提。
================================================================== */
/**
 * 从原始上报 + 锚点信息，生成结构化 Schema
 * （模拟 LLM 约束解码的输出）
 */
export function extractSchema(ev, anchor, anchors = []) {
  const typeInfo = typeOf(ev.type);
  // 原文引用片段：从 text 里截取关键词周围的上下文
  const quote = ev.text.length > 30
    ? ev.text.slice(0, 30) + '…'
    : ev.text;

  // —— 地点候选 Top3（按距离排序，模拟 AI 的多候选匹配）——
  // 真实场景里是 NER + 向量检索 + 拼写纠错的多路召回
  // 这里用距离 + 文本包含度做近似
  const candidates = anchors
    .filter((a) => a.name && a.name.length > 1)
    .map((a) => {
      const dist = Math.hypot(a.x - ev.x, a.z - ev.z);
      // 文本匹配度：名字是否出现在原文里
      const textMatch = ev.text?.includes(a.name.replace(/[楼馆场院室]/g, '')) ? 0.3 : 0;
      // 距离越近分越高（1000m 为基线）
      const distScore = Math.max(0, 1 - dist / 1000);
      const score = Math.min(0.98, distScore * 0.7 + textMatch);
      return { name: a.name, score: +score.toFixed(2), distance: Math.round(dist) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return {
    type: ev.type,                    // 事件类型（safety/traffic/service/notice/help）
    anchor_id: anchor?.id || null,    // 地点锚点 ID（结构化，不是自由文本）
    anchor_name: anchor?.name || ev.place || '校园内',
    place_candidates: candidates,     // 地点候选 Top3（AI 置信度排序）
    floor: null,                      // 楼层（暂无，预留）
    start_time: ev.ts,                // 起始时间
    end_time: null,                   // 结束时间（持续事件才有）
    severity: ev.type === 'safety' ? 'medium' : 'low',  // 严重度
    evidence_type: ev.official ? 'official' : 'ugc_text', // 证据类型
    original_quote: quote,            // 原文引用片段（证据链）
    position_source: ev.position_source || 'manual_pick', // 位置来源
  };
}

/* ================================================================
   5.2 时空去重（三路取交）
   ==================================================================
   同一事件 ⟺ 空间 < 150 m 且 时间差 < 45 min 且 类型相同
   
   返回：{ isDuplicate: boolean, clusterId: string|null, count: number }
   空间阈值：150 m（锚点级别的"同一地点"半径）
   时间窗口：45 分钟（一节课的时间，足够多人看到同一事件）
================================================================== */
const SPACE_THRESHOLD = 150;   // 米
const TIME_THRESHOLD = 45 * 60 * 1000;  // 45 分钟

export function spatiotemporalDedupe(ev, existing) {
  const sameType = existing.filter(
    (e) => e.id !== ev.id && e.type === ev.type && e.status !== 'ended'
  );

  // 找时空邻近的事件
  const neighbors = sameType.filter((e) => {
    const dist = Math.hypot(e.x - ev.x, e.z - ev.z);
    const timeDiff = Math.abs(e.ts - ev.ts);
    return dist < SPACE_THRESHOLD && timeDiff < TIME_THRESHOLD;
  });

  if (neighbors.length === 0) {
    return { isDuplicate: false, clusterId: null, count: 1, neighbors: [] };
  }

  // 找到簇（取最近的一个作为簇代表）
  neighbors.sort((a, b) => {
    const da = Math.hypot(a.x - ev.x, a.z - ev.z);
    const db = Math.hypot(b.x - ev.x, b.z - ev.z);
    return da - db;
  });
  const clusterRep = neighbors[0];
  const clusterId = clusterRep.clusterId || clusterRep.id;

  // 簇内人数（按 reporter 去重）
  const reporters = new Set([ev.reporter]);
  neighbors.forEach((e) => reporters.add(e.reporter));

  return {
    isDuplicate: true,
    clusterId,
    count: reporters.size,
    neighbors: neighbors.map((e) => e.id),
  };
}

/* ================================================================
   5.3 可信度评分（三路证据 → 可分解加权）
   ==================================================================
   分数 = 基础分 × 来源权重 × 人数系数 × 常识校验
   
   三路证据：
     · UGC 交叉（独立上报人数）—— 5 人独立上报 ≫ 1 人上报 5 次
     · 官方源 RAG —— 保卫处/后勤通知
     · 常识一致性 —— 锚点存在性校验
   
   ★ 分数是可分解的，能打印贡献明细（评审会问"为什么是 0.73"）
================================================================== */
const CREDIBILITY_THRESHOLD = 0.65;   // 发布阈值
const SAFETY_THRESHOLD = 0.75;        // 安全类更高阈值

export function computeCredibility(ev, dedupeResult, anchor) {
  const breakdown = {};

  // 1. 基础分
  breakdown.base = 0.40;

  // 2. 来源权重
  if (ev.official) {
    breakdown.source = 0.35;  // 官方源 +0.35
  } else if (ev.position_source === 'gps') {
    breakdown.source = 0.10;  // GPS 定位 +0.10
  } else if (ev.position_source === 'manual_pick') {
    breakdown.source = 0.05;  // 手动选点 +0.05
  } else {
    breakdown.source = 0.00;
  }

  // 3. 人数系数（独立上报人数的对数缩放）
  const count = dedupeResult?.count || 1;
  if (count >= 5) {
    breakdown.crowd = 0.25;
  } else if (count >= 3) {
    breakdown.crowd = 0.18;
  } else if (count >= 2) {
    breakdown.crowd = 0.10;
  } else {
    breakdown.crowd = 0.00;
  }
  breakdown.crowd_note = `${count} 人独立上报`;

  // 4. 常识校验（锚点是否存在）
  if (anchor) {
    breakdown.commonSense = 0.05;
  } else {
    breakdown.commonSense = -0.10;  // 地点不明扣分
    breakdown.commonSense_note = '锚点匹配失败，地点存疑';
  }

  // 5. 文本质量（简单规则：字数越多分越高，但有上限）
  const textLen = ev.text?.length || 0;
  if (textLen >= 20) {
    breakdown.text = 0.05;
  } else if (textLen >= 10) {
    breakdown.text = 0.03;
  } else {
    breakdown.text = 0.00;
  }

  // 汇总（clamp 到 [0, 1]）
  const total = Math.min(1, Math.max(0,
    breakdown.base + breakdown.source + breakdown.crowd +
    breakdown.commonSense + breakdown.text
  ));

  // 判断是否通过
  const threshold = ev.type === 'safety' ? SAFETY_THRESHOLD : CREDIBILITY_THRESHOLD;
  const passed = total >= threshold;

  return {
    score: +total.toFixed(2),
    threshold,
    passed,
    breakdown,
    reason: passed
      ? `可信度 ${(total * 100).toFixed(0)}%，${breakdown.crowd_note}${ev.official ? '，官方源确认' : ''}`
      : `可信度 ${(total * 100).toFixed(0)}%，低于阈值 ${(threshold * 100).toFixed(0)}%，待人工核实`,
  };
}

/** 生成一次 AI 判断结果（整合 Schema + 去重 + 可信度） */
export function runAIPipeline(ev, existing, anchor, anchors = []) {
  // 1. 结构化抽取
  const schema = extractSchema(ev, anchor, anchors);

  // 2. 时空去重
  const dedupe = spatiotemporalDedupe(ev, existing);

  // 3. 可信度评分
  const credibility = computeCredibility(ev, dedupe, anchor);

  return {
    schema,
    dedupe,
    credibility,
    confidence: credibility.score,
    duplicateOf: dedupe.isDuplicate ? dedupe.clusterId : null,
    reach: Math.round(180 + Math.random() * 2400),
    latency: 0.4 + Math.random() * 0.9,
    reason: credibility.reason,
  };
}

/* ------------------------------------------------------------------
   6. 事件工厂
------------------------------------------------------------------ */
let SEQ = 0;

export function makeEvent({ type, x, z, text, reporter, official = false, place, position_source }) {
  return {
    id: `EV${String(++SEQ).padStart(4, '0')}`,
    type,
    x,
    z,
    text,
    reporter: reporter || `同学${1000 + Math.floor(Math.random() * 9000)}`,
    official,
    place: place || '校园内',
    position_source: position_source || 'manual_pick',
    ts: Date.now(),
    status: 'pending',       // pending / verifying / published / ended
    clusterId: null,         // 去重簇 ID
    ai: null,                // AI 处理结果
  };
}

/** 从模板随机造一条事件 */
/* —— 热点锚点池（模拟真实校园里事件集中的区域）—— */
// 食堂、图书馆、体育场是人流密集区，事件更容易扎堆
const HOTSPOT_NAMES = ['食堂', '中心图书馆', '体育场', '实验楼A', '宿舍A'];

export function randomEvent(anchors, official = false) {
  const keys = official ? ['notice'] : Object.keys(TEMPLATES);
  const type = keys[Math.floor(Math.random() * keys.length)];
  const list = TEMPLATES[type];
  const text = list[Math.floor(Math.random() * list.length)];

  // 70% 概率从热点锚点里选（形成可见的簇），30% 完全随机
  let a;
  const hotspotAnchors = anchors.filter((a) => HOTSPOT_NAMES.includes(a.name));
  if (hotspotAnchors.length > 0 && Math.random() < 0.7) {
    a = hotspotAnchors[Math.floor(Math.random() * hotspotAnchors.length)];
  } else {
    a = anchors[Math.floor(Math.random() * anchors.length)];
  }

  // 在锚点附近做随机偏移，同一簇内偏移更小（模拟同一地点不同人上报）
  const ang = Math.random() * Math.PI * 2;
  const dist = 8 + Math.random() * 28;
  const x = a.x + Math.cos(ang) * dist;
  const z = a.z + Math.sin(ang) * dist;

  return makeEvent({
    type, x, z, text, official,
    place: a.name,
    reporter: official ? '官方渠道' : undefined,
  });
}

/** 官方来源的模板文案（模拟官网/公众号抓取） */
export const OFFICIAL_TEMPLATES = TEMPLATES.notice;
