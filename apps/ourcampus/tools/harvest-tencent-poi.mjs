#!/usr/bin/env node
// 采集腾讯地图实测坐标，自动写入 src/data/tencentPoiPositions.js
//
// 目的：让地图标注与真实建筑"严格一一对应"。
//  1. 用当前估算坐标查询腾讯「逆地址解析 · 周边 POI」（radius 300 m）；
//  2. 按三级策略把 POI 匹配到地点：
//       ① 公寓编号匹配   —— POI 标题里的「N号公寓」与地点编号一致（最可靠）
//       ② 名称提示匹配   —— 命中 tools/poi-name-hints.local.json 里的名称片段
//       ③ 就近兜底       —— 取最近的 POI，且距离 ≤ --max-meters
//  3. 写回 tencentPoiPositions.js（代码会自动对已登记建筑使用实测坐标）。
//
// 用法：
//   $env:TENCENT_MAP_KEY = "你的key"              # 或写在 .env.local 的 VITE_TENCENT_MAP_KEY
//   node tools/check-tencent-key.mjs                    # ★ 先自检额度，确认接口能调（强烈建议）
//   node tools/harvest-tencent-poi.mjs --dry-run        # 先看匹配结果，不写文件
//   node tools/harvest-tencent-poi.mjs                  # 确认无误后写入
//   node tools/harvest-tencent-poi.mjs --max-meters 80  # 放宽/收紧就近兜底阈值
//   node tools/harvest-tencent-poi.mjs --radius 500     # 周边搜索半径（米，官方范围 1-5000，默认 300）
//   node tools/harvest-tencent-poi.mjs --policy 4       # 召回场景（默认 2，见下）
//
// 依赖接口：逆地址解析 /ws/geocoder/v1/（get_poi=1）。该接口与地点搜索共用「每日调用量」配额，
// 超限返回 status=121（充值余额不会解除该上限；可在腾讯位置服务控制台提升配额，或等每日重置）。
//
// ★ poi_options 语法（官方文档 webServiceGcoder，此前写错导致必然失败，2026-10-10 修正）：
//     多个参数必须用【英文分号】分隔，且只支持 address_format / radius / policy 三个键。
//     旧代码写成 'radius=300,page_size=20,page_index=1'——用了逗号、且 page_size/page_index
//     根本不是该接口的参数，服务端会把整串 '300,page_size=20,page_index=1' 当作 radius 的值，
//     于是即使额度充足也返回 348「poi_options中radius格式错误」。
//   policy 取值：1 默认(地标+道路)｜2 到家场景(精确到楼栋)｜3 出行场景｜4 社交签到｜5 位置共享；
//                1/2/3 最多返回 10 条周边 POI，4/5 最多 20 条。
//                默认用 2——宿舍楼属居住建筑，「到家场景」召回最对口。
//
// ★ 名称提示文件是本地辅助文件（已加入 .gitignore 与打包排除清单），不进入提交物。

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const appRoot = join(here, '..')
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const maxMeters = Number(args[args.indexOf('--max-meters') + 1]) || 60
// 官方 poi_options 约定：radius 范围 1-5000；policy 2 = 到家场景（精确到楼栋），最适合宿舍楼
const poiRadius = Math.min(Math.max(Number(args[args.indexOf('--radius') + 1]) || 300, 1), 5000)
const poiPolicy = Math.min(Math.max(Number(args[args.indexOf('--policy') + 1]) || 2, 1), 5)

function readKey() {
  if (process.env.TENCENT_MAP_KEY) return process.env.TENCENT_MAP_KEY.trim()
  const envFile = join(appRoot, '.env.local')
  if (existsSync(envFile)) {
    const line = readFileSync(envFile, 'utf8').split(/\r?\n/).find((l) => l.startsWith('VITE_TENCENT_MAP_KEY='))
    if (line) return line.slice('VITE_TENCENT_MAP_KEY='.length).trim()
  }
  return ''
}
const KEY = readKey()
if (!KEY) { console.error('缺少腾讯地图 Key：设置环境变量 TENCENT_MAP_KEY 或在 .env.local 里填 VITE_TENCENT_MAP_KEY'); process.exit(1) }

