import { teamCampusMap } from './campusMap.js'
import { locationRepository } from './locations.js'
import { TENCENT_POI_POSITIONS } from './tencentPoiPositions.js'

export const TENCENT_CAMPUS_CENTER = Object.freeze({ lat: 37.423038, lng: 112.583703 })
export const TENCENT_CAMPUS_ZOOM = 17
// 缩放下限锁定 14 级：再往外缩就会把校园缩成一小块，标签也会互相压住，因此禁止。
export const TENCENT_CAMPUS_MIN_ZOOM = 14
export const TENCENT_CAMPUS_MAX_ZOOM = 20

// 由西校门、牌楼、明德楼、教学主楼和实验大楼的腾讯 POI 坐标校准。
// 输入是校园引导图原图像素位置，输出为腾讯地图使用的 GCJ-02 坐标。
const IMAGE_TO_GCJ02 = Object.freeze({
  lngX: 0.000007751548461,
  lngY: -0.0000006366223844,
  lngOffset: 112.5767195,
  latX: -0.0000001422525562,
  latY: -0.00001222785281,
  latOffset: 37.42964987,
})

const GCJ_A = 6378245.0
const GCJ_EE = 0.00669342162296594323
const GCJ_PI = Math.PI

function transformLatitude(x, y) {
  let value = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x))
  value += (20 * Math.sin(6 * x * GCJ_PI) + 20 * Math.sin(2 * x * GCJ_PI)) * 2 / 3
  value += (20 * Math.sin(y * GCJ_PI) + 40 * Math.sin(y / 3 * GCJ_PI)) * 2 / 3
  value += (160 * Math.sin(y / 12 * GCJ_PI) + 320 * Math.sin(y * GCJ_PI / 30)) * 2 / 3
  return value
}

function transformLongitude(x, y) {
  let value = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
  value += (20 * Math.sin(6 * x * GCJ_PI) + 20 * Math.sin(2 * x * GCJ_PI)) * 2 / 3
  value += (20 * Math.sin(x * GCJ_PI) + 40 * Math.sin(x / 3 * GCJ_PI)) * 2 / 3
  value += (150 * Math.sin(x / 12 * GCJ_PI) + 300 * Math.sin(x / 30 * GCJ_PI)) * 2 / 3
  return value
}

export function wgs84ToGcj02({ latitude, longitude }) {
  if (longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271) {
    return { lat: latitude, lng: longitude }
  }

  let latitudeDelta = transformLatitude(longitude - 105, latitude - 35)
  let longitudeDelta = transformLongitude(longitude - 105, latitude - 35)
  const radians = latitude / 180 * GCJ_PI
  let magic = Math.sin(radians)
  magic = 1 - GCJ_EE * magic * magic
  const rootMagic = Math.sqrt(magic)
  latitudeDelta = latitudeDelta * 180 / ((GCJ_A * (1 - GCJ_EE)) / (magic * rootMagic) * GCJ_PI)
  longitudeDelta = longitudeDelta * 180 / (GCJ_A / rootMagic * Math.cos(radians) * GCJ_PI)

  return { lat: latitude + latitudeDelta, lng: longitude + longitudeDelta }
}

export function getCampusMapPositionFromTencentPosition({ lat, lng }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const { lngX, lngY, lngOffset, latX, latY, latOffset } = IMAGE_TO_GCJ02
  const determinant = lngX * latY - lngY * latX
  const longitudeDelta = lng - lngOffset
  const latitudeDelta = lat - latOffset
  let imageX = (longitudeDelta * latY - lngY * latitudeDelta) / determinant
  let imageY = (lngX * latitudeDelta - longitudeDelta * latX) / determinant
  // 正向坐标包含局部修正，逆向也迭代消除同一修正，避免旧引导图上的定位再次偏移。
  for (let iteration = 0; iteration < 30; iteration += 1) {
    const correction = residualCorrection(imageX, imageY)
    const correctedLng = longitudeDelta - correction.lng
    const correctedLat = latitudeDelta - correction.lat
    const nextX = (correctedLng * latY - lngY * correctedLat) / determinant
    const nextY = (lngX * correctedLat - correctedLng * latX) / determinant
    if (Math.hypot(nextX - imageX, nextY - imageY) < 0.01) {
      imageX = nextX
      imageY = nextY
      break
    }
    imageX = (imageX + nextX) / 2
    imageY = (imageY + nextY) / 2
  }
  const base = applyAffine(imageX, imageY)
  const correction = residualCorrection(imageX, imageY)
  if (Math.hypot(base.lat + correction.lat - lat, base.lng + correction.lng - lng) > 0.00001) return null
  const scene = teamCampusMap.scenes['2d']
  const normalizedX = (imageX / scene.imageWidth - scene.crop.x) / scene.crop.width
  const normalizedY = (imageY / scene.imageHeight - scene.crop.y) / scene.crop.height

  if (normalizedX < 0 || normalizedX > 1 || normalizedY < 0 || normalizedY > 1) return null
  return [normalizedX, normalizedY]
}

