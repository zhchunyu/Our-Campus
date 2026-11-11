// 只比较已发布的物品描述。联系方式和图片不参与特征提取。
import { redactContact } from './ai-context.js'
const ACTIVE = new Set(['submitted', 'analyzed'])
const TYPES = [
  ['耳机', /耳机|airpods|headphones|earbuds/i], ['校园卡', /校园卡|学生卡|饭卡|一卡通/],
  ['身份证', /身份证/], ['钥匙', /钥匙|门禁/], ['手机', /手机|iphone/i],
  ['电脑', /电脑|笔记本|macbook/i], ['钱包', /钱包|卡包/], ['雨伞', /雨伞|晴雨伞|折叠伞/],
  ['眼镜', /眼镜/], ['手表', /手表|手环|watch/i], ['书包', /书包|背包/],
  ['水杯', /水杯|保温杯|水壶/], ['U盘', /u盘|优盘|移动硬盘/i], ['书本', /课本|教材|书本/],
]
const COLORS = [['白色', /白色|白的|纯白/], ['黑色', /黑色|黑的|纯黑/], ['蓝色', /蓝色|蓝的/], ['红色', /红色|红的/], ['粉色', /粉色|粉红/], ['绿色', /绿色|绿的/], ['灰色', /灰色|银灰/], ['黄色', /黄色|黄的/], ['紫色', /紫色|紫的/]]
const BRANDS = [['苹果', /苹果|apple|airpods|iphone|macbook/i], ['华为', /华为|huawei/i], ['小米', /小米|redmi/i], ['荣耀', /荣耀|honor/i], ['索尼', /索尼|sony/i], ['三星', /三星|samsung/i]]
const textOf = (r) => `${r.details?.item_name ?? r.title ?? ''}\n${r.body ?? ''}`.toLowerCase()
const occurred = (r) => Date.parse(r.details?.occurred_at ?? '')
const intersections = (a, b) => a.filter((v) => b.includes(v))
const normalizeItem = (v) => String(v ?? '').replace(/失物招领|寻找|寻物|招领|丢失|丢了|捡到|拾到|[\s：:·，。！？]/g, '').toLowerCase()
const itemTypes = (r) => {
  const primary = String(r.details?.item_name ?? r.title ?? '')
  const identified = TYPES.filter(([, re]) => re.test(primary)).map(([name]) => name)
  return identified.length ? identified : TYPES.filter(([, re]) => re.test(String(r.body ?? ''))).map(([name]) => name)
}

function itemColors(report, itemTypes) {
  const nearest = (text) => {
    const items = TYPES.filter(([name]) => itemTypes.includes(name)).flatMap(([, re]) => [...text.matchAll(new RegExp(re.source, 'ig'))])
    const colors = COLORS.flatMap(([name, re]) => [...text.matchAll(new RegExp(re.source, 'g'))].map((m) => ({ name, match: m })))
    const ranked = colors.map(({ name, match: c }) => ({ name, gap: Math.min(...items.map((i) => Math.max(0, c.index - i.index - i[0].length, i.index - c.index - c[0].length))) })).filter((c) => c.gap <= 5).sort((a, b) => a.gap - b.gap)
    return ranked.length ? [...new Set(ranked.filter((c) => c.gap === ranked[0].gap).map((c) => c.name))] : []
  }
  // 标题里的物品主色优先，收纳盒/挂件颜色不能抵消物品主色冲突。
  const primary = nearest(String(report.details?.item_name ?? report.title ?? ''))
  return primary.length ? primary : nearest(String(report.body ?? ''))
}