const hintsPath = join(here, 'poi-name-hints.local.json')
const HINTS = existsSync(hintsPath) ? JSON.parse(readFileSync(hintsPath, 'utf8')) : {}

const { locationRepository } = await import(pathToFileURL(join(appRoot, 'src/data/locations.js')).href)
const { getTencentCampusPosition } = await import(pathToFileURL(join(appRoot, 'src/data/tencentCampusGeo.js')).href)
const { TENCENT_POI_POSITIONS } = await import(pathToFileURL(join(appRoot, 'src/data/tencentPoiPositions.js')).href)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const meters = (a, b) => {
  const dLat = (a.lat - b.lat) * 111320
  const dLng = (a.lng - b.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180)
  return Math.hypot(dLat, dLng)
}

async function nearbyPois({ lat, lng }) {
  const url = new URL('https://apis.map.qq.com/ws/geocoder/v1/')
  url.searchParams.set('location', `${lat},${lng}`)
  url.searchParams.set('get_poi', '1')
  // ★ 分号分隔，且只用官方支持的键（见文件头说明）。
  //   searchParams 会把 ';' 编码成 %3B，服务端会正常解码。
  url.searchParams.set('poi_options', `radius=${poiRadius};policy=${poiPolicy}`)
  url.searchParams.set('key', KEY)
  const res = await fetch(url)
  const json = await res.json()
  if (json.status === 121) throw new Error('QUOTA')
  if (json.status !== 0) throw new Error(`geocoder ${json.status} ${json.message}`)
  return json.result?.pois ?? []
}

// 从 POI 标题里解析「N号公寓」编号
function apartmentNumberFromTitle(title) {
  const match = String(title).match(/(\d{1,2})\s*号?\s*(?:公寓|宿舍)/)
  return match ? Number(match[1]) : null
}

const locations = locationRepository.loadAll()
const found = { ...TENCENT_POI_POSITIONS }
const report = []
const seenPois = new Map()
const claimed = new Set()
let quotaHit = false

for (const location of locations) {
  const estimate = getTencentCampusPosition(location)
  if (!estimate) { report.push({ id: location.id, name: location.name, state: '无估算坐标' }); continue }
  let pois
  try {
    pois = await nearbyPois(estimate)
  } catch (error) {
    if (String(error.message) === 'QUOTA') { quotaHit = true; console.error('\n⚠️ 接口配额已用尽（status=121）。可在腾讯位置服务控制台提升「每日调用量」，或等每日重置后重跑。'); break }
    report.push({ id: location.id, name: location.name, state: `查询失败：${error.message}` })
    continue
  }
  const candidates = pois
    .map((poi) => ({ title: poi.title, lat: poi.location?.lat, lng: poi.location?.lng, distance: meters(estimate, poi.location ?? {}) }))
    .filter((poi) => Number.isFinite(poi.lat) && Number.isFinite(poi.lng))
    .map((poi) => { const key = `${poi.title}@${poi.lat.toFixed(5)},${poi.lng.toFixed(5)}`; seenPois.set(key, poi); return { ...poi, key } })
    .sort((a, b) => a.distance - b.distance)

  let chosen = null
  let how = ''

  // ① 公寓编号匹配
  if (location.mapApartmentNumber) {
    chosen = candidates.find((poi) => apartmentNumberFromTitle(poi.title) === location.mapApartmentNumber) ?? null
    if (chosen) how = '编号匹配'
  }
  // ② 名称提示匹配（本地提示文件）
  if (!chosen && Array.isArray(HINTS[location.id])) {
    for (const fragment of HINTS[location.id]) {
      const hit = candidates.find((poi) => String(poi.title).includes(fragment))
      if (hit) { chosen = hit; how = `名称匹配「${fragment}」`; break }
    }
  }
  // ③ 就近兜底
  if (!chosen) {
    const best = candidates.find((poi) => !claimed.has(poi.key) && poi.distance <= maxMeters)
    if (best) { chosen = best; how = '就近兜底' }
  }

  if (!chosen) {
    const nearest = candidates[0]
    report.push({ id: location.id, name: location.name, state: '未匹配', nearest: nearest ? `${nearest.title} ${nearest.distance.toFixed(0)}m` : '无周边 POI' })
  } else {
    claimed.add(chosen.key)
    found[location.id] = { lat: Number(chosen.lat.toFixed(6)), lng: Number(chosen.lng.toFixed(6)) }
    report.push({ id: location.id, name: location.name, state: '已采集', poi: chosen.title, how, shiftMeters: chosen.distance })
  }
  await sleep(180)
}