// 有独立腾讯 POI 坐标的地点直接使用实测点，避免只靠校园引导图外推。
// 坐标表来自队友提交的腾讯 POI 与底图点击记录（2026-10-11）。
// 未采集地点仍为估算：用附近控制点残差修正示意图换算，不能等同于实测精度。
const CONTROL_RESIDUALS = Object.freeze((() => {
  const scene = teamCampusMap.scenes['2d']
  if (!scene) return []
  const locations = locationRepository.loadAll()
  return Object.entries(TENCENT_POI_POSITIONS)
    .map(([id, exact]) => {
      // 该点在原示意图中放错了建筑（队友记录偏差约 513m），不用于修正邻近地点。
      if (id === 'veterinary-center') return null
      const position = locations.find((item) => item.id === id)?.mapPosition?.['2d']
      if (!Array.isArray(position)) return null
      const imageX = (scene.crop.x + position[0] * scene.crop.width) * scene.imageWidth
      const imageY = (scene.crop.y + position[1] * scene.crop.height) * scene.imageHeight
      const base = applyAffine(imageX, imageY)
      return { imageX, imageY, dLat: exact.lat - base.lat, dLng: exact.lng - base.lng }
    })
    .filter(Boolean)
})())

function applyAffine(imageX, imageY) {
  const { lngX, lngY, lngOffset, latX, latY, latOffset } = IMAGE_TO_GCJ02
  return {
    lat: latX * imageX + latY * imageY + latOffset,
    lng: lngX * imageX + lngY * imageY + lngOffset,
  }
}

function residualCorrection(imageX, imageY) {
  let weightSum = 0, latSum = 0, lngSum = 0
  for (const control of CONTROL_RESIDUALS) {
    const distance = Math.hypot(imageX - control.imageX, imageY - control.imageY)
    if (distance < 1) return { lat: control.dLat, lng: control.dLng }
    // 反距离平方加权，仅用于未采集地点的近似定位。
    const weight = 1 / (distance * distance)
    weightSum += weight
    latSum += weight * control.dLat
    lngSum += weight * control.dLng
  }
  if (!weightSum) return { lat: 0, lng: 0 }
  return { lat: latSum / weightSum, lng: lngSum / weightSum }
}

