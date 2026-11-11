import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, mergeSettings } from './appSettings.js'

describe('app settings', () => {
  it('exposes all foundational display switches by default', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      showLabels: true,
      showHotspots: true,
      showRoute: true,
      showCurrentLocation: true,
      showStatusColors: true,
      showTips: true,
    })
  })

  it('merges only supported values over the defaults', () => {
    expect(mergeSettings({ showLabels: false, showTips: 'no', unknown: true })).toMatchObject({
      showLabels: false,
      showTips: true,
      showHotspots: true,
    })
  })
})
