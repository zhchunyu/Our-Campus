import { ROAD_GROUND_Y, ROAD_NODES, worldToMapPosition } from './roadNetwork.js'

// 直接对应共享仓库 site/src/navigation.campus.js 的 BUILDINGS 表。
// sx/sy 是仓库 SVG 坐标，shx/shy 是建筑半尺寸（SVG px）。
const BUILDING_SOURCE = [
  { id: 'east-gate', name: '主校门', sx: 340, sy: 502, shx: 14, shy: 6, type: 'landmark', entrance: 'south', aliases: ['东门服务中心', '东门', '服务中心', '校门', '大门', '主校门'] },
  { id: 'valley', name: '智谷谷底', sx: 340, sy: 462, shx: 18, shy: 28, type: 'landmark', entrance: 'south', aliases: ['智谷', '谷底'] },
  { id: 'library', name: '中心图书馆', sx: 340, sy: 300, shx: 32, shy: 28, type: 'landmark', entrance: 'south', aliases: ['图书馆', '中心图书馆', '主图书馆'] },
  { id: 'vertical-college', name: '垂直书院', sx: 340, sy: 246, shx: 18, shy: 18, type: 'landmark', entrance: 'south', aliases: ['书院', '垂直书院'] },
  { id: 'lecture-hall', name: '讲堂', sx: 340, sy: 165, shx: 26, shy: 18, type: 'landmark', entrance: 'south', aliases: ['大礼堂', '礼堂', '讲堂'] },

  { id: 'innovation-center', name: '创新中心', sx: 171.8, sy: 268.1, shx: 16.8, shy: 20.16, type: 'tech', entrance: 'east', aliases: ['创新中心', '科技创新中心'] },
  { id: 'student-center', name: '学生中心', sx: 219, sy: 268.1, shx: 16.8, shy: 20.16, type: 'tech', entrance: 'east', aliases: ['学生中心', '大学生活动中心', '大活'] },
  { id: 'performing-arts', name: '演艺中心', sx: 171.8, sy: 321.8, shx: 16.8, shy: 20.16, type: 'tech', entrance: 'east', aliases: ['演艺中心', '演艺厅'] },
  { id: 'maker-workshop', name: '创客工坊', sx: 219, sy: 321.8, shx: 16.8, shy: 20.16, type: 'tech', entrance: 'east', aliases: ['创客工坊', '创客'] },

  { id: 'research-center', name: '科研中心', sx: 478, sy: 268, shx: 35.26, shy: 15.58, type: 'lab', entrance: 'west', aliases: ['科研中心', '研究中心'] },
  { id: 'lab-a', name: '实验楼A', sx: 450.8, sy: 311.8, shx: 15.83, shy: 15.83, type: 'lab', entrance: 'west', aliases: ['实验楼', '实验楼A', '实验楼a'] },
  { id: 'lab-b', name: '实验楼B', sx: 495, sy: 311.8, shx: 15.83, shy: 15.83, type: 'lab', entrance: 'west', aliases: ['实验楼B', '实验楼b'] },

  { id: 'gymnasium', name: '体育馆', sx: 212.5, sy: 374, shx: 16.67, shy: 14.17, type: 'sports', entrance: 'east', aliases: ['体育馆', '篮球馆', '运动馆'] },
  { id: 'hospital', name: '校医院', sx: 170, sy: 374, shx: 15, shy: 15, type: 'sports', entrance: 'east', aliases: ['校医院', '医院', '医务室'] },
  { id: 'stadium', name: '体育场', sx: 198, sy: 426, shx: 42, shy: 24, type: 'sports', entrance: 'north', aliases: ['体育场', '操场', '运动场', '球场'] },

  { id: 'teaching-a', name: '公共教学楼', sx: 456.8, sy: 374.8, shx: 16.8, shy: 16.8, type: 'teach', entrance: 'west', aliases: ['第一教学楼', '教学楼', '一教', '公共教学楼'] },
  { id: 'teaching-b', name: '教学B楼', sx: 505.2, sy: 374.8, shx: 14.28, shy: 16.8, type: 'teach', entrance: 'west', aliases: ['教学B楼', 'B教', 'b教'] },
  { id: 'teaching-c', name: '教学C楼', sx: 456.8, sy: 429.2, shx: 16.8, shy: 16.8, type: 'teach', entrance: 'west', aliases: ['教学C楼', 'C教', 'c教'] },
  { id: 'teaching-d', name: '教学D楼', sx: 505.2, sy: 429.2, shx: 14.28, shy: 16.8, type: 'teach', entrance: 'west', aliases: ['教学D楼', 'D教', 'd教'] },

  { id: 'dormitory', name: '宿舍A', sx: 216.25, sy: 469.75, shx: 22.09, shy: 7.92, type: 'dorm', entrance: 'south', aliases: ['学生宿舍', '宿舍', '宿舍A'] },
  { id: 'dorm-b', name: '宿舍B', sx: 216.25, sy: 498.08, shx: 22.09, shy: 7.92, type: 'dorm', entrance: 'north', aliases: ['宿舍B', 'B宿舍'] },
  { id: 'graduate-apartment', name: '研究生公寓', sx: 273.75, sy: 469.75, shx: 22.09, shy: 7.92, type: 'dorm', entrance: 'south', aliases: ['研究生公寓', '研公寓', '研楼'] },
  { id: 'dorm-d', name: '宿舍D', sx: 273.75, sy: 498.08, shx: 22.09, shy: 7.92, type: 'dorm', entrance: 'north', aliases: ['宿舍D', 'D宿舍'] },
  { id: 'dorm-e', name: '宿舍E', sx: 409.83, sy: 469.75, shx: 22.09, shy: 7.92, type: 'dorm', entrance: 'south', aliases: ['宿舍E', 'E宿舍'] },
  { id: 'dorm-f', name: '宿舍F', sx: 467.33, sy: 469.75, shx: 22.09, shy: 7.92, type: 'dorm', entrance: 'south', aliases: ['宿舍F', 'F宿舍'] },
  { id: 'canteen', name: '食堂', sx: 409.83, sy: 498.08, shx: 22.09, shy: 7.92, type: 'canteen', entrance: 'north', aliases: ['学生食堂', '一食堂', '饭堂', '餐厅', '食堂'] },
  { id: 'commercial-street', name: '商业街', sx: 467.33, sy: 498.08, shx: 22.09, shy: 7.92, type: 'canteen', entrance: 'north', aliases: ['商业街', '生活服务街'] },

  { id: 'ring-s1', name: '环廊S1站', sx: 260, sy: 260, shx: 6, shy: 6, type: 'ring', aliases: ['S1站', 's1站', '环廊站'] },
  { id: 'ring-s4', name: '环廊S4站', sx: 340, sy: 340, shx: 6, shy: 6, type: 'ring', aliases: ['S4站', 's4站'] },
  { id: 'ring-s7', name: '环廊S7站', sx: 420, sy: 420, shx: 6, shy: 6, type: 'ring', aliases: ['S7站', 's7站'] },
]

