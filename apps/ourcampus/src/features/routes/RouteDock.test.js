import { describe, expect, it } from 'vitest'
import { getRouteStatusLabel } from './RouteDock.jsx'

describe('route dock status', () => {
  it('explains when the selected route mode is unavailable', () => {
    expect(getRouteStatusLabel({ status: 'unavailable' })).toBe('当前模式下没有可用路线')
  })

  it('shows duration for a valid route', () => {
    expect(getRouteStatusLabel({ status: 'preview', durationMinutes: 9 })).toBe('约 9 分钟')
  })

  it('explains when the user is already at the destination', () => {
    expect(getRouteStatusLabel({ status: 'arrived' })).toBe('已到达目的地')
  })
})
