import { SETTINGS_STORAGE_KEY } from './appSettings.js'
import { CROWD_STATUS, HOTSPOT_STATUS, HOTSPOT_TYPES, OPEN_STATUS, ROLES } from '../domain/campus.js'
import { ROUTE_MODES } from '../domain/route.js'
import { isSavedPlaceFeedback } from '../domain/placeFeedback.js'

const CURRENT_SCHEMA_VERSION = 3
const ROLE_VALUES = new Set(Object.values(ROLES))
const OPEN_STATUS_VALUES = new Set(Object.values(OPEN_STATUS))
const CROWD_STATUS_VALUES = new Set(Object.values(CROWD_STATUS))
const HOTSPOT_STATUS_VALUES = new Set(Object.values(HOTSPOT_STATUS))
const HOTSPOT_TYPE_VALUES = new Set(Object.values(HOTSPOT_TYPES))
const ROUTE_MODE_VALUES = new Set(Object.values(ROUTE_MODES))
const ADMIN_ACTION_TYPES = new Set(['location-update', 'event-create', 'event-close', 'event-update', 'feedback-review'])

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isOptionalString(record, key) {
  return !Object.hasOwn(record, key) || typeof record[key] === 'string'
}

function isTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function hasValidTimestampFields(record) {
  const hasStart = Object.hasOwn(record, 'startAt')
  const hasEnd = Object.hasOwn(record, 'endAt')
  if (hasStart && !isTimestamp(record.startAt)) return false
  if (hasEnd && !isTimestamp(record.endAt)) return false
  if (hasStart && hasEnd && Date.parse(record.endAt) <= Date.parse(record.startAt)) return false
  return true
}

function isSavedLocation(value) {
  return isRecord(value)
    && typeof value.id === 'string'
    && (!Object.hasOwn(value, 'openStatus') || OPEN_STATUS_VALUES.has(value.openStatus))
    && (!Object.hasOwn(value, 'crowdStatus') || CROWD_STATUS_VALUES.has(value.crowdStatus))
    && isOptionalString(value, 'description')
    && isOptionalString(value, 'activity')
    && isOptionalString(value, 'updatedAt')
    && isOptionalString(value, 'updatedBy')
}

function isSavedEvent(value) {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.locationId === 'string'
    && HOTSPOT_TYPE_VALUES.has(value.type)
    && isOptionalString(value, 'activityCategory')
    && HOTSPOT_STATUS_VALUES.has(value.status)
    && hasValidTimestampFields(value)
    && (!Object.hasOwn(value, 'affectedEdgeIds') || (
      Array.isArray(value.affectedEdgeIds) && value.affectedEdgeIds.every((id) => typeof id === 'string')
    ))
    && (!Object.hasOwn(value, 'visibleTo') || (
      Array.isArray(value.visibleTo) && value.visibleTo.every((role) => ROLE_VALUES.has(role))
    ))
}

function isSavedAdminAction(value) {
  return isRecord(value)
    && typeof value.id === 'string'
    && ADMIN_ACTION_TYPES.has(value.type)
    && typeof value.targetId === 'string'
    && typeof value.label === 'string'
    && isTimestamp(value.createdAt)
    && (value.before === null || isRecord(value.before))
    && (value.after === null || isRecord(value.after))
}

function isSavedRoute(value) {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.originId === 'string'
    && typeof value.destinationId === 'string'
    && ROUTE_MODE_VALUES.has(value.mode)
    && isTimestamp(value.createdAt)
}

function migratePersistedState(value) {
  if (!isRecord(value)) return null

  const version = value.schemaVersion ?? 0
  if (!Number.isInteger(version) || version < 0 || version > CURRENT_SCHEMA_VERSION) return null
  if (value.locations !== undefined && (!Array.isArray(value.locations) || !value.locations.every(isSavedLocation))) return null
  if (value.events !== undefined && (!Array.isArray(value.events) || !value.events.every(isSavedEvent))) return null
  if (value.adminHistory !== undefined && (!Array.isArray(value.adminHistory) || !value.adminHistory.every(isSavedAdminAction))) return null
  if (version >= 2 && (!Array.isArray(value.placeFeedback) || !value.placeFeedback.every(isSavedPlaceFeedback))) return null
  if (value.favoriteLocationIds !== undefined && (!Array.isArray(value.favoriteLocationIds) || !value.favoriteLocationIds.every((id) => typeof id === 'string'))) return null
  if (value.savedRoutes !== undefined && (!Array.isArray(value.savedRoutes) || !value.savedRoutes.every(isSavedRoute))) return null
  if (version >= 3 && (!Array.isArray(value.favoriteLocationIds) || !Array.isArray(value.savedRoutes))) return null
  if (value.settings !== undefined && !isRecord(value.settings)) return null

  return {
    ...value,
    placeFeedback: version >= 2 ? value.placeFeedback : [],
    favoriteLocationIds: Array.isArray(value.favoriteLocationIds) ? value.favoriteLocationIds : [],
    savedRoutes: Array.isArray(value.savedRoutes) ? value.savedRoutes : [],
    schemaVersion: CURRENT_SCHEMA_VERSION,
    role: ROLE_VALUES.has(value.role) ? value.role : ROLES.VISITOR,
  }
}

function getStorage() {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function loadPersistedState() {
  const storage = getStorage()
  if (!storage) return null

  try {
    const raw = storage.getItem(SETTINGS_STORAGE_KEY)
    return raw ? migratePersistedState(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

export function savePersistedState(state) {
  const storage = getStorage()
  if (!storage) return

  const payload = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    mapProfile: 'shared-3d-main',
    locations: state.locations,
    events: state.events,
    placeFeedback: state.placeFeedback ?? [],
    favoriteLocationIds: state.favoriteLocationIds ?? [],
    savedRoutes: state.savedRoutes ?? [],
    adminHistory: state.adminHistory,
    settings: state.settings,
    role: state.role,
    mapScene: state.mapScene,
    cameraMode: state.cameraMode,
    currentLocationId: state.currentLocationId,
  }

  try {
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // 存储不可用时保持演示继续运行，未来 API 接入不会依赖这里。
  }
}

export function clearPersistedState() {
  const storage = getStorage()
  if (!storage) return

  try {
    storage.removeItem(SETTINGS_STORAGE_KEY)
  } catch {
    // Ignore storage cleanup failures.
  }
}
