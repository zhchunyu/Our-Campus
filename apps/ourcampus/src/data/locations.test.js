import { describe, expect, it } from 'vitest'
import { locationRepository } from './locations.js'
import { filterLocations } from '../domain/campus.js'

// 2026-11-12：按项目负责人要求还原地图真实地名，原先的「真实地名不得回归」守卫同步移除。
const REAL_NAMES = [
  '崇学楼', '崇文楼', '勤学楼', '崇实楼', '崇信楼', '理化楼', '动科楼', '韩氏楼', '田氏楼',
  '资源环境学院', '动物医学中心', '农业工程学院', '谷园餐厅', '怡馨园餐厅', '碧桃园餐厅',
  '体育部', '睿智文体馆', '康馨苑', '儒园', '地道口',
]

describe('campus locations', () => {
  const locations = locationRepository.loadAll()

  it('loads the complete location list with the real campus names', () => {
    // 2026-10-11：负责人实测时新增 5 个地物（网球场/大明湖/人才公寓/生态监测中心/工程中心），68 → 73
    expect(locations).toHaveLength(73)
    expect(locations.every((location) => location.source === 'campus-guide')).toBe(true)
    expect(locations.map((location) => location.name)).toEqual(expect.arrayContaining([
      '西校门', '图书馆', '崇学楼', '谷园餐厅', '农业工程学院', '碧桃园餐厅', '23号公寓楼', '儒园', '地道口',
    ]))
  })

  it('restores every place name that used to be anonymised', () => {
    const names = locations.map((location) => location.name)
    expect(names).toEqual(expect.arrayContaining(REAL_NAMES))
    for (const oldName of ['明德楼', '禾香餐厅', '机械工程学院', '博雅楼', '悦膳餐厅']) {
      expect(names).not.toContain(oldName)
    }
  })

  it('searches aliases without changing stable ids', () => {
    expect(filterLocations(locations, '图书馆').map((location) => location.id)).toContain('library')
    expect(filterLocations(locations, '教学楼').map((location) => location.id)).toContain('teaching-a')
    expect(filterLocations(locations, '学生食堂').map((location) => location.id)).toContain('canteen')
    expect(filterLocations(locations, '医务室').map((location) => location.id)).toContain('hospital')
  })

  it('keeps the guide-image coordinate conversion for the 2D scene', () => {
    const library = locations.find((location) => location.id === 'library')
    expect(library.mapPosition['2d'][0]).toBeCloseTo(0.2272817657, 9)
    expect(library.mapPosition['2d'][1]).toBeCloseTo(0.4705882352, 9)
    expect(locations.every((location) => location.mapPosition['2d'].every((value) => value >= 0 && value <= 1))).toBe(true)
  })
})