const CATEGORY_BY_TYPE = Object.freeze({
  landmark: 'learning',
  tech: 'learning',
  lab: 'learning',
  sports: 'service',
  teach: 'learning',
  dorm: 'living',
  canteen: 'dining',
  ring: 'transport',
})

const MODEL_ANCHOR_BY_NAME = Object.freeze({
  '主校门': 'ANCHOR_Main_Gate',
  '中心图书馆': 'ANCHOR_Library',
  '创新中心': 'ANCHOR_Innovation_Center',
  '演艺中心': 'ANCHOR_Performing_Arts',
  '体育场': 'ANCHOR_Stadium',
  '体育馆': 'ANCHOR_Gymnasium',
  '校医院': 'ANCHOR_Hospital',
  '实验楼A': 'ANCHOR_Lab_A',
  '科研中心': 'ANCHOR_Research_Institute',
  '公共教学楼': 'ANCHOR_Teaching_A',
  '教学C楼': 'ANCHOR_Teaching_C',
  '宿舍A': 'ANCHOR_Dorm_West',
  '宿舍E': 'ANCHOR_Dorm_East',
  '食堂': 'ANCHOR_Canteen',
  '商业街': 'ANCHOR_Commercial_Street',
})

const DESCRIPTION_BY_TYPE = Object.freeze({
  landmark: '校园中轴上的公共地标，提供校园文化和公共活动服务。',
  tech: '科技创新片区公共空间，提供创新实践、学生服务和活动场地。',
  lab: '实验与科研片区建筑，提供教学实验和科研支持服务。',
  sports: '运动医疗片区公共设施，支持体育活动、赛事和健康服务。',
  teach: '教学片区楼宇，提供日常课程、多媒体教室和学院活动空间。',
  dorm: '学生生活片区，访客请按校园规定在入口处登记。',
  canteen: '生活服务片区，提供餐饮、商业和日常校园服务。',
  ring: '智慧环廊道路站点，连接校园主要片区。',
})

