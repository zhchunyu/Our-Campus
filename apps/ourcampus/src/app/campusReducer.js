import { canManage, canPublishEvents, isHotspotActiveAt } from '../domain/campus.js'
import { CAMERA_MODES } from '../domain/camera.js'
import { createDemoRoute, createUnavailableRoute, ROUTE_MODES } from '../domain/route.js'
import { DEFAULT_SETTINGS, mergeSettings } from '../data/appSettings.js'
import { getActiveBlockedEdgeIds } from '../data/events.js'
import { getRoadEdgeOptions } from '../data/routeGraph.js'
import {
  isSavedPlaceFeedback,
  PLACE_FEEDBACK_DESCRIPTION_MAX_LENGTH,
  PLACE_FEEDBACK_REVIEW_NOTE_MAX_LENGTH,
  PLACE_FEEDBACK_STATUSES,
  PLACE_FEEDBACK_TYPES,
  validatePlaceFeedbackInput,
} from '../domain/placeFeedback.js'

function createRouteForState(state, overrides = {}, events = state.events) {
  const originId = overrides.originId ?? state.routePlan?.originId
  const destinationId = overrides.destinationId ?? state.routePlan?.destinationId
  const mode = overrides.mode ?? state.routePlan?.mode ?? state.settings.defaultRouteMode ?? ROUTE_MODES.SHORTEST
  if (!originId || !destinationId) return null

  const origin = state.locations.find((location) => location.id === originId)
  const destination = state.locations.find((location) => location.id === destinationId)

  if (origin?.openStatus === 'closed') {
    return createUnavailableRoute(originId, destinationId, mode, 'origin-closed')
  }
  if (destination?.openStatus === 'closed') {
    return createUnavailableRoute(originId, destinationId, mode, 'destination-closed')
  }

  const blockedEdgeIds = getActiveBlockedEdgeIds(events)
  const routePlan = createDemoRoute({
    originId,
    destinationId,
    mode,
    blockedEdgeIds,
  })

  if (
    routePlan.status === 'unavailable'
    && routePlan.unavailableReason === 'no-available-path'
    && mode === ROUTE_MODES.SHORTEST
    && blockedEdgeIds.length === 0
  ) {
    return {
      ...routePlan,
      status: 'preview',
      requiresTencentRoute: true,
      distance: 0,
      durationMinutes: 0,
      segments: [],
      nodeIds: [],
      points: [],
    }
  }

  return routePlan
}

const PERSISTED_LOCATION_FIELDS = Object.freeze([
  'description',
  'openStatus',
  'crowdStatus',
  'activity',
  'updatedAt',
  'updatedBy',
])

const MAX_ADMIN_HISTORY = 20

function appendAdminHistory(history, entry) {
  return [...history, entry].slice(-MAX_ADMIN_HISTORY)
}

