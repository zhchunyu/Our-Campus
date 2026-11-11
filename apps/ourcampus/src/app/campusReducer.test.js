import { describe, expect, it } from 'vitest'
import { createInitialState, campusReducer } from './campusReducer.js'
import { locationRepository } from '../data/locations.js'
import { demoEvents } from '../data/events.js'
import { CAMERA_MODES } from '../domain/camera.js'
import { listActiveHotspots } from '../domain/campus.js'

const initialState = createInitialState(locationRepository.loadAll(), demoEvents)

describe('campus reducer', () => {
  it('refreshes structural map bindings while preserving persisted status edits', () => {
    const locations = locationRepository.loadAll()
    const persisted = {
      locations: locations.map((location) => location.id === 'library'
        ? { ...location, mapPosition: { '3d': [999, 4, 999] }, openStatus: 'closed' }
        : location),
    }
    const state = createInitialState(locations, demoEvents, persisted)
    const library = state.locations.find((location) => location.id === 'library')

    expect(library.mapPosition['3d']).toEqual([0, 3, -518.4])
    expect(library.openStatus).toBe('closed')
  })

  it('refreshes expired persisted demo hotspot windows for a new session', () => {
    const persisted = {
      events: demoEvents.map((event) => event.id === 'event-library-lecture'
        ? { ...event, startAt: '2020-01-01T08:00:00.000Z', endAt: '2020-01-01T09:00:00.000Z' }
        : event),
    }
    const state = createInitialState(locationRepository.loadAll(), demoEvents, persisted)

    expect(listActiveHotspots(state.events, state.eventTime).map((event) => event.id)).toContain('event-library-lecture')
  })

  it('changes the active role and selected location', () => {
    const managerState = campusReducer(initialState, { type: 'SET_ROLE', role: 'manager' })
    const selectedState = campusReducer(managerState, { type: 'SELECT_LOCATION', locationId: 'canteen' })

    expect(selectedState.role).toBe('manager')
    expect(selectedState.selectedId).toBe('canteen')
  })

  it('updates a location only for managers', () => {
    const managerState = campusReducer(initialState, { type: 'SET_ROLE', role: 'manager' })
    const updatedState = campusReducer(managerState, {
      type: 'UPDATE_LOCATION_STATUS',
      locationId: 'library',
      changes: { openStatus: 'closed', crowdStatus: 'busy' },
    })

    expect(updatedState.locations.find((location) => location.id === 'library')).toMatchObject({
      openStatus: 'closed',
      crowdStatus: 'busy',
    })
    expect(Number.isNaN(Date.parse(updatedState.locations.find((location) => location.id === 'library').updatedAt))).toBe(false)
  })

  it('blocks and recalculates a route when its destination closes', () => {
    const managerState = campusReducer(initialState, { type: 'SET_ROLE', role: 'manager' })
    const routedState = campusReducer(managerState, {
      type: 'SET_ROUTE_DESTINATION',
      destinationId: 'library',
    })
    expect(routedState.routePlan.status).toBe('preview')

    const closedState = campusReducer(routedState, {
      type: 'UPDATE_LOCATION_STATUS',
      locationId: 'library',
      changes: { openStatus: 'closed' },
    })

    expect(closedState.routePlan).toMatchObject({
      status: 'unavailable',
      unavailableReason: 'destination-closed',
    })
  })

  it('does not create a route to a location that is already closed', () => {
    const managerState = campusReducer(initialState, { type: 'SET_ROLE', role: 'manager' })
    const closedState = campusReducer(managerState, {
      type: 'UPDATE_LOCATION_STATUS',
      locationId: 'library',
      changes: { openStatus: 'closed' },
    })

    const routedState = campusReducer(closedState, {
      type: 'SET_ROUTE_DESTINATION',
      destinationId: 'library',
    })

    expect(routedState.routePlan).toMatchObject({
      status: 'unavailable',
      unavailableReason: 'destination-closed',
    })
  })

  it('does not update status for non-managers', () => {
    const nextState = campusReducer(initialState, {
      type: 'UPDATE_LOCATION_STATUS',
      locationId: 'library',
      changes: { openStatus: 'closed' },
    })

    expect(nextState).toBe(initialState)
  })

  it('does not update an unknown location', () => {
    const managerState = campusReducer(initialState, { type: 'SET_ROLE', role: 'manager' })
    const nextState = campusReducer(managerState, {
      type: 'UPDATE_LOCATION_STATUS',
      locationId: 'missing',
      changes: { openStatus: 'closed' },
    })

    expect(nextState).toBe(managerState)
  })

  it('starts without a selected location and toggles the toolbar', () => {
    expect(initialState.selectedId).toBeNull()
    expect(initialState.toolbarOpen).toBe(false)

    const nextState = campusReducer(initialState, { type: 'TOGGLE_TOOLBAR' })

    expect(nextState.toolbarOpen).toBe(true)
    expect(nextState.selectedId).toBeNull()
  })

  it('creates and changes a route preview from a selected destination', () => {
    const destinationState = campusReducer(initialState, {
      type: 'SET_ROUTE_DESTINATION',
      destinationId: 'library',
    })
    const rainState = campusReducer(destinationState, { type: 'SET_ROUTE_MODE', mode: 'rain' })

    expect(destinationState.routePlan).toMatchObject({
      originId: 'east-gate',
      destinationId: 'library',
      mode: 'shortest',
    })
    expect(rainState.routePlan.mode).toBe('rain')
    expect(rainState.routePlan.destinationId).toBe('library')
  })

  it('clears the location detail selection after planning a route', () => {
    const selectedState = campusReducer(initialState, {
      type: 'SELECT_LOCATION',
      locationId: 'library',
    })
    const nextState = campusReducer(selectedState, {
      type: 'PLAN_ROUTE',
      destinationId: 'library',
    })

    expect(nextState.routePlan).toMatchObject({ destinationId: 'library', status: 'preview' })
    expect(nextState.selectedId).toBeNull()
  })

  it('creates a model-bound route when a destination is selected', () => {
    const nextState = campusReducer(initialState, {
      type: 'SET_ROUTE_DESTINATION',
      destinationId: 'library',
    })

    expect(nextState.routePlan.status).toBe('preview')
    expect(nextState.routePlan.points.at(-1)).toEqual([0, 3, -448.2])
    expect(nextState.routePlan.nodeIds.at(-1)).toBe('library-entry')
  })

  it('recalculates the same endpoints when the route mode changes', () => {
    const withRoute = campusReducer(initialState, {
      type: 'SET_ROUTE_DESTINATION',
      destinationId: 'gymnasium',
    })
    const nextState = campusReducer(withRoute, {
      type: 'SET_ROUTE_MODE',
      mode: 'avoid-construction',
    })

    expect(nextState.routePlan.mode).toBe('avoid-construction')
    expect(nextState.routePlan.originId).toBe('east-gate')
    expect(nextState.routePlan.destinationId).toBe('gymnasium')
    expect(nextState.routePlan.points.length).toBeGreaterThan(1)
  })

  it('uses a simulated location as the route origin', () => {
    const withLocation = campusReducer(initialState, {
      type: 'SET_CURRENT_LOCATION',
      locationId: 'library',
    })
    const withRoute = campusReducer(withLocation, {
      type: 'SET_ROUTE_DESTINATION',
      destinationId: 'gymnasium',
    })

    expect(withRoute.currentLocationId).toBe('library')
    expect(withRoute.routePlan.originId).toBe('library')
    expect(withRoute.routePlan.nodeIds[0]).toBe('library-entry')
  })

  it('recalculates an existing route when the simulated location changes', () => {
    const withRoute = campusReducer(initialState, {
      type: 'SET_ROUTE_DESTINATION',
      destinationId: 'library',
    })
    const nextState = campusReducer(withRoute, {
      type: 'SET_CURRENT_LOCATION',
      locationId: 'gymnasium',
    })

    expect(nextState.routePlan.originId).toBe('gymnasium')
    expect(nextState.routePlan.destinationId).toBe('library')
  })

  it('toggles first-person camera mode without changing route data', () => {
    const withRoute = campusReducer(initialState, {
      type: 'SET_ROUTE_DESTINATION',
      destinationId: 'library',
    })
    const nextState = campusReducer(withRoute, {
      type: 'SET_CAMERA_MODE',
      mode: CAMERA_MODES.FIRST_PERSON,
    })

    expect(nextState.cameraMode).toBe(CAMERA_MODES.FIRST_PERSON)
    expect(nextState.routePlan).toBe(withRoute.routePlan)
  })

  it('blocks hotspot publishing for non-managers', () => {
    const event = { id: 'event-new', title: '新活动', status: 'active' }
    const nextState = campusReducer(initialState, { type: 'PUBLISH_EVENT', event })

    expect(nextState).toBe(initialState)
  })

  it('allows managers to publish and close hotspots', () => {
    const managerState = campusReducer(initialState, { type: 'SET_ROLE', role: 'manager' })
    const publishedState = campusReducer(managerState, {
      type: 'PUBLISH_EVENT',
      event: { id: 'event-new', title: '新活动', status: 'active' },
    })
    const closedState = campusReducer(publishedState, { type: 'CLOSE_EVENT', eventId: 'event-new' })

    expect(publishedState.events.some((event) => event.id === 'event-new')).toBe(true)
    expect(closedState.events.find((event) => event.id === 'event-new').status).toBe('closed')
  })

  it('recalculates a route when a manager publishes a road event', () => {
    const managerState = campusReducer(initialState, { type: 'SET_ROLE', role: 'manager' })
    const withRoute = campusReducer(managerState, {
      type: 'SET_ROUTE_DESTINATION',
      destinationId: 'teaching-a',
    })
    const nextState = campusReducer(withRoute, {
      type: 'PUBLISH_EVENT',
      event: {
        id: 'event-road-live',
        title: '体育馆西侧道路维护',
        type: 'construction',
        locationId: 'teaching-a',
        status: 'active',
        affectedEdgeIds: ['road:inner_e_s7:inner_e_s8'],
      },
    })

    expect(withRoute.routePlan.nodeIds).toContain('inner_e_s7')
    expect(nextState.routePlan.nodeIds).not.toContain('inner_e_s7')
    expect(nextState.routePlan.distance).toBeGreaterThan(withRoute.routePlan.distance)
    expect(nextState.routePlan.blockedEdgeIds).toContain('road:inner_e_s7:inner_e_s8')
  })

  it('starts in the 3D scene and switches without clearing shared map state', () => {
    const withRoute = campusReducer(initialState, {
      type: 'SET_ROUTE_DESTINATION',
      destinationId: 'library',
    })
    const withSelection = campusReducer(withRoute, {
      type: 'SELECT_LOCATION',
      locationId: 'library',
    })
    const nextState = campusReducer(withSelection, { type: 'SET_MAP_SCENE', scene: '2d' })

    expect(initialState.mapScene).toBe('3d')
    expect(nextState.mapScene).toBe('2d')
    expect(nextState.selectedId).toBe('library')
    expect(nextState.routePlan).toBe(withSelection.routePlan)
  })

  it('normalizes unknown map scenes back to 2D', () => {
    const nextState = campusReducer(initialState, { type: 'SET_MAP_SCENE', scene: 'satellite' })

    expect(nextState.mapScene).toBe('3d')
  })

  it('updates and resets foundational map settings', () => {
    const hiddenState = campusReducer(initialState, {
      type: 'SET_SETTINGS',
      changes: { showLabels: false, showRoute: false },
    })

    expect(hiddenState.settings).toMatchObject({ showLabels: false, showRoute: false })

    const resetState = campusReducer(hiddenState, { type: 'RESET_SETTINGS' })
    expect(resetState.settings.showLabels).toBe(true)
    expect(resetState.settings.showRoute).toBe(true)
  })

  it('swaps the endpoints of an existing route', () => {
    const withRoute = campusReducer(initialState, {
      type: 'SET_ROUTE_DESTINATION',
      destinationId: 'library',
    })
    const swapped = campusReducer(withRoute, { type: 'SWAP_ROUTE_ENDPOINTS' })

    expect(swapped.routePlan).toMatchObject({ originId: 'library', destinationId: 'east-gate' })
    expect(swapped.selectedId).toBe('east-gate')
  })

  it('increments the view reset token without changing route state', () => {
    const withRoute = campusReducer(initialState, {
      type: 'SET_ROUTE_DESTINATION',
      destinationId: 'library',
    })
    const nextState = campusReducer(withRoute, { type: 'RESET_VIEW' })

    expect(nextState.resetViewToken).toBe(1)
    expect(nextState.routePlan).toBe(withRoute.routePlan)
  })
})