function worldFromSvg(sx, sy) {
  return [
    (sx - 340) * 2.4,
    ROAD_GROUND_Y,
    -(516 - sy) * 2.4,
  ]
}

function spawnOffsetForEntrance(entrance) {
  if (entrance === 'north') return [0, 5, -52]
  if (entrance === 'east') return [52, 5, 0]
  if (entrance === 'west') return [-52, 5, 0]
  return [0, 5, 52]
}

export const REPO_BUILDINGS = Object.freeze(BUILDING_SOURCE.map((building) => {
  const worldPosition = worldFromSvg(building.sx, building.sy)
  return Object.freeze({
    ...building,
    category: CATEGORY_BY_TYPE[building.type],
    description: DESCRIPTION_BY_TYPE[building.type],
    keywords: [...new Set([building.name, ...building.aliases, building.type])],
    modelAnchorId: MODEL_ANCHOR_BY_NAME[building.name] ?? null,
    worldPosition,
    mapPosition: worldToMapPosition(worldPosition),
    halfW: building.shx * 2.4,
    halfD: building.shy * 2.4,
    firstPersonSpawnOffset: spawnOffsetForEntrance(building.entrance),
    entryNodeId: building.id === 'east-gate' ? 'main-gate-entry' : `${building.id}-entry`,
  })
}))

export const REPO_BUILDING_BY_ID = Object.freeze(
  Object.fromEntries(REPO_BUILDINGS.map((building) => [building.id, building])),
)

export function findRepoBuilding(query) {
  const normalized = query?.trim().toLowerCase()
  if (!normalized) return null

  return REPO_BUILDINGS.find((building) => [building.name, ...building.aliases]
    .some((name) => name.toLowerCase() === normalized))
    ?? REPO_BUILDINGS.find((building) => [building.name, ...building.aliases]
      .some((name) => name.toLowerCase().includes(normalized)))
    ?? null
}

export function findNearestRoadNode(building) {
  const namedRoadNode = {
    'ring-s1': 'ring_s1',
    'ring-s4': 'ring_s4',
    'ring-s7': 'ring_s7',
  }[building.id]
  if (namedRoadNode) {
    const [bx, , bz] = building.worldPosition
    const node = ROAD_NODES[namedRoadNode]
    return { id: namedRoadNode, distance: Math.hypot(node.x - bx, node.y + bz) }
  }

  const [bx, , bz] = building.worldPosition
  const by = -bz
  let bestId = null
  let bestDistance = Infinity

  Object.entries(ROAD_NODES).forEach(([id, node]) => {
    const dx = node.x - bx
    const dy = node.y - by
    const distance = Math.hypot(dx, dy)
    let valid = true

    if (building.entrance === 'south') valid = dy < -5 && Math.abs(dx) < 80
    if (building.entrance === 'north') valid = dy > 5 && Math.abs(dx) < 80
    if (building.entrance === 'east') valid = dx > 5 && Math.abs(dy) < 80
    if (building.entrance === 'west') valid = dx < -5 && Math.abs(dy) < 80

    if (valid && distance < bestDistance) {
      bestDistance = distance
      bestId = id
    }
  })

  if (!bestId) {
    Object.entries(ROAD_NODES).forEach(([id, node]) => {
      const distance = Math.hypot(node.x - bx, node.y - by)
      if (distance < bestDistance) {
        bestDistance = distance
        bestId = id
      }
    })
  }

  return { id: bestId, distance: bestDistance }
}

export function buildingDoorPosition(building, roadNodeId = null) {
  const [bx, groundY, bz] = building.worldPosition
  const by = -bz
  const roadNode = ROAD_NODES[roadNodeId ?? findNearestRoadNode(building).id]
  let doorX = bx
  let doorY = by

  if (building.entrance === 'south') doorY = by - building.halfD - 3
  else if (building.entrance === 'north') doorY = by + building.halfD + 3
  else if (building.entrance === 'east') doorX = bx + building.halfW + 3
  else if (building.entrance === 'west') doorX = bx - building.halfW - 3
  else if (roadNode) {
    const dx = roadNode.x - bx
    const dy = roadNode.y - by
    const length = Math.hypot(dx, dy) || 1
    doorX = bx + dx / length * (Math.min(building.halfW, building.halfD) + 3)
    doorY = by + dy / length * (Math.min(building.halfW, building.halfD) + 3)
  }

  return [doorX, groundY, -doorY]
}
