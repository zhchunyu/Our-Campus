import { describe, expect, it } from 'vitest'
import { teamCampusMap } from './campusMap.js'

// 合规守卫：地图配置里不得出现真实校名/地名（红线要求）。用 Unicode 转义避免写出原名。
const REAL_NAME_PATTERN = new RegExp(['\u5c71\u897f', '\u592a\u8c37', '\u519c\u5927', 's' + 'xau'].join('|'), 'i')

describe('campus map configuration', () => {
  it('uses the anonymised campus identity and the 2D guide image as the default scene', () => {
    expect(teamCampusMap.campusName).toBe('OurCampus · 本校区')
    expect(teamCampusMap.campusShortName).toBe('OurCampus · 本校区')
    expect(teamCampusMap.defaultScene).toBe('2d')
    expect(teamCampusMap.version).toBe('campus-plan-2d-v2')
  })

  it('keeps an anonymised 2D guide image without the original source link', () => {
    expect(teamCampusMap.scenes['2d'].imageUrl).toBe('/assets/campus-plan-hd.jpg')
    expect(teamCampusMap.scenes['2d'].sourceLabel).toBe('校园引导图 · 本校区')
    expect(teamCampusMap.scenes['2d'].sourceUrl).toBeUndefined()
    expect(teamCampusMap.mapSource).toBe('校园引导图')
  })

  it('never exposes a real school name or domain in the map configuration', () => {
    expect(JSON.stringify(teamCampusMap)).not.toMatch(REAL_NAME_PATTERN)
  })
})
