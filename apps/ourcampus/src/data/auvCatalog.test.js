import { describe, expect, it } from 'vitest'
import { locationRepository } from './locations.js'
import { campusLocations } from '../../supabase/functions/_shared/campus-catalog.js'
import { validateExtractedEvent } from '../../supabase/functions/_shared/auv.js'

describe('AUV catalog and map contract', () => {
  it('uses the same complete id and display-name set as the current 2D map', () => {
    const frontend = locationRepository.loadAll().map(({ id, name }) => ({ id, name })).sort((a, b) => a.id.localeCompare(b.id))
    const gateway = campusLocations.map(({ id, name }) => ({ id, name })).sort((a, b) => a.id.localeCompare(b.id))
    expect(gateway).toEqual(frontend)
    expect(new Set(gateway.map(x => x.id)).size).toBe(73)
  })
  it('accepts guide-only places as explicit selections rather than rejecting them', () => {
    const raw = JSON.stringify({ type: 'service', description: '路灯故障' })
    expect(validateExtractedEvent(raw, '这里路灯坏了', 'jing-garden')).toMatchObject({ building_id: 'jing-garden', building_name: '儒园', location_status: 'selected' })
    expect(validateExtractedEvent(raw, '这里路灯坏了', 'underpass')).toMatchObject({ building_id: 'underpass', building_name: '地道口', location_status: 'selected' })
  })
  it('does not guess between the two workshops from a generic mention', () => {
    const raw = JSON.stringify({ type: 'service', description: '停电' })
    // 「车间」是通用别名，不用于自动定位；用户需按方向选择或明确说出「车间（西）/ 车间（北）」。
    expect(validateExtractedEvent(raw, '车间停电了').location_status).toBe('missing')
    expect(validateExtractedEvent(raw, '车间（北）停电了')).toMatchObject({ building_id: 'workshop-west-2', building_name: '车间（北）', location_status: 'text_match' })
  })
})
