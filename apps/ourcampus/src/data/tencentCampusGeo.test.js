import { describe, expect, it } from 'vitest'
import {
  TENCENT_CAMPUS_BOTTOM_EXTRA_METERS,
  TENCENT_CAMPUS_BOTTOM_UI_PIXELS,
  TENCENT_CAMPUS_BOUNDS_MARGIN_RATIO,
  TENCENT_CAMPUS_LABEL_BOUNDS,
  TENCENT_CAMPUS_TARGET_AREA_RATIO,
  computeLabelBounds,
  getTencentCampusPosition,
} from './tencentCampusGeo.js'
import { locationRepository } from './locations.js'

const METERS_PER_DEGREE_LAT = 111320
const metersLng = (deltaLng, lat) => deltaLng * METERS_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180)

const allPositions = () => locationRepository.loadAll().map(getTencentCampusPosition).filter(Boolean)

/** 用同一纬度基准把矩形换算成平方米，便于直接比较面积 */
function areaSquareMeters(bounds) {
  const midLat = (bounds.north + bounds.south) / 2
  return (bounds.north - bounds.south) * METERS_PER_DEGREE_LAT
    * metersLng(bounds.east - bounds.west, midLat)
}

/** 不含南侧补偿的「对称留白」基准矩形 */
const symmetricBounds = () => computeLabelBounds(allPositions())

// 地图拖动边界（腾讯 GL 的 MapOptions.boundary 用的就是这个矩形）
describe('campus map boundary', () => {
  it('returns null when there is no usable coordinate', () => {
    expect(computeLabelBounds([])).toBeNull()
    expect(computeLabelBounds(undefined)).toBeNull()
    expect(computeLabelBounds([{ lat: NaN, lng: 112 }, { lat: 37, lng: undefined }])).toBeNull()
  })

  it('encloses every input point', () => {
    const points = [
      { lat: 37.42, lng: 112.58 },
      { lat: 37.43, lng: 112.60 },
      { lat: 37.425, lng: 112.59 },
    ]
    const bounds = computeLabelBounds(points)
    for (const point of points) {
      expect(point.lat).toBeGreaterThan(bounds.south)
      expect(point.lat).toBeLessThan(bounds.north)
      expect(point.lng).toBeGreaterThan(bounds.west)
      expect(point.lng).toBeLessThan(bounds.east)
    }
  })

  it('expands by the configured ratio on both axes', () => {
    const points = [{ lat: 37.42, lng: 112.58 }, { lat: 37.43, lng: 112.60 }]
    const bounds = computeLabelBounds(points, { marginRatio: 0.1, marginFloorMeters: 0 })
    const latSpan = 37.43 - 37.42
    const lngSpan = 112.60 - 112.58
    expect(bounds.north - bounds.south).toBeCloseTo(latSpan * 1.2, 9)
    expect(bounds.east - bounds.west).toBeCloseTo(lngSpan * 1.2, 9)
  })

  it('never lets the margin collapse below the metre floor', () => {
    const bounds = computeLabelBounds([{ lat: 37.42, lng: 112.58 }], { marginRatio: 0.1, marginFloorMeters: 60 })
    const latMargin = (bounds.north - bounds.south) / 2
    expect(latMargin * METERS_PER_DEGREE_LAT).toBeGreaterThanOrEqual(59)
  })

  it('反推出的留白比例等于 (√5 − 1) / 2', () => {
    // 目标 20% ⇒ (1 + 2r)² = 5 ⇒ r = (√5 − 1) / 2 ≈ 0.618
    expect(TENCENT_CAMPUS_TARGET_AREA_RATIO).toBe(0.2)
    expect(TENCENT_CAMPUS_BOUNDS_MARGIN_RATIO).toBeCloseTo((Math.sqrt(5) - 1) / 2, 9)
    expect(TENCENT_CAMPUS_BOUNDS_MARGIN_RATIO).toBeCloseTo(0.618034, 6)
  })

  it('★ 对称留白下校园恰好占可拖动面积的 20%', () => {
    const positions = allPositions()
    const campusOnly = computeLabelBounds(positions, { marginRatio: 0, marginFloorMeters: 0 })
    expect(areaSquareMeters(campusOnly) / areaSquareMeters(symmetricBounds())).toBeCloseTo(TENCENT_CAMPUS_TARGET_AREA_RATIO, 3)
  })

  it('★ 南边界在对称留白之外再按底部菜单高度加长，其余三边不变', () => {
    const symmetric = symmetricBounds()
    const actual = TENCENT_CAMPUS_LABEL_BOUNDS
    const addedSouthMeters = (symmetric.south - actual.south) * METERS_PER_DEGREE_LAT

    expect(addedSouthMeters).toBeCloseTo(TENCENT_CAMPUS_BOTTOM_EXTRA_METERS, 3)
    // 北、东、西三边必须保持对称留白不变
    expect(actual.north).toBeCloseTo(symmetric.north, 12)
    expect(actual.east).toBeCloseTo(symmetric.east, 12)
    expect(actual.west).toBeCloseTo(symmetric.west, 12)
  })

  it('底部补偿量约等于「底部 UI 像素高度 × 默认缩放下每像素米数」', () => {
    expect(TENCENT_CAMPUS_BOTTOM_UI_PIXELS).toBe(197)
    // 纬度 37.42、zoom 17 时约 0.95 m/px ⇒ 197 px ≈ 187 m
    expect(TENCENT_CAMPUS_BOTTOM_EXTRA_METERS).toBeGreaterThan(150)
    expect(TENCENT_CAMPUS_BOTTOM_EXTRA_METERS).toBeLessThan(230)
  })

  it('covers every campus location label', () => {
    const bounds = TENCENT_CAMPUS_LABEL_BOUNDS
    expect(bounds).not.toBeNull()

    const positions = allPositions()
    expect(positions.length).toBeGreaterThan(60)
    for (const position of positions) {
      expect(position.lat).toBeGreaterThanOrEqual(bounds.south)
      expect(position.lat).toBeLessThanOrEqual(bounds.north)
      expect(position.lng).toBeGreaterThanOrEqual(bounds.west)
      expect(position.lng).toBeLessThanOrEqual(bounds.east)
    }
  })

  it('keeps the boundary within a sane size for a campus', () => {
    const bounds = TENCENT_CAMPUS_LABEL_BOUNDS
    const midLat = (bounds.north + bounds.south) / 2
    const latSpanMeters = (bounds.north - bounds.south) * METERS_PER_DEGREE_LAT
    const lngSpanMeters = metersLng(bounds.east - bounds.west, midLat)
    // 校园标注范围约 640 m × 1210 m；2.24 倍见方后再加约 187 m 南侧补偿
    expect(latSpanMeters).toBeGreaterThan(1500)
    expect(latSpanMeters).toBeLessThan(1750)
    expect(lngSpanMeters).toBeGreaterThan(2500)
    expect(lngSpanMeters).toBeLessThan(3000)
  })
})
