import { teamCampusMap } from './campusMap.js'

const { crop } = teamCampusMap.scenes['2d']

function toMapPosition([x, y]) {
  const imageX = x / teamCampusMap.scenes['2d'].imageWidth
  const imageY = y / teamCampusMap.scenes['2d'].imageHeight
  return [
    (imageX - crop.x) / crop.width,
    (imageY - crop.y) / crop.height,
  ]
}

const CAMPUS_LANDMARKS = [
  {
    id: 'east-gate', name: '西校门', category: 'transport', imagePosition: [279, 410],
    aliases: ['西门', '校园西门', '校门'], description: '地图标注的本校区西校门。', keywords: ['出入口', '访客', '快递'],
  },
  {
    id: 'library', name: '图书馆', category: 'learning', imagePosition: [500, 525],
    aliases: ['校图书馆', '主图书馆'], description: '地图标注的校园图书馆。', keywords: ['阅读', '自习', '借阅', '讲座'],
  },
  {
    id: 'teaching-a', name: '明德楼', category: 'learning', imagePosition: [916, 354],
    aliases: ['教学楼', '教学科研楼', '一教'], description: '地图标注的明德楼。', keywords: ['教室', '上课', '课程', '教学'],
  },
  {
    id: 'canteen', name: '禾香餐厅', category: 'dining', imagePosition: [1180, 680],
    aliases: ['禾香', '学生食堂', '餐厅'], description: '地图标注的禾香餐厅。', keywords: ['吃饭', '餐饮', '食堂', '外卖'],
  },
  {
    id: 'gymnasium', name: '体育场', category: 'service', imagePosition: [1540, 650],
    aliases: ['体育场馆', '操场'], description: '地图标注的体育场。', keywords: ['运动', '训练', '比赛', '活动'],
  },
  {
    id: 'sports-ground', name: '运动场', category: 'service', imagePosition: [785, 321],
    aliases: ['操场', '田径场'], description: '地图北侧标注的运动场。', keywords: ['运动', '跑步', '训练'],
  },
  {
    id: 'ball-court', name: '篮球场', category: 'service', imagePosition: [1697, 642],
    aliases: ['球场', '球类场', '球类场地', '篮球'], description: '地图标注的篮球场。', keywords: ['篮球', '球类', '运动'],
  },
  {
    id: 'net-court', name: '网球场', category: 'service', imagePosition: [1721, 539],
    aliases: ['网球', '网球场地'], description: '地图标注的网球场。', keywords: ['网球', '球类', '运动'],
  },
  {
    id: 'swimming-pool', name: '游泳馆', category: 'service', imagePosition: [1490, 790],
    aliases: ['游泳池'], description: '地图标注的游泳馆。', keywords: ['游泳', '体育'],
  },
  {
    id: 'employee-canteen', name: '教工餐厅', category: 'dining', imagePosition: [520, 390],
    aliases: ['教工食堂', '教师餐厅'], description: '地图标注的教工餐厅。', keywords: ['餐饮', '食堂'],
  },
  {
    id: 'lab-building', name: '实验大楼', category: 'learning', imagePosition: [610, 390],
    aliases: ['实验楼'], description: '地图标注的实验大楼。', keywords: ['实验', '教学', '科研'],
  },
  {
    id: 'hospital', name: '校医院', category: 'service', imagePosition: [1132, 365],
    aliases: ['医院', '医务室'], description: '地图标注的校医院。', keywords: ['医疗', '就诊', '健康'],
  },
  {
    id: 'old-north-gate', name: '旧北门', category: 'transport', imagePosition: [1068, 326],
    aliases: ['北门旧门'], description: '地图标注的旧北门。', keywords: ['出入口', '校门'],
  },
  {
    id: 'new-north-gate', name: '新北门', category: 'transport', imagePosition: [1730, 531],
    aliases: ['北门', '北校门'], description: '地图标注的新北门。', keywords: ['出入口', '校门'],
  },
  {
    id: 'paifang', name: '牌楼', category: 'transport', imagePosition: [428, 420],
    aliases: ['校园牌楼'], description: '地图标注的校园牌楼。', keywords: ['地标', '入口'],
  },
  {
    id: 'botanical-garden', name: '植物园', category: 'service', imagePosition: [848, 695],
    aliases: ['校园植物园'], description: '地图标注的植物园。', keywords: ['园林', '植物', '休闲'],
  },
  {
    id: 'main-teaching-building', name: '教学主楼', category: 'learning', imagePosition: [1210, 465],
    aliases: ['主教学楼'], description: '地图标注的教学主楼。', keywords: ['教学', '教室', '上课'],
  },
  {
    id: 'chongwen-building', name: '博雅楼', category: 'learning', imagePosition: [1210, 398],
    aliases: ['博雅教学楼'], description: '地图标注的博雅楼。', keywords: ['教学', '教室'],
  },
]