function makeAdminAction({ type, targetId, label, before, after }) {
  return {
    id: `admin-action-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    targetId,
    label,
    before,
    after,
    operator: '管理员（演示）',
    createdAt: new Date().toISOString(),
  }
}

function mergePersistedLocations(locations, persistedLocations) {
  if (!Array.isArray(persistedLocations)) return locations

  const persistedById = new Map(persistedLocations.map((location) => [location?.id, location]))
  return locations.map((location) => {
    const persisted = persistedById.get(location.id)
    if (!persisted) return location

    const runtimePatch = Object.fromEntries(
      PERSISTED_LOCATION_FIELDS
        .filter((field) => Object.prototype.hasOwnProperty.call(persisted, field))
        .map((field) => [field, persisted[field]]),
    )
    return { ...location, ...runtimePatch }
  })
}

function refreshExpiredDemoEventWindows(persistedEvents, demoEvents, now) {
  const demoEventsById = new Map(demoEvents.map((event) => [event.id, event]))

  return persistedEvents.map((event) => {
    if (event?.status !== 'active' || isHotspotActiveAt(event, now)) return event

    const demoEvent = demoEventsById.get(event.id)
    if (!demoEvent || !isHotspotActiveAt(demoEvent, now)) return event

    return { ...event, startAt: demoEvent.startAt, endAt: demoEvent.endAt }
  })
}

export function createInitialState(locations, events = [], persistedState = null) {
  const persisted = persistedState && typeof persistedState === 'object' ? persistedState : {}
  const now = Date.now()
  const nextLocations = mergePersistedLocations(locations, persisted.locations)
  const nextEvents = Array.isArray(persisted.events)
    ? refreshExpiredDemoEventWindows(persisted.events, events, now)
    : events
  const persistedCurrentLocation = persisted.currentLocationId
    && nextLocations.some((location) => location.id === persisted.currentLocationId)
    ? persisted.currentLocationId
    : null
  const favoriteLocationIds = Array.isArray(persisted.favoriteLocationIds)
    ? [...new Set(persisted.favoriteLocationIds.filter((id) => nextLocations.some((location) => location.id === id)))]
    : []
  const savedRoutes = Array.isArray(persisted.savedRoutes)
    ? persisted.savedRoutes.filter((route) => (
        nextLocations.some((location) => location.id === route.originId)
        && nextLocations.some((location) => location.id === route.destinationId)
        && Object.values(ROUTE_MODES).includes(route.mode)
      ))
    : []

  return {
    locations: nextLocations,
    events: nextEvents,
    placeFeedback: Array.isArray(persisted.placeFeedback) ? persisted.placeFeedback : [],
    favoriteLocationIds,
    savedRoutes,
    adminHistory: Array.isArray(persisted.adminHistory) ? persisted.adminHistory.slice(-MAX_ADMIN_HISTORY) : [],
    eventTime: now,
    query: '',
    category: 'all',
    selectedId: null,
    currentLocationId: persistedCurrentLocation,
    mapScene: '2d',
    cameraMode: persisted.cameraMode === CAMERA_MODES.FIRST_PERSON ? CAMERA_MODES.FIRST_PERSON : CAMERA_MODES.ORBIT,
    role: ['visitor', 'student', 'manager'].includes(persisted.role) ? persisted.role : 'visitor',
    settings: mergeSettings({ ...DEFAULT_SETTINGS, ...persisted.settings }),
    toolbarOpen: false,
    activeTool: null,
    routePlan: null,
    lastSyncedAt: new Date(now).toISOString(),
    resetViewToken: 0,
  }
}

export function campusReducer(state, action) {
  switch (action.type) {
    case 'SET_MAP_SCENE':
      return { ...state, mapScene: '2d' }
    case 'REFRESH_EVENT_TIMELINE': {
      const eventTime = action.now ?? Date.now()
      const routePlan = state.routePlan
        ? createRouteForState(state, {}, state.events)
        : null

      return { ...state, eventTime, routePlan }
    }
    case 'SET_ROLE':
      return { ...state, role: action.role }
    case 'SET_QUERY':
      return { ...state, query: action.query }
    case 'SET_CATEGORY':
      return { ...state, category: action.category }
    case 'SELECT_LOCATION':
      return { ...state, selectedId: action.locationId }
    case 'SET_CURRENT_LOCATION': {
      const locationId = action.locationId ?? null
      if (locationId && !state.locations.some((location) => location.id === locationId)) return state

      const destinationId = state.routePlan?.destinationId ?? null
      const originId = locationId ?? 'east-gate'
      const routePlan = destinationId
        ? createRouteForState(state, {
            originId,
            destinationId,
            mode: state.routePlan?.mode ?? ROUTE_MODES.SHORTEST,
          })
        : null

      return { ...state, currentLocationId: locationId, routePlan }
    }
    case 'SET_CAMERA_MODE':
      return {
        ...state,
        cameraMode: action.mode === CAMERA_MODES.FIRST_PERSON ? CAMERA_MODES.FIRST_PERSON : CAMERA_MODES.ORBIT,
      }
    case 'SET_SETTINGS':
      return { ...state, settings: mergeSettings({ ...state.settings, ...action.changes }) }
    case 'RESET_SETTINGS':
      return { ...state, settings: mergeSettings() }
    case 'RESET_VIEW':
      return { ...state, resetViewToken: state.resetViewToken + 1 }
    case 'CLEAR_SELECTED_LOCATION':
      return { ...state, selectedId: null }
    case 'TOGGLE_TOOLBAR':
      return { ...state, toolbarOpen: action.open ?? !state.toolbarOpen }
    case 'SET_ACTIVE_TOOL':
      return { ...state, activeTool: action.tool }
    case 'SET_ROUTE_ORIGIN': {
      const destinationId = state.routePlan?.destinationId ?? null
      return {
        ...state,
        routePlan: createRouteForState(state, {
          originId: action.originId,
          destinationId,
        }),
      }
    }
    case 'SET_ROUTE_DESTINATION': {
      const originId = state.routePlan?.originId ?? state.currentLocationId ?? 'east-gate'
      return {
        ...state,
        selectedId: action.destinationId,
        routePlan: createRouteForState(state, {
          originId,
          destinationId: action.destinationId,
        }),
      }
    }
    case 'PLAN_ROUTE': {
      return {
        ...state,
        selectedId: null,
        routePlan: createRouteForState(state, {
          originId: action.originId ?? state.currentLocationId ?? 'east-gate',
          destinationId: action.destinationId,
        }),
      }
    }
    case 'SET_ROUTE_MODE':
      return state.routePlan
        ? {
            ...state,
            routePlan: createRouteForState(state, {
              originId: state.routePlan.originId,
              destinationId: state.routePlan.destinationId,
              mode: action.mode,
            }),
          }
        : state
    case 'CLEAR_ROUTE':
      return { ...state, routePlan: null }
    case 'SWAP_ROUTE_ENDPOINTS': {
      if (!state.routePlan) return state

      return {
        ...state,
        selectedId: state.routePlan.originId,
        routePlan: createRouteForState(state, {
          originId: state.routePlan.destinationId,
          destinationId: state.routePlan.originId,
          mode: state.routePlan.mode,
        }),
      }
    }
    case 'RESET_DEMO_DATA':
      return {
        ...state,
        locations: Array.isArray(action.locations) ? action.locations : state.locations,
        events: Array.isArray(action.events) ? action.events : state.events,
        placeFeedback: [],
        favoriteLocationIds: [],
        savedRoutes: [],
        adminHistory: [],
        selectedId: null,
        currentLocationId: null,
        routePlan: null,
        lastSyncedAt: new Date().toISOString(),
      }
    case 'SUBMIT_PLACE_FEEDBACK': {
      const feedback = action.feedback
      if (!isSavedPlaceFeedback(feedback) || feedback.status !== PLACE_FEEDBACK_STATUSES.PENDING) return state
      if (!state.locations.some((location) => location.id === feedback.locationId)) return state
      if (state.placeFeedback.some((entry) => entry.id === feedback.id)) return state
      if (validatePlaceFeedbackInput(feedback)) return state

      return {
        ...state,
        placeFeedback: [...state.placeFeedback, feedback],
        lastSyncedAt: new Date().toISOString(),
      }
    }
    case 'SET_FACILITY_REPORT_STATUS': {
      if (!canManage(state.role)) return state

      const report = state.placeFeedback.find((entry) => (
        entry.id === action.feedbackId && entry.type === PLACE_FEEDBACK_TYPES.REPAIR
      ))
      const allowedNextStatus = {
        [PLACE_FEEDBACK_STATUSES.PENDING]: PLACE_FEEDBACK_STATUSES.PROCESSING,
        [PLACE_FEEDBACK_STATUSES.PROCESSING]: PLACE_FEEDBACK_STATUSES.COMPLETED,
      }
      if (!report || allowedNextStatus[report.status] !== action.status) return state

      const now = action.now instanceof Date ? action.now : new Date(action.now ?? Date.now())
      if (!Number.isFinite(now.getTime())) return state
      const updatedReport = {
        ...report,
        status: action.status,
        reviewedAt: now.toISOString(),
        reviewedBy: '管理员（演示）',
      }

      return {
        ...state,
        placeFeedback: state.placeFeedback.map((entry) => entry.id === report.id ? updatedReport : entry),
        lastSyncedAt: now.toISOString(),
      }
    }
    case 'TOGGLE_FAVORITE_LOCATION': {
      if (!state.locations.some((location) => location.id === action.locationId)) return state
      const exists = state.favoriteLocationIds.includes(action.locationId)
      return {
        ...state,
        favoriteLocationIds: exists
          ? state.favoriteLocationIds.filter((id) => id !== action.locationId)
          : [...state.favoriteLocationIds, action.locationId],
      }
    }
    case 'SAVE_ROUTE': {
      const routePlan = action.routePlan ?? state.routePlan
      if (!routePlan || routePlan.status !== 'preview') return state
      const { originId, destinationId, mode } = routePlan
      if (!state.locations.some((location) => location.id === originId)
        || !state.locations.some((location) => location.id === destinationId)
        || !Object.values(ROUTE_MODES).includes(mode)) return state
      if (state.savedRoutes.some((route) => route.originId === originId && route.destinationId === destinationId && route.mode === mode)) return state

      const savedRoute = {
        id: `saved-route-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        originId,
        destinationId,
        mode,
        createdAt: new Date().toISOString(),
      }
      return { ...state, savedRoutes: [...state.savedRoutes, savedRoute] }
    }
    case 'REMOVE_SAVED_ROUTE':
      return {
        ...state,
        savedRoutes: state.savedRoutes.filter((route) => route.id !== action.routeId),
      }
    case 'PLAN_SAVED_ROUTE': {
      const savedRoute = state.savedRoutes.find((route) => route.id === action.routeId)
      if (!savedRoute) return state
      return {
        ...state,
        selectedId: null,
        routePlan: createRouteForState(state, savedRoute),
      }
    }
    case 'REVIEW_PLACE_FEEDBACK': {
      if (!canManage(state.role)) return state

      const feedback = state.placeFeedback.find((entry) => entry.id === action.feedbackId)
      if (!feedback || feedback.status !== PLACE_FEEDBACK_STATUSES.PENDING) return state
      if (feedback.type === PLACE_FEEDBACK_TYPES.REPAIR) return state
      if (![PLACE_FEEDBACK_STATUSES.APPROVED, PLACE_FEEDBACK_STATUSES.REJECTED].includes(action.decision)) return state

      const location = state.locations.find((entry) => entry.id === feedback.locationId)
      const now = action.now instanceof Date ? action.now : new Date(action.now ?? Date.now())
      const nowMs = now.getTime()
      const reviewNote = String(action.reviewNote ?? '').trim()
      if (!location || !Number.isFinite(nowMs) || reviewNote.length > PLACE_FEEDBACK_REVIEW_NOTE_MAX_LENGTH) return state

      let nextLocations = state.locations
      let nextEvents = state.events
      let approvedEventId = null

      if (action.decision === PLACE_FEEDBACK_STATUSES.APPROVED) {
        let locationChanges = null

        if (feedback.type === PLACE_FEEDBACK_TYPES.CROWD) {
          if (!['low', 'normal', 'busy'].includes(action.crowdStatus ?? feedback.crowdStatus)) return state
          locationChanges = { crowdStatus: action.crowdStatus ?? feedback.crowdStatus }
        } else if (feedback.type === PLACE_FEEDBACK_TYPES.OPEN_STATUS) {
          if (!['open', 'limited', 'closed'].includes(action.openStatus ?? feedback.openStatus)) return state
          locationChanges = { openStatus: action.openStatus ?? feedback.openStatus }
        } else if (feedback.type === PLACE_FEEDBACK_TYPES.LOCATION_INFO) {
          const description = String(action.approvedDescription ?? feedback.suggestedDescription ?? '').trim()
          if (!description || description.length > PLACE_FEEDBACK_DESCRIPTION_MAX_LENGTH) return state
          locationChanges = { description }
        } else if ([PLACE_FEEDBACK_TYPES.CLOSURE, PLACE_FEEDBACK_TYPES.CONSTRUCTION].includes(feedback.type)) {
          const endAt = new Date(action.endAt ?? feedback.reportedEndAt)
          if (Number.isNaN(endAt.getTime()) || endAt.getTime() <= nowMs) return state

          const validEdgeIds = new Set(getRoadEdgeOptions(location.id).map((option) => option.id))
          const affectedEdgeIds = [...new Set(Array.isArray(action.affectedEdgeIds) ? action.affectedEdgeIds : [])]
          if (affectedEdgeIds.some((edgeId) => !validEdgeIds.has(edgeId))) return state
          if (feedback.type === PLACE_FEEDBACK_TYPES.CONSTRUCTION && affectedEdgeIds.length === 0) return state

          approvedEventId = `event-feedback-${feedback.id}`
          if (state.events.some((event) => event.id === approvedEventId)) return state

          const isConstruction = feedback.type === PLACE_FEEDBACK_TYPES.CONSTRUCTION
          nextEvents = [...state.events, {
            id: approvedEventId,
            title: `${isConstruction ? '施工提醒' : '临时关闭'}：${location.name}`,
            type: isConstruction ? 'construction' : 'closure',
            locationId: location.id,
            status: 'active',
            startAt: now.toISOString(),
            endAt: endAt.toISOString(),
            heatLevel: 'medium',
            impact: feedback.description,
            affectedEdgeIds,
            source: 'feedback',
            visibleTo: ['visitor', 'student', 'manager'],
            updatedAt: now.toISOString(),
            updatedBy: '管理员（演示）',
          }]
        } else {
          return state
        }

        if (locationChanges) {
          const updatedLocation = {
            ...location,
            ...locationChanges,
            updatedAt: now.toISOString(),
            updatedBy: '管理员（演示）',
          }
          nextLocations = state.locations.map((entry) => entry.id === location.id ? updatedLocation : entry)
        }
      }

      const reviewedFeedback = {
        ...feedback,
        status: action.decision,
        reviewedAt: now.toISOString(),
        reviewedBy: '管理员（演示）',
        reviewNote,
        approvedEventId,
      }
      const nextFeedback = state.placeFeedback.map((entry) => entry.id === feedback.id ? reviewedFeedback : entry)
      const adminHistory = appendAdminHistory(state.adminHistory, makeAdminAction({
        type: 'feedback-review',
        targetId: feedback.id,
        label: `${action.decision === PLACE_FEEDBACK_STATUSES.APPROVED ? '通过' : '驳回'}地点反馈：${location.name}`,
        before: feedback,
        after: reviewedFeedback,
      }))
      const routePlan = state.routePlan
        ? createRouteForState({ ...state, locations: nextLocations }, {}, nextEvents)
        : null

      return {
        ...state,
        locations: nextLocations,
        events: nextEvents,
        placeFeedback: nextFeedback,
        adminHistory,
        routePlan,
        eventTime: nowMs,
        lastSyncedAt: now.toISOString(),
      }
    }
    case 'UPDATE_LOCATION_STATUS': {
      if (!canManage(state.role)) return state

      const before = state.locations.find((location) => location.id === action.locationId)
      if (!before) return state
      const unchanged = Object.entries(action.changes ?? {}).every(([key, value]) => before[key] === value)
      if (unchanged) return state

      const after = {
        ...before,
        ...action.changes,
        updatedAt: new Date().toISOString(),
        updatedBy: '管理员（演示）',
      }
      const nextLocations = state.locations.map((location) => location.id === action.locationId ? after : location)
      return {
        ...state,
        locations: nextLocations,
        routePlan: state.routePlan ? createRouteForState({ ...state, locations: nextLocations }) : null,
        adminHistory: appendAdminHistory(state.adminHistory, makeAdminAction({
          type: 'location-update',
          targetId: before.id,
          label: `修改地点：${before.name}`,
          before,
          after,
        })),
        lastSyncedAt: new Date().toISOString(),
      }
    }
    case 'PUBLISH_EVENT': {
      if (!canPublishEvents(state.role)) return state

      const exists = state.events.some((event) => event.id === action.event.id)
      if (exists) return state

      const after = {
        ...action.event,
        updatedAt: new Date().toISOString(),
        updatedBy: '管理员（演示）',
      }
      const nextEvents = [...state.events, after]
      return {
        ...state,
        events: nextEvents,
        adminHistory: appendAdminHistory(state.adminHistory, makeAdminAction({
          type: 'event-create',
          targetId: after.id,
          label: `发布热点：${after.title}`,
          before: null,
          after,
        })),
        routePlan: state.routePlan ? createRouteForState(state, {}, nextEvents) : null,
        lastSyncedAt: new Date().toISOString(),
      }
    }
    case 'CLOSE_EVENT': {
      if (!canPublishEvents(state.role)) return state

      const before = state.events.find((event) => event.id === action.eventId)
      if (!before || before.status === 'closed') return state

      const updatedAt = new Date().toISOString()
      const nextEvents = state.events.map((event) => (
        event.id === action.eventId
          ? { ...event, status: 'closed', updatedAt, updatedBy: '管理员（演示）' }
          : event
      ))
      const after = nextEvents.find((event) => event.id === action.eventId)

      return {
        ...state,
        events: nextEvents,
        adminHistory: appendAdminHistory(state.adminHistory, makeAdminAction({
          type: 'event-close',
          targetId: before.id,
          label: `结束热点：${before.title}`,
          before,
          after,
        })),
        routePlan: state.routePlan ? createRouteForState(state, {}, nextEvents) : null,
        lastSyncedAt: new Date().toISOString(),
      }
    }
    case 'UPDATE_EVENT': {
      if (!canPublishEvents(state.role)) return state

      const before = state.events.find((event) => event.id === action.eventId)
      if (!before) return state

      const updatedAt = new Date().toISOString()
      const after = {
        ...before,
        ...action.changes,
        id: before.id,
        updatedAt,
        updatedBy: '管理员（演示）',
      }
      const nextEvents = state.events.map((event) => event.id === before.id ? after : event)

      return {
        ...state,
        events: nextEvents,
        adminHistory: appendAdminHistory(state.adminHistory, makeAdminAction({
          type: 'event-update',
          targetId: before.id,
          label: `修改热点：${after.title}`,
          before,
          after,
        })),
        routePlan: state.routePlan ? createRouteForState(state, {}, nextEvents) : null,
        lastSyncedAt: new Date().toISOString(),
      }
    }
    case 'UNDO_ADMIN_ACTION': {
      if (!canManage(state.role) || state.adminHistory.length === 0) return state

      const action = state.adminHistory.at(-1)
      const adminHistory = state.adminHistory.slice(0, -1)
      let locations = state.locations
      let events = state.events

      if (action.type === 'location-update') {
        locations = state.locations.map((location) => (
          location.id === action.targetId ? action.before : location
        ))
      } else if (action.type === 'event-create') {
        events = state.events.filter((event) => event.id !== action.targetId)
      } else if (action.type === 'event-close' || action.type === 'event-update') {
        events = state.events.map((event) => (
          event.id === action.targetId ? action.before : event
        ))
      } else {
        return state
      }

      return {
        ...state,
        locations,
        events,
        adminHistory,
        routePlan: state.routePlan ? createRouteForState(state, {}, events) : null,
        lastSyncedAt: new Date().toISOString(),
      }
    }
    default:
      return state
  }
}