export function getTencentCampusPosition(location) {
  const tencentPosition = TENCENT_POI_POSITIONS[location?.id]
  if (tencentPosition) return { ...tencentPosition }

  const position = location?.mapPosition?.['2d']
  const scene = teamCampusMap.scenes['2d']
  if (!Array.isArray(position) || position.length < 2 || !scene) return null

  const [normalizedX, normalizedY] = position
  if (!Number.isFinite(normalizedX) || !Number.isFinite(normalizedY)) return null

  const imageX = (scene.crop.x + normalizedX * scene.crop.width) * scene.imageWidth
  const imageY = (scene.crop.y + normalizedY * scene.crop.height) * scene.imageHeight
  const base = applyAffine(imageX, imageY)
  const correction = residualCorrection(imageX, imageY)
  const lat = base.lat + correction.lat
  const lng = base.lng + correction.lng

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

// ─────────────────────────────────────────────────────────────────────────────
// 地图拖动边界（校园标注范围）
//
// 目的：把「拖拽/缩放能到达的区域」限制在 App 已有地名标注的范围内，避免用户
// 一不小心把地图拖到校外很远的地方，回来还得重新找校园。
//
// 实现：腾讯 JS API GL 的 MapOptions 原生支持 `boundary`（LatLngBounds），
//   文档原文：「地图边界，设置后拖拽、缩放等操作无法将地图移动至边界外」，
//   对应方法 setBoundary() / getBoundary()。所以不需要自己监听事件做回弹。
//   https://lbs.qq.com/javascript_gl/doc/mapoptions.html
//   https://lbs.qq.com/javascript_gl/doc/latlngbounds.html
//
// 边界 = 全部地点标注坐标的最小外包矩形，再按比例外扩留白。
//
// ★ 留白比例由「校园占可拖动面积的目标占比」反推，不要凭感觉拍：
//     设留白比例为 r，则 边界边长 = 标注边长 × (1 + 2r)，面积比 = (1 + 2r)²
//     要求 校园面积 / 可拖动面积 = TARGET_AREA_RATIO
//     ⇒ (1 + 2r)² = 1 / TARGET_AREA_RATIO
//     ⇒ r = ( √(1 / TARGET_AREA_RATIO) − 1 ) / 2
//   目标 20% 时：r = (√5 − 1) / 2 ≈ 0.618，边界约为标注范围的 2.24 倍见方。
//
// ★ 南侧额外补偿（下边界加长）：
//   屏幕下方常驻功能菜单（底部标签栏 + 路线面板等），可视区实际只有上方那一块。
//   要把南边的地名拖到「菜单上方的可视区中央」，地图中心必须能继续往南移，
//   所以南边界在对称留白之外再单独加长一段。
//   加长量 = 底部 UI 高度（像素）× 默认缩放级别下的每像素米数，即
//   「把菜单遮住的那一段屏幕，换成地图上等长的南北距离」。改 TARGET_AREA_RATIO
//   或默认缩放都会自动跟着变。注意：加了南侧补偿后，校园占可拖动面积会
//   略低于 TARGET_AREA_RATIO（这是为了菜单避让有意付出的代价）。
// ─────────────────────────────────────────────────────────────────────────────
const METERS_PER_DEGREE_LAT = 111320
const EARTH_EQUATOR_METERS = 40075016.686
const TILE_SIZE = 256

/** 某纬度、某缩放级别下，1 像素约等于多少米（Web 墨卡托） */
function metersPerPixel(latitude, zoom) {
  return (EARTH_EQUATOR_METERS / TILE_SIZE) * Math.cos((latitude * Math.PI) / 180) / (2 ** zoom)
}

/** 校园标注范围应占「可拖动范围」的面积比例 */
export const TENCENT_CAMPUS_TARGET_AREA_RATIO = 0.2

/** 由目标面积占比反推的留白比例：r = (√(1/ratio) − 1) / 2 */
export const TENCENT_CAMPUS_BOUNDS_MARGIN_RATIO = (Math.sqrt(1 / TENCENT_CAMPUS_TARGET_AREA_RATIO) - 1) / 2

export const TENCENT_CAMPUS_BOUNDS_MARGIN_FLOOR_METERS = 60

/**
 * 底部功能菜单占据的屏幕高度（像素）。
 * 取值与 styles.css 中地图内容避让底部 UI 所用的 197px 保持一致
 * （`.tencent-campus-map__route-note { bottom: calc(197px + env(safe-area-inset-bottom)) }`）。
 */
export const TENCENT_CAMPUS_BOTTOM_UI_PIXELS = 197

/** 南侧（屏幕下方）在对称留白之外额外加长的米数 */
export const TENCENT_CAMPUS_BOTTOM_EXTRA_METERS =
  TENCENT_CAMPUS_BOTTOM_UI_PIXELS * metersPerPixel(TENCENT_CAMPUS_CENTER.lat, TENCENT_CAMPUS_ZOOM)

/**
 * 由一组坐标算出「标注范围」矩形，并按比例外扩留白。纯函数，便于单测。
 * @param {Array<{lat:number,lng:number}>} positions
 * @param {{marginRatio?:number, marginFloorMeters?:number, southExtraMeters?:number}} [options]
 *   southExtraMeters：南边界（屏幕下方）在对称留白之外再往南加的米数，默认 0。
 * @returns {{south:number,north:number,west:number,east:number}|null} 无有效坐标时返回 null
 */
export function computeLabelBounds(positions, options = {}) {
  const marginRatio = options.marginRatio ?? TENCENT_CAMPUS_BOUNDS_MARGIN_RATIO
  const marginFloorMeters = options.marginFloorMeters ?? TENCENT_CAMPUS_BOUNDS_MARGIN_FLOOR_METERS
  const southExtraMeters = options.southExtraMeters ?? 0
  const valid = (positions ?? []).filter((point) => Number.isFinite(point?.lat) && Number.isFinite(point?.lng))
  if (valid.length === 0) return null

  const lats = valid.map((point) => point.lat)
  const lngs = valid.map((point) => point.lng)
  const south = Math.min(...lats)
  const north = Math.max(...lats)
  const west = Math.min(...lngs)
  const east = Math.max(...lngs)

  const centerLat = (south + north) / 2
  const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos((centerLat * Math.PI) / 180)
  const latMargin = Math.max((north - south) * marginRatio, marginFloorMeters / METERS_PER_DEGREE_LAT)
  const lngMargin = Math.max((east - west) * marginRatio, marginFloorMeters / metersPerDegreeLng)

  return {
    south: south - latMargin - southExtraMeters / METERS_PER_DEGREE_LAT,
    north: north + latMargin,
    west: west - lngMargin,
    east: east + lngMargin,
  }
}

// 全部地点（含实测点与推算点）的标注范围，供腾讯地图 boundary 使用。
export const TENCENT_CAMPUS_LABEL_BOUNDS = Object.freeze(
  computeLabelBounds(
    locationRepository.loadAll().map((location) => getTencentCampusPosition(location)).filter(Boolean),
    { southExtraMeters: TENCENT_CAMPUS_BOTTOM_EXTRA_METERS },
  ),
)