const OTHER_CAMPUS_BUILDINGS = [
  { id: 'family-compound', name: '家属院', category: 'living', imagePosition: [656, 262] },
  { id: 'guest-house', name: '招待所', category: 'service', imagePosition: [548, 326] },
  { id: 'qinxue-building', name: '笃行楼', category: 'learning', imagePosition: [245, 544] },
  { id: 'resource-environment-college', name: '生态环境学院', category: 'learning', imagePosition: [245, 626] },
  { id: 'veterinary-center', name: '医学院', category: 'learning', imagePosition: [215, 671] },
  { id: 'life-sciences-building', name: '生命科学学院', category: 'learning', imagePosition: [202, 714] },
  { id: 'agricultural-engineering-building', name: '机械工程学院', category: 'learning', imagePosition: [315, 728] },
  { id: 'chongshi-building', name: '致知楼', category: 'learning', imagePosition: [438, 746] },
  { id: 'workshop-west-1', name: '车间（西）', category: 'service', imagePosition: [212, 788] },
  { id: 'workshop-west-2', name: '车间（北）', category: 'service', imagePosition: [298, 791] },
  { id: 'hanshi-building', name: '汇文楼', category: 'learning', imagePosition: [716, 414] },
  { id: 'tianshi-building', name: '思源楼', category: 'learning', imagePosition: [796, 430] },
  { id: 'physical-chemistry-building', name: '格物楼', category: 'learning', imagePosition: [1098, 420] },
  { id: 'chongxin-building', name: '立信楼', category: 'learning', imagePosition: [1303, 407] },
  { id: 'animal-science-building', name: '生物楼', category: 'learning', imagePosition: [1070, 535] },
  { id: 'teaching-management-building', name: '教学管理楼', category: 'learning', imagePosition: [891, 603] },
  { id: 'graduate-dormitory', name: '研究生宿舍', category: 'living', imagePosition: [1090, 548] },
  { id: 'kangxinyuan', name: '康馨园', category: 'living', imagePosition: [1285, 625] },
  { id: 'smart-greenhouse', name: '智能温室', category: 'service', imagePosition: [654, 746] },
  { id: 'food-laboratory', name: '花卉培养中心', category: 'learning', imagePosition: [760, 772] },
  { id: 'yixinyuan-canteen', name: '悦膳餐厅', category: 'dining', imagePosition: [1207, 780] },
  { id: 'dining-center', name: '饮食中心', category: 'dining', imagePosition: [1233, 782] },
  { id: 'heat-exchange-station', name: '换热站', category: 'service', imagePosition: [1281, 783] },
  { id: 'sports-department', name: '体育中心', category: 'service', imagePosition: [1540, 638] },
  { id: 'ruizhi-sports-center', name: '文体馆', category: 'service', imagePosition: [1687, 796] },
  { id: 'bitaoyuan-canteen', name: '桃李餐厅', category: 'dining', imagePosition: [1940, 649] },
  // 官方引导图上有标注、此前遗漏的两个地物，按官方标签位置补入
  { id: 'jing-garden', name: '静园', category: 'service', imagePosition: [280, 302] },
  { id: 'underpass', name: '地下通道', category: 'transport', imagePosition: [885, 287] },
  // 2026-10-11 负责人底图实测时新发现、此前未收录的地物（imagePosition 由实测坐标反算）
  {
    id: 'ming-lake', name: '大明湖', category: 'service', imagePosition: [688, 576],
    aliases: ['明湖', '湖'], description: '校园内的景观水体。', keywords: ['湖', '水体', '景观', '休闲'],
  },
  { id: 'talent-apartment', name: '人才公寓', category: 'living', imagePosition: [723, 475] },
  { id: 'eco-monitoring-center', name: '生态监测中心', category: 'learning', imagePosition: [699, 603] },
  { id: 'engineering-center', name: '工程中心', category: 'learning', imagePosition: [799, 377] },
].map((building) => ({
  ...building,
  aliases: building.aliases ?? [],
  description: building.description ?? `校园导览图标注的${building.name}。`,
  keywords: building.keywords ?? ['建筑', '校园地点'],
}))

const APARTMENT_POSITIONS = [
  [1000, 768], [1014, 724], [1050, 638], [1090, 598], [947, 634],
  [1210, 585], [1175, 568], [1335, 575], [1370, 636], [1380, 730],
  [1832, 820], [1830, 772], [1820, 730], [1820, 689], [1820, 650],
  [1820, 610], [1820, 575], [1835, 545], [1965, 820], [1975, 584],
  [574, 308], [579, 278], [490, 275],
]

const APARTMENT_PLACES = APARTMENT_POSITIONS.map((imagePosition, index) => {
  const number = index + 1
  const id = `apartment-${number}`
  const name = `${number}号公寓楼`
  return {
    id,
    name,
    category: 'living',
    imagePosition,
    mapApartmentNumber: number,
    aliases: [`${number}号公寓`, `${number}公寓`, `公寓${number}`],
    description: `地图标注的${name}。`,
    keywords: ['公寓', '宿舍', '住宿', `${number}号`],
  }
})