console.log('\n=== 采集结果 ===')
for (const row of report) {
  if (row.state === '已采集') {
    const flag = row.shiftMeters > 80 ? '  ⚠️ 偏移较大，请人工核对' : ''
    console.log(`  ✅ ${row.id.padEnd(34)} ${row.name.padEnd(12)} ← 「${row.poi}」 [${row.how}] 修正 ${row.shiftMeters.toFixed(1)} m${flag}`)
  } else {
    console.log(`  ⚠️ ${row.id.padEnd(34)} ${row.name.padEnd(12)} ${row.state}${row.nearest ? `（最近：${row.nearest}）` : ''}`)
  }
}
const ok = report.filter((r) => r.state === '已采集')
console.log(`\n匹配成功 ${ok.length}/${locations.length}；登记总数 ${Object.keys(found).length}`)
const byHow = ok.reduce((acc, r) => ({ ...acc, [r.how.split('「')[0]]: (acc[r.how.split('「')[0]] ?? 0) + 1 }), {})
console.log('匹配方式分布：', JSON.stringify(byHow))
if (ok.length) console.log(`偏移量：中位 ${ok.map((r) => r.shiftMeters).sort((a, b) => a - b)[Math.floor(ok.length / 2)].toFixed(0)} m，最大 ${Math.max(...ok.map((r) => r.shiftMeters)).toFixed(0)} m`)

// 校园范围内、未被任何地点匹配到的 POI —— 可能是还没收录的建筑
const BOUNDS = { minLat: 37.4190, maxLat: 37.4268, minLng: 112.5770, maxLng: 112.5925 }
const unmatched = [...seenPois.entries()].filter(([key]) => !claimed.has(key)).map(([, poi]) => poi)
  .filter((poi) => poi.lat >= BOUNDS.minLat && poi.lat <= BOUNDS.maxLat && poi.lng >= BOUNDS.minLng && poi.lng <= BOUNDS.maxLng)
  .sort((a, b) => a.title.localeCompare(b.title, 'zh'))
if (unmatched.length) {
  console.log(`\n=== 可能是未收录的建筑（校园内、未被匹配的 POI，共 ${unmatched.length} 个）===`)
  for (const poi of unmatched) console.log(`  ${String(poi.title).padEnd(28, '　')} ${poi.lat.toFixed(6)},${poi.lng.toFixed(6)}  距最近地点 ${poi.distance.toFixed(0)} m`)
  console.log('  → 要收录的：在 src/data/locations.js 加一条（中性名），坐标登记到 tencentPoiPositions.js 即可。')
}

if (quotaHit) console.log('\n提示：本次因配额中断，未写文件。配额恢复后重跑即可。')
if (!dryRun && !quotaHit && ok.length) {
  const sorted = Object.fromEntries(Object.entries(found).sort(([a], [b]) => a.localeCompare(b)))
  const body = `// 腾讯 POI 实测坐标表（每个建筑一个精确点）
//
// 数据来源：腾讯地图 WebService 接口实测，由 \`tools/harvest-tencent-poi.mjs\` 自动生成。
// 最后生成：${new Date().toISOString().slice(0, 10)}　登记 ${Object.keys(sorted).length} 个地点
//
// ★ 作用：官方校园引导图是手绘示意图（南北比例尺比东西大约 1.5 倍），用「图像像素 → 经纬度」
//   的全局仿射换算会有 10~100 m 的系统误差，越往南越大。凡登记在此的建筑一律使用实测坐标，
//   标注中心与建筑中心严格重合。
// ★ 未登记的建筑会退回「仿射 + 残差校正」（见 tencentCampusGeo.js），精度次之。
export const TENCENT_POI_POSITIONS = Object.freeze(${JSON.stringify(sorted, null, 2)})
`
  writeFileSync(join(appRoot, 'src/data/tencentPoiPositions.js'), body, 'utf8')
  console.log('\n已写入 src/data/tencentPoiPositions.js')
} else if (dryRun) {
  console.log('\n(--dry-run 模式，未写文件)')
}
