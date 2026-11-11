export const SETTINGS_STORAGE_KEY = 'campus-twin:app-state:v3-shared-3d-primary'

export const DEFAULT_SETTINGS = Object.freeze({
  showLabels: true,
  showHotspots: true,
  showLostFound: false,
  showRoute: true,
  showCurrentLocation: true,
  showStatusColors: true,
  showTips: true,
  defaultRouteMode: 'shortest',
})

const BOOLEAN_SETTING_KEYS = Object.freeze([
  'showLabels',
  'showHotspots',
  'showLostFound',
  'showRoute',
  'showCurrentLocation',
  'showStatusColors',
  'showTips',
])

export function mergeSettings(value = {}) {
  const source = value && typeof value === 'object' ? value : {}
  const settings = { ...DEFAULT_SETTINGS }

  BOOLEAN_SETTING_KEYS.forEach((key) => {
    if (typeof source[key] === 'boolean') settings[key] = source[key]
  })

  if (typeof source.defaultRouteMode === 'string') settings.defaultRouteMode = source.defaultRouteMode
  return settings
}