export function evaluateLostFoundMatch(a, b, now = Date.now()) {
  if (!a?.author_id || !b?.author_id || a.id === b.id || a.author_id === b.author_id ||
      !['lost', 'found'].includes(a.kind) || !['lost', 'found'].includes(b.kind) || a.kind === b.kind ||
      !ACTIVE.has(a.status) || !ACTIVE.has(b.status)) return null
  const lost = a.kind === 'lost' ? a : b; const found = a.kind === 'found' ? a : b
  const lostAt = occurred(lost); const foundAt = occurred(found)
  if (Number.isFinite(lostAt) && Number.isFinite(foundAt) && foundAt < lostAt - 30 * 60000) return null
  if ([a, b].some((r) => Number.isFinite(Date.parse(r.created_at)) && now - Date.parse(r.created_at) > 30 * 86400000)) return null
  const x = textOf(a); const y = textOf(b)
  const typesA = itemTypes(a)
  const typesB = itemTypes(b)
  const sharedTypes = intersections(typesA, typesB)
  if (typesA.length && typesB.length && !sharedTypes.length) return null
  const itemA = normalizeItem(a.details?.item_name ?? a.title); const itemB = normalizeItem(b.details?.item_name ?? b.title)
  const sameItem = itemA.length >= 2 && itemA === itemB
  if (!sharedTypes.length && !sameItem) return null
  const colorsA = itemColors(a, typesA)
  const colorsB = itemColors(b, typesB)
  const brandsA = BRANDS.filter(([, re]) => re.test(x)).map(([name]) => name)
  const brandsB = BRANDS.filter(([, re]) => re.test(y)).map(([name]) => name)
  const colors = intersections(colorsA, colorsB); const brands = intersections(brandsA, brandsB)
  if (colorsA.length && colorsB.length && !colors.length || brandsA.length && brandsB.length && !brands.length) return null
  const common = new Set([...TYPES.map(([n]) => n), ...COLORS.map(([n]) => n), '物品', '寻物', '招领', '丢失', '校园', '捡到', '找到'])
  const keywords = [...new Set([...(a.analysis?.keywords ?? []), ...(b.analysis?.keywords ?? [])])]
    .filter((k) => typeof k === 'string' && k.length >= 2 && k.length <= 30 && redactContact(k) === k && !common.has(k) && x.includes(k.toLowerCase()) && y.includes(k.toLowerCase())).slice(0, 3)
  const samePlace = Boolean(a.location_id && a.location_id === b.location_id)
  const closeTime = Number.isFinite(lostAt) && Number.isFinite(foundAt) && Math.abs(foundAt - lostAt) <= 4 * 3600000
  const score = 3 + (colors.length ? 2 : 0) + (brands.length ? 2 : 0) + (sameItem ? 1 : 0) + keywords.length + (samePlace ? 1 : 0) + (closeTime ? 1 : 0)
  // 泛泛的“耳机”不足以跨地点提醒；必须有特征或同地点且时间接近。
  if (score < 5 || !(colors.length || brands.length || keywords.length || sameItem || samePlace && closeTime)) return null
  const reasons = [`物品均为${sharedTypes[0] ?? itemA}`, ...colors.map((c) => `描述均有${c}`), ...brands.map((c) => `品牌均为${c}`), ...keywords.map((k) => `共同特征：${k}`)]
  if (samePlace) reasons.push('发布地点相同')
  if (closeTime) reasons.push('丢失与拾取时间接近')
  const warnings = ['仅为可能线索，请核对独有特征后联系，不代表已确认归属。']
  if (!samePlace) warnings.push('地点不同或未填写，请进一步核对。')
  if (!Number.isFinite(lostAt) || !Number.isFinite(foundAt)) warnings.push('缺少发生时间。')
  return { report_id: b.id, score, confidence: score >= 8 ? '较高' : '一般', reasons: reasons.slice(0, 6), warnings,
    generated_by: a.analysis?.generated_by === 'auv' ? 'auv-features' : 'feature-rules' }
}

export function rankLostFoundMatches(report, candidates, now = Date.now()) {
  return candidates.map((r) => evaluateLostFoundMatch(report, r, now)).filter(Boolean)
    .sort((a, b) => b.score - a.score || String(a.report_id).localeCompare(String(b.report_id))).slice(0, 5)
}