const DEMO_STATUS = Object.freeze({
  'east-gate': { activity: '西校门通行顺畅', crowdStatus: 'low', updatedAt: '8 分钟前' },
  library: { activity: '图书馆开放自习', crowdStatus: 'normal', updatedAt: '刚刚更新' },
  'teaching-a': { activity: '教学活动进行中', crowdStatus: 'normal', updatedAt: '5 分钟前' },
  canteen: { activity: '午餐时段 · 注意错峰', crowdStatus: 'busy', updatedAt: '2 分钟前' },
  'apartment-18': { activity: '18号公寓楼周边通行正常', crowdStatus: 'normal', updatedAt: '12 分钟前' },
  gymnasium: { activity: '体育场训练活动', crowdStatus: 'low', updatedAt: '20 分钟前' },
})

// 保留旧地名检索与官网入口；地点 ID 不变，账号收藏和云端记录继续关联。
const LEGACY_PLACES = Object.freeze({
  "library": {
    "name": "图书馆",
    "aliases": [
      "校图书馆",
      "主图书馆"
    ],
    "externalUrl": "https://libweb.sxau.edu.cn/"
  },
  "teaching-a": {
    "name": "崇学楼",
    "aliases": [
      "教学楼",
      "教学科研楼"
    ]
  },
  "canteen": {
    "name": "谷园餐厅",
    "aliases": [
      "谷园",
      "学生食堂",
      "餐厅"
    ]
  },
  "ball-court": {
    "name": "球类场",
    "aliases": [
      "球场",
      "篮球场",
      "球类场地"
    ]
  },
  "chongwen-building": {
    "name": "崇文楼",
    "aliases": [
      "崇文教学楼"
    ]
  },
  "qinxue-building": {
    "name": "勤学楼",
    "aliases": []
  },
  "resource-environment-college": {
    "name": "资源环境学院",
    "aliases": [],
    "externalUrl": "https://zhxy.sxau.edu.cn/index.htm"
  },
  "veterinary-center": {
    "name": "动物医学中心",
    "aliases": []
  },
  "agricultural-engineering-building": {
    "name": "农业工程学院",
    "aliases": []
  },
  "chongshi-building": {
    "name": "崇实楼",
    "aliases": []
  },
  "workshop-west-1": {
    "name": "车间",
    "aliases": []
  },
  "workshop-west-2": {
    "name": "车间",
    "aliases": []
  },
  "hanshi-building": {
    "name": "韩氏楼",
    "aliases": []
  },
  "tianshi-building": {
    "name": "田氏楼",
    "aliases": []
  },
  "physical-chemistry-building": {
    "name": "理化楼",
    "aliases": []
  },
  "chongxin-building": {
    "name": "崇信楼",
    "aliases": []
  },
  "animal-science-building": {
    "name": "动科楼",
    "aliases": []
  },
  "kangxinyuan": {
    "name": "康馨苑",
    "aliases": []
  },
  "food-laboratory": {
    "name": "食品实验室",
    "aliases": []
  },
  "yixinyuan-canteen": {
    "name": "怡馨园餐厅",
    "aliases": []
  },
  "sports-department": {
    "name": "体育部",
    "aliases": [],
    "externalUrl": "https://tyb.sxau.edu.cn/index.htm"
  },
  "ruizhi-sports-center": {
    "name": "睿智文体馆",
    "aliases": []
  },
  "bitaoyuan-canteen": {
    "name": "碧桃园餐厅",
    "aliases": []
  }
})

const demoLocations = [...CAMPUS_LANDMARKS, ...OTHER_CAMPUS_BUILDINGS, ...APARTMENT_PLACES].map((place) => ({
  ...place,
  aliases: [...new Set([...place.aliases, ...(LEGACY_PLACES[place.id]?.aliases ?? []), LEGACY_PLACES[place.id]?.name].filter(Boolean))],
  ...(LEGACY_PLACES[place.id]?.externalUrl ? { externalUrl: LEGACY_PLACES[place.id].externalUrl } : {}),
  source: 'campus-guide',
  sourceBuildingName: place.name,
  modelAnchorId: null,
  mapPosition: { '2d': toMapPosition(place.imagePosition) },
  entryNodeId: place.id === 'east-gate' ? 'main-gate-entry' : `${place.id}-entry`,
  firstPersonSpawnOffset: [0, 0, 0],
  keywords: [...new Set([place.name, ...place.aliases, ...place.keywords, LEGACY_PLACES[place.id]?.name].filter(Boolean))],
  openStatus: 'open',
  crowdStatus: 'normal',
  updatedAt: '刚刚更新',
  ...DEMO_STATUS[place.id],
}))

export const locationRepository = {
  loadAll() {
    return demoLocations.map((location) => ({
      ...location,
      aliases: [...location.aliases],
      keywords: [...location.keywords],
      mapPosition: { '2d': [...location.mapPosition['2d']] },
      firstPersonSpawnOffset: [...location.firstPersonSpawnOffset],
    }))
  },
}

export { demoLocations }
