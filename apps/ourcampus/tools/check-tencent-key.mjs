#!/usr/bin/env node
// 腾讯地图 Key 可用性自检（只发探测请求，不写文件、不改配置、不消耗成功额度以外的东西）
//
// 为什么需要它：
//   腾讯位置服务**没有**「查询剩余配额」的开放接口；控制台的用量统计又有 1~24 小时延时。
//   所以判断"现在还能不能调"的唯一可靠办法，就是对每个接口各发 1 次最小请求看返回码。
//   本脚本把这套探测自动化，并给出人话结论。
//
// 用法：
//   $env:TENCENT_MAP_KEY = "你的key"        # 推荐：一次性环境变量，不落盘
//   node tools/check-tencent-key.mjs
//   也可以把 key 写在 .env.local 的 VITE_TENCENT_MAP_KEY（与 harvest 工具读法一致）
//
// 退出码：0 = 采集工具所需的接口可用；1 = 不可用；2 = 没找到 key
//
// 返回码含义（腾讯 WebService 公共状态码）：
//   0          ✅ 正常，额度可用
//   121        ❌ 该 key 每日调用量已达上限（额度用尽，或该服务没分配额度）
//   110 / 111  ❌ key 未授权该接口 / 请求来源未授权（去控制台勾选对应服务）
//   112        ❌ 来源 IP 未授权（如果给 key 设了 IP 白名单，命令行就会撞这个）
//   348        ⚠️ 参数错误（本脚本已按官方格式构造，正常不应出现）

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const appRoot = join(here, '..')

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
if (!KEY) {
  console.error('缺少腾讯地图 Key：设置环境变量 TENCENT_MAP_KEY，或在 .env.local 里填 VITE_TENCENT_MAP_KEY')
  process.exit(2)
}
const maskedKey = KEY.length > 12 ? `${KEY.slice(0, 5)}…${KEY.slice(-5)}` : '(已配置)'

// 本校区参考点，用于构造最小请求
const CAMPUS = { lat: 37.423038, lng: 112.583703 }

// 每个接口各探测 1 次。personal 的额度列出来方便对照官方文档。
const PROBES = [
  {
    id: 'geocoder',
    name: '逆地址解析',
    quota: '个人 6,000/日',
    critical: true, // harvest-tencent-poi.mjs 用的就是这个
    url: `https://apis.map.qq.com/ws/geocoder/v1/?location=${CAMPUS.lat},${CAMPUS.lng}&get_poi=1&poi_options=radius%3D300%3Bpolicy%3D2&key=${KEY}`,
  },
  {
    id: 'place-search',
    name: '地点搜索',
    quota: '个人 200/日',
    critical: false,
    url: `https://apis.map.qq.com/ws/place/v1/search?keyword=${encodeURIComponent('公寓')}&boundary=nearby(${CAMPUS.lat},${CAMPUS.lng},1000)&page_size=10&key=${KEY}`,
  },
  {
    id: 'suggestion',
    name: '关键词输入提示',
    quota: '个人 6,000/日',
    critical: false,
    url: `https://apis.map.qq.com/ws/place/v1/suggestion?keyword=${encodeURIComponent('公寓')}&region=${encodeURIComponent('晋中')}&key=${KEY}`,
  },
  {
    id: 'walking',
    name: '路线规划-步行',
    quota: '个人 6,000/日',
    critical: false,
    url: `https://apis.map.qq.com/ws/direction/v1/walking/?from=${CAMPUS.lat},${CAMPUS.lng}&to=37.4219,112.5846&key=${KEY}`,
  },
  {
    id: 'coord',
    name: '坐标转换',
    quota: '个人 6,000/日',
    critical: false,
    url: `https://apis.map.qq.com/ws/coord/v1/translate?locations=${CAMPUS.lat},${CAMPUS.lng}&type=1&key=${KEY}`,
  },
  {
    id: 'district',
    name: '行政区划-列表',
    quota: '个人 6,000/日',
    critical: false,
    url: `https://apis.map.qq.com/ws/district/v1/list?key=${KEY}`,
  },
]

function explain(status) {
  if (status === 0) return '✅ 可用'
  if (status === 121) return '❌ 今日额度用尽 / 该服务未分配额度'
  if (status === 110) return '❌ key 未授权该接口（去控制台勾选服务）'
  if (status === 111) return '❌ 请求来源未授权（key 的 WebServiceAPI 权限）'
  if (status === 112) return '❌ 来源 IP 未授权（key 设了 IP 白名单，命令行会撞这个）'
  if (status === 348) return '⚠️ 参数错误'
  return `⚠️ 其他错误（status=${status}）`
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

console.log(`\n腾讯地图 Key 自检　key=${maskedKey}`)
console.log('（官方无"剩余配额"接口，这里用每个接口各发 1 次请求来判断能否调用）\n')
console.log('接口'.padEnd(18, '　') + '官方个人额度'.padEnd(14) + '状态码  结论')
console.log('─'.repeat(78))

let criticalOk = false
const rows = []

for (const probe of PROBES) {
  let status = null
  let message = ''
  let httpError = ''
  try {
    const res = await fetch(probe.url, { signal: AbortSignal.timeout(20000) })
    const json = await res.json()
    status = json.status
    message = json.message ?? ''
  } catch (error) {
    httpError = error?.message ?? String(error)
  }

  const verdict = httpError ? `⚠️ 网络/请求失败：${httpError}` : explain(status)
  console.log(`${probe.name.padEnd(16, '　')}${probe.quota.padEnd(12, '　')}${String(status ?? '-').padEnd(6)}  ${verdict}`)
  if (status !== 0 && message) console.log(`${''.padEnd(30, ' ')}└ ${message}`)

  rows.push({ ...probe, status, message })
  if (probe.id === 'geocoder' && status === 0) criticalOk = true
  await sleep(1200) // 温和一点，避免被判定为异常高频
}

const blocked = rows.filter((r) => r.status !== 0)
console.log('\n' + '─'.repeat(78))

if (criticalOk && blocked.length === 0) {
  console.log('结论：✅ 全部可用 —— 可以立刻运行坐标采集：')
  console.log('      node tools/harvest-tencent-poi.mjs --dry-run')
} else if (criticalOk) {
  console.log('结论：🟡 采集工具所需的「逆地址解析」可用，可以先跑坐标采集。')
  console.log(`      另有 ${blocked.length} 个接口今日不可用（多半是额度用尽），不影响采集。`)
  console.log('      现在可以执行： node tools/harvest-tencent-poi.mjs --dry-run')
} else {
  console.log('结论：❌ 采集工具所需的「逆地址解析」当前不可调用，无法采集坐标。')
  console.log('      请到 https://lbs.qq.com/dev/console/quota/mine 检查：')
  console.log('        1) 开发者身份是否为「个人开发者」、账号总额度是否 > 0')
  console.log('        2) 该 Key 是否被分配到了额度（分配到 0 会一直返回 121）')
  console.log('        3) 是否已完成实名认证（未认证可能拿不到免费额度）')
  console.log('      注意：控制台用量统计有 1~24 小时延时，别以它为准判断"刚才那几次没算"。')
}

process.exit(criticalOk ? 0 : 1)
