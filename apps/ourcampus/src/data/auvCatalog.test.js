import { describe, expect, it } from 'vitest'
import { locationRepository } from './locations.js'
import { campusLocations } from '../../supabase/functions/_shared/campus-catalog.js'
import { validateExtractedEvent } from '../../supabase/functions/_shared/auv.js'

describe('AUV catalog and map contract', () => {
  it('uses the same complete id and display-name set as the current 2D map', () => {
    const frontend = locationRepository.loadAll().map(({ id, name }) => ({ id, name })).sort((a, b) => a.id.localeCompare(b.id))
    const gateway = campusLocations.map(({ id, name }) => ({ id, name })).sort((a, b) => a.id.localeCompare(b.id))
    expect(gateway).toEqual(frontend)
    expect(new Set(gateway.map(x => x.id)).size).toBe(68)
  })
  it('accepts guide-only places as explicit selections rather than rejecting them', () => {
    const raw = JSON.stringify({ type: 'service', description: '路灯故障' })
    expect(validateExtractedEvent(raw, '这里路灯坏了', 'jing-garden')).toMatchObject({ building_id: 'jing-garden', building_name: '静园', location_status: 'selected' })
    expect(validateExtractedEvent(raw, '这里路灯坏了', 'underpass')).toMatchObject({ building_id: 'underpass', building_name: '地下通道', location_status: 'selected' })
  })
  it('preserves ambiguity for a generic workshop while matching its explicit direction', () => {
    const raw = JSON.stringify({ type: 'service', description: '停电' })
    expect(validateExtractedEvent(raw, '车间停电了').location_status).toBe('ambiguous')
    expect(validateExtractedEvent(raw, '车间（北）停电了')).toMatchObject({ building_id: 'workshop-west-2', location_status: 'text_match' })
  })
})
