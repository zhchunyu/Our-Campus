import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Compass, LayoutGrid, Radio } from 'lucide-react'
import { createLocalCampusDataSource } from './data/campusDataSource.js'
import { loadPersistedState, savePersistedState } from './data/appStorage.js'
import { buildAuvContext } from './data/auvContext.js'
import { loadTimetable } from './data/timetable.js'
import { teamCampusMap } from './data/campusMap.js'
import { campusDisplayRecord } from './data/campusPresentation.js'
import { eventRepository } from './data/events.js'
import { campusServices } from './data/campusServices.js'
import { describeLocationError, getDeviceLocation } from './data/deviceGeolocation.js'
import { wgs84ToGcj02 } from './data/tencentCampusGeo.js'
import { cloudLostFoundPost, createFacilityContribution, createLostFoundPost, lostFoundReportDetails, loadCommunityState, LOCAL_AUTHOR_ID, MAX_LOCAL_POSTS, reviewFacilityContribution, saveCommunityState, updateLostFoundStatus } from './data/campusCommunity.js'
import { informationDraftForUser, setReportStatus, submitCampusReport } from './data/campusInformation.js'
import { disablePushDevice } from './data/campusPush.js'
import { useCampusInformation } from './features/notifications/useCampusInformation.js'
import { useCampusPush } from './features/notifications/useCampusPush.js'
import { NotificationCenter } from './features/notifications/NotificationCenter.jsx'
import { useNotificationPreferences } from './features/notifications/useNotificationPreferences.js'
import { CampusNoticeBanner } from './features/notifications/CampusNoticeBanner.jsx'
import { locationRepository } from './data/locations.js'
import { listActiveHotspots, filterLocations, ROLE_LABELS } from './domain/campus.js'
import { createPlaceFeedback, PLACE_FEEDBACK_TYPES } from './domain/placeFeedback.js'
import { searchCampusResources } from './domain/search.js'
import { campusReducer, createInitialState } from './app/campusReducer.js'
import { LocationDetail } from './features/locations/LocationDetail.jsx'
import { PlaceFeedbackSheet } from './features/locations/PlaceFeedbackSheet.jsx'
import { ExplorePanel } from './features/mobile/ExplorePanel.jsx'
import { CanvasHome } from './features/mobile/CanvasHome.jsx'
import { HallPanel } from './features/mobile/HallPanel.jsx'
import { LoginSheet } from './features/mobile/LoginSheet.jsx'
import { useCampusAuth } from './features/account/useCampusAuth.js'
import { markStartupReady } from './app/startup.js'
import { useRealtimeHall } from './features/mobile/useRealtimeHall.js'
import { MePanel } from './features/mobile/MePanel.jsx'
import { MemberProfilePage } from './features/mobile/MemberProfilePage.jsx'
import { MobileTabBar } from './features/mobile/MobileTabBar.jsx'
import { PrimaryPageActions } from './features/mobile/PrimaryPageActions.jsx'
import { MyPublicationsPage } from './features/mobile/MyPublicationsPage.jsx'
import { TripPanel } from './features/mobile/TripPanel.jsx'
import { MapWorkspace } from './features/map/MapWorkspace.jsx'
import { RouteDock } from './features/routes/RouteDock.jsx'
import { RestaurantReviewsPage } from './features/reviews/RestaurantReviewsPage.jsx'
import { AuvAssistantPage } from './features/ai/AuvAssistantPage.jsx'
import { TimetablePage } from './features/timetable/TimetablePage.jsx'
import { useBackLayer } from './app/useBackLayer.js'
import { useAppUpdates } from './features/updates/useAppUpdates.js'
import { AppUpdateNotice } from './features/updates/AppUpdateNotice.jsx'

function loadInitialSnapshot() {
  const source = createLocalCampusDataSource({
    locations: locationRepository.loadAll(),
    events: eventRepository.loadAll(),
  })

  return source.loadSnapshot()
}

function App() {
  const initialSnapshot = useMemo(loadInitialSnapshot, [])
  const initialState = useMemo(
    () => ({ ...createInitialState(initialSnapshot.locations, initialSnapshot.events, loadPersistedState()), role: 'visitor' }),
    [initialSnapshot],
  )
  const [storedState, dispatch] = useReducer(campusReducer, initialState)
  const auth = useCampusAuth()
  const updates = useAppUpdates()
  const [startupComplete, setStartupComplete] = useState(() => !document.getElementById('app-startup'))
  useEffect(() => {
    if (!document.getElementById('app-startup')) { setStartupComplete(true); return undefined }
    const observer = new MutationObserver(() => {
      if (!document.getElementById('app-startup')) { setStartupComplete(true); observer.disconnect() }
    })
    observer.observe(document.body, { childList: true })
    return () => observer.disconnect()
  }, [])
  const information = useCampusInformation(auth.user?.id)
  const notificationPreferences = useNotificationPreferences(auth.user?.id)
  const displayLocations = useMemo(() => storedState.locations.map(campusDisplayRecord), [storedState.locations])
  const displayEvents = useMemo(() => [...storedState.events, ...information.events].map(campusDisplayRecord), [storedState.events, information.events])
  const state = { ...storedState, locations: displayLocations, events: displayEvents }
  const handleToggleFavorite = (locationId) => {
    const enabled = !state.favoriteLocationIds.includes(locationId)
    dispatch({ type: 'TOGGLE_FAVORITE_LOCATION', locationId })
    if (notificationPreferences.status === 'ready') notificationPreferences.setFavorite(locationId, enabled).catch(() => {})
  }
  const [activeTab, setActiveTab] = useState('canvas')
  const [mapVisited, setMapVisited] = useState(false)
  useEffect(() => { if (activeTab === 'map') setMapVisited(true) }, [activeTab])
  const [serviceSection, setServiceSection] = useState('home')
  const [hallRegionId, setHallRegionId] = useState('all')
  const [hallSection, setHallSection] = useState('chat')
  const [hallFullscreen, setHallFullscreen] = useState(false)
  const [lostFoundPublishToken, setLostFoundPublishToken] = useState(0)
  const [hallLostFoundFilter, setHallLostFoundFilter] = useState('all')
  const [communityState, setCommunityState] = useState(loadCommunityState)
  const [memberTarget, setMemberTarget] = useState(null)
  const visibleMemberTarget = auth.user?.id && memberTarget?.viewerId === auth.user.id ? memberTarget : null
  const closeMemberProfile = useCallback(() => setMemberTarget(null), [])
  useEffect(() => { setMemberTarget(null) }, [auth.user?.id])
  const [informationOpen, setInformationOpen] = useState(false)
  const [informationSeed, setInformationSeed] = useState(null)
  const [informationTab, setInformationTab] = useState('messages')
  const [noticeId, setNoticeId] = useState(null)
  const openInformation = useCallback((seed = null, tab = 'messages') => { setMemberTarget(null); setInformationSeed(seed ? { userId: auth.user?.id ?? null, draft: seed } : null); setInformationTab(seed ? 'publish' : tab); setNoticeId(null); setInformationOpen(true) }, [auth.user?.id])
  const closeInformation = useCallback(() => { setInformationOpen(false); setNoticeId(null); setInformationSeed(null) }, [])
  const openChatFromNotice = useCallback((regionId) => {
    if (typeof regionId !== 'string' || !regionId) return
    closeInformation()
    setMemberTarget(null)
    setLostFoundPublishToken(0)
    setHallRegionId(regionId)
    setHallSection('chat')
    setHallFullscreen(true)
    setActiveTab('hall')
    dispatch({ type: 'CLEAR_SELECTED_LOCATION' })
  }, [closeInformation])
  const openNotice = useCallback((id) => { setMemberTarget(null); setInformationSeed(null); setInformationTab('messages'); setNoticeId(id); setInformationOpen(true) }, [])
  const push = useCampusPush(auth.user?.id, openNotice)
  const communityPosts = useMemo(() => {
    const cloud = information.reports.map((report) => cloudLostFoundPost(report, storedState.locations, communityState.posts)).filter(Boolean)
    return [...cloud, ...communityState.posts.filter((p) => !p.cloudReportId)]
  }, [information.reports, communityState.posts, storedState.locations, auth.user?.id])
  const [tencentRouteState, setTencentRouteState] = useState(null)
  const [feedbackLocationId, setFeedbackLocationId] = useState(null)
  const [feedbackInitialType, setFeedbackInitialType] = useState(PLACE_FEEDBACK_TYPES.CROWD)
  const openPlaceFeedback = (locationId, type = PLACE_FEEDBACK_TYPES.CROWD) => { setFeedbackInitialType(type); setFeedbackLocationId(locationId) }
  const [reviewLocationId, setReviewLocationId] = useState(null)
  const [reviewWindowId, setReviewWindowId] = useState(null)
  const [myPublicationsOpen, setMyPublicationsOpen] = useState(false)
  const [myPublicationsFilter, setMyPublicationsFilter] = useState('all')
  const [myPublicationsRefresh, setMyPublicationsRefresh] = useState(0)
  const closeMyPublications = useCallback(() => setMyPublicationsOpen(false), [])
  const closeRestaurantReviews = useCallback(() => { setReviewLocationId(null); setReviewWindowId(null); setMyPublicationsRefresh((value) => value + 1) }, [])
  const [auvOpen, setAuvOpen] = useState(false)
  const [auvSeed, setAuvSeed] = useState(null)
  const [timetableOpen, setTimetableOpen] = useState(false)
  const closeTimetable = useCallback(() => setTimetableOpen(false), [])
  const closeAuv = useCallback(() => setAuvOpen(false), [])
  const askAi = (prompt = '') => { setAuvSeed({ userId: auth.user?.id ?? null, prompt }); setAuvOpen(true) }
  const [devicePosition, setDevicePosition] = useState(null)
  const [deviceLocationStatus, setDeviceLocationStatus] = useState('idle')
  const [deviceLocationMessage, setDeviceLocationMessage] = useState('')
  const [devicePositionFocusToken, setDevicePositionFocusToken] = useState(0)
  const aiLocation = useRef({ ownerId: auth.user?.id ?? null, locationId: null })
  if (aiLocation.current.ownerId !== (auth.user?.id ?? null)) aiLocation.current = { ownerId: auth.user?.id ?? null, locationId: null }
  const handleCurrentLocationChange = (locationId) => {
    aiLocation.current = { ownerId: auth.user?.id ?? null, locationId }
    dispatch({ type: 'SET_CURRENT_LOCATION', locationId })
  }
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => markStartupReady('interface'))
    return () => window.cancelAnimationFrame(frame)
  }, [])
  useEffect(() => {
    if (auth.status !== 'loading') markStartupReady('account')
  }, [auth.status])
  useEffect(() => { if (!auvOpen) setAuvSeed(null) }, [auvOpen])
  const chat = useRealtimeHall({ userId: auth.user?.id ?? null, regionId: hallRegionId })
  const [loginMode, setLoginMode] = useState(null)
  const openLogin = useCallback(() => { setMemberTarget(null); setLoginMode('login') }, [])
  const openMemberProfile = useCallback((userId) => {
    if (!auth.user?.id) { openLogin(); return }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId ?? '')) return
    setMemberTarget({ viewerId: auth.user.id, userId })
  }, [auth.user?.id, openLogin])
  const closeLogin = useCallback(() => setLoginMode(null), [])
  const mapReturnRef = useRef(null)
  const rememberMapOrigin = () => {
    if (activeTab !== 'map') mapReturnRef.current = { activeTab, serviceSection, hallSection, hallFullscreen }
  }
  const restoreMapOrigin = () => {
    const origin = mapReturnRef.current
    mapReturnRef.current = null
    if (!origin) return
    setActiveTab(origin.activeTab); setServiceSection(origin.serviceSection)
    setHallSection(origin.hallSection); setHallFullscreen(origin.hallFullscreen)
  }
  const closeLocation = () => { dispatch({ type: 'CLEAR_SELECTED_LOCATION' }); if (!state.routePlan) restoreMapOrigin() }
  const closeRoute = () => { dispatch({ type: 'CLEAR_ROUTE' }); dispatch({ type: 'CLEAR_SELECTED_LOCATION' }); restoreMapOrigin() }
  useBackLayer(activeTab !== 'canvas', () => { setActiveTab('canvas'); dispatch({ type: 'CLEAR_SELECTED_LOCATION' }); mapReturnRef.current = null }, 0)
  useBackLayer(activeTab === 'explore' && serviceSection !== 'home', () => setServiceSection('home'), 10)
  useBackLayer(activeTab === 'hall' && hallFullscreen, () => { setHallFullscreen(false); setLostFoundPublishToken(0) }, 10)
  useBackLayer(activeTab === 'map' && Boolean(state.routePlan), closeRoute, 15, false)
  useBackLayer(activeTab === 'map' && Boolean(state.selectedId), closeLocation, 20)
  useEffect(() => { if (auth.user && noticeId) setInformationOpen(true) }, [auth.user?.id, noticeId])

  useEffect(() => {
    if (state.role !== auth.role) dispatch({ type: 'SET_ROLE', role: auth.role })
  }, [state.role, auth.role])
  useEffect(() => { if (auth.recoveryRequested) setLoginMode((current) => current ?? 'reset') }, [auth.recoveryRequested])

  useEffect(() => {
    savePersistedState(storedState)
  }, [storedState])

  useEffect(() => {
    const focusSearch = (event) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return
      if (document.getElementById('root')?.inert || document.querySelector('.workspace')?.inert) return
      event.preventDefault()
      if (activeTab === 'map') document.querySelector('.map-search-field input')?.focus()
      else {
        setServiceSection('places')
        setActiveTab('explore')
        window.requestAnimationFrame(() => document.querySelector('.service-page .search-field input')?.focus())
      }
    }

    window.addEventListener('keydown', focusSearch)
    return () => window.removeEventListener('keydown', focusSearch)
  }, [activeTab])

  const handleFullscreen = async () => {
    rememberMapOrigin()
    setMapVisited(true)
    setActiveTab('map')
    await new Promise((resolve) => window.requestAnimationFrame(resolve))
    const mapWorkspace = document.querySelector('.map-workspace')
    if (!mapWorkspace) return

    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await mapWorkspace.requestFullscreen?.()
    } catch {
      // 浏览器不支持全屏时不影响地图继续使用。
    }
  }

  const activeHotspots = useMemo(
    () => listActiveHotspots(state.events, state.eventTime),
    [state.events, state.eventTime],
  )
  const searchResults = useMemo(
    () => searchCampusResources(state.query, {
      locations: state.locations,
      events: activeHotspots,
      category: state.category,
    }),
    [state.query, state.locations, activeHotspots, state.category],
  )
  const searchLocationIds = useMemo(
    () => new Set(searchResults.map((result) => result.locationId)),
    [searchResults],
  )
  const filteredLocations = useMemo(
    () => state.query.trim()
      ? state.locations.filter((location) => searchLocationIds.has(location.id))
      : filterLocations(state.locations, '', state.category),
    [state.locations, state.query, state.category, searchLocationIds],
  )
  const selectedLocation = state.locations.find((location) => location.id === state.selectedId) ?? null
  const feedbackLocation = state.locations.find((location) => location.id === feedbackLocationId) ?? null
  const reviewLocation = state.locations.find((location) => location.id === reviewLocationId) ?? null
  const lastAdminAction = state.adminHistory.at(-1) ?? null
  const canUndoAdminAction = state.role === 'manager'
    && ['location-update', 'event-create', 'event-close', 'event-update'].includes(lastAdminAction?.type)

  const handleSearchResult = (result) => {
    dispatch({ type: 'SELECT_LOCATION', locationId: result.locationId })
    dispatch({ type: 'SET_QUERY', query: '' })
  }

  const handleExploreLocation = (locationId) => {
    rememberMapOrigin()
    dispatch({ type: 'SELECT_LOCATION', locationId })
    dispatch({ type: 'SET_QUERY', query: '' })
    dispatch({ type: 'SET_CATEGORY', category: 'all' })
    setActiveTab('map')
  }

  const handlePlanRoute = ({ originId, destinationId }) => {
    dispatch({ type: 'SET_ROUTE_DESTINATION', destinationId })
    dispatch({ type: 'SET_ROUTE_ORIGIN', originId })
    dispatch({ type: 'CLEAR_SELECTED_LOCATION' })
  }

  const handlePlanRouteFromDetail = () => {
    if (!selectedLocation) return
    handlePlanRouteToLocation(selectedLocation.id)
  }

  const handlePlanRouteToLocation = (destinationId) => {
    rememberMapOrigin()
    dispatch({
      type: 'PLAN_ROUTE',
      originId: state.currentLocationId ?? 'east-gate',
      destinationId,
    })
    dispatch({ type: 'SET_QUERY', query: '' })
    dispatch({ type: 'SET_CATEGORY', category: 'all' })
    setActiveTab('map')
  }

  const handleLocateDevice = async () => {
    aiLocation.current = { ownerId: auth.user?.id ?? null, locationId: null }
    setDeviceLocationMessage('')
    setDeviceLocationStatus('loading')

    try {
      const position = await getDeviceLocation()
      setDevicePosition({ ...wgs84ToGcj02(position), accuracy: position.accuracy, timestamp: position.timestamp })
      setDevicePositionFocusToken((token) => token + 1)
      setDeviceLocationStatus('located')
    } catch (error) {
      setDevicePosition(null)
      setDeviceLocationMessage(describeLocationError(error))
      setDeviceLocationStatus('error')
    }
  }


  const updateCommunity = (next) => {
    saveCommunityState(next)
    setCommunityState(next)
  }
  const handleSubmitLostFound = async (input, editingId) => {
    const previous = editingId ? communityState.posts.find((post) => post.id === editingId) : null
    if (editingId && !previous) throw new Error('这条发布已不存在')
    if (previous?.cloudReportId) throw new Error('云端信息请先撤回，再重新发布')
    if (!previous && communityState.posts.length >= MAX_LOCAL_POSTS) throw new Error('请先删除一些本机发布，再添加新信息')
    const post = createLostFoundPost(input, state.locations, previous)
    if (input.syncToCloud) {
      if (!auth.user) { openLogin(); throw new Error('请先登录，登录后可继续发布') }
      post.cloudReportId = await submitCampusReport({ clientId: input.clientId, kind: post.type, title: post.title,
        body: post.description, locationId: post.locationId,
        details: lostFoundReportDetails(post, input.imagePaths, auth.user.id) })
      post.cloudOwnerId = auth.user.id
    }
    let warning = ''
    try { updateCommunity({ ...communityState, posts: previous ? communityState.posts.map((item) => item.id === post.id ? post : item) : [post, ...communityState.posts] }) }
    catch (error) { if (!post.cloudReportId) throw error; warning = '云端发布成功，本机历史记录未能保存；云端照片不受影响。' }
    if (post.cloudReportId) await information.refresh()
    return { cloud: Boolean(post.cloudReportId), warning }
  }
  const handleDeleteLostFound = async (id) => {
    const post = communityPosts.find((p) => p.id === id)
    if (!post || ![LOCAL_AUTHOR_ID, auth.user?.id].includes(post.authorId)) throw new Error('只能撤回自己发布的信息')
    if (post.cloudReportId) { await setReportStatus(post.cloudReportId, 'withdrawn'); await information.refresh() }
    updateCommunity({ ...communityState, posts: communityState.posts.filter((p) => p.id !== id && (!post.cloudReportId || p.cloudReportId !== post.cloudReportId)) })
  }
  const handleLostFoundStatus = async (id, status) => {
    const post = communityPosts.find((p) => p.id === id)
    if (post?.cloudReportId) {
      if (status !== 'resolved') throw new Error('已完成的云端信息不能重新开启，请重新发布')
      await setReportStatus(post.cloudReportId, status)
      updateCommunity({ ...communityState, posts: communityState.posts.map((p) => p.cloudReportId === post.cloudReportId ? { ...p, status } : p) })
      await information.refresh()
    } else updateCommunity({ ...communityState, posts: updateLostFoundStatus(communityState.posts, id, status) })
  }
  const handleSubmitFacility = (input) => {
    const facility = createFacilityContribution(input, state.locations)
    updateCommunity({ ...communityState, facilities: [facility, ...communityState.facilities] })
  }
  const handleReviewFacility = (id, status) => {
    updateCommunity({ ...communityState, facilities: reviewFacilityContribution(communityState.facilities, id, status, state.role) })
  }
  const handleOpenHall = (section, mine = false) => {
    setLostFoundPublishToken(0)
    setHallSection(section); setHallRegionId('all'); setHallLostFoundFilter(mine ? 'mine' : 'all'); setActiveTab('hall')
    setHallFullscreen(Boolean(section))
    dispatch({ type: 'CLEAR_SELECTED_LOCATION' })
  }

  const handleSubmitPlaceFeedback = async (input) => {
    if (input.syncToCloud) {
      if (!auth.user) { openLogin(); throw new Error('请先登录，再提交云端反馈') }
      const kind = ['construction', 'closure', 'crowd'].includes(input.type) ? input.type : input.type === 'facility-repair' ? 'repair' : 'feedback'
      await submitCampusReport({ clientId: input.clientId, kind, title: input.title || `${state.locations.find((l) => l.id === input.locationId)?.name || '校园地点'}反馈`,
        body: input.description, locationId: input.locationId, details: { repair_category: input.repairCategory || '', reported_end_at: input.reportedEndAt || null,
          crowd_status: input.crowdStatus || '', open_status: input.openStatus || '', suggested_description: input.suggestedDescription || '' } })
      await information.refresh()
      return { cloud: true }
    }
    dispatch({ type: 'SUBMIT_PLACE_FEEDBACK', feedback: createPlaceFeedback(input) })
    return { cloud: false }
  }

  useEffect(() => {
    const now = Date.now()
    const nextBoundary = state.events
      .filter((event) => event.status === 'active')
      .flatMap((event) => [event.startAt, event.endAt])
      .filter(Boolean)
      .map((value) => new Date(value).getTime())
      .filter((timestamp) => Number.isFinite(timestamp) && timestamp > now)
      .sort((a, b) => a - b)[0]

    if (!nextBoundary) return undefined

    const delay = Math.min(Math.max(nextBoundary - now + 20, 20), 2_147_483_647)
    const timer = window.setTimeout(() => {
      dispatch({ type: 'REFRESH_EVENT_TIMELINE', now: Date.now() })
    }, delay)

    return () => window.clearTimeout(timer)
  }, [state.events, state.eventTime])

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><LayoutGrid size={19} strokeWidth={1.8} /></div>
          <div>
            <div className="brand-kicker">CAMPUSTWIN / DIGITAL CAMPUS</div>
            <h1>{teamCampusMap.campusName}</h1>
          </div>
        </div>
        <div className="topbar__status"><Radio size={14} /> 二维校园地图 · 触控浏览 <span className="live-dot" /></div>
        <div className="topbar__right">
          <span className="topbar__role">当前视角：{ROLE_LABELS[state.role]}</span>
          <div className="topbar__avatar"><Compass size={15} /></div>
        </div>
      </header>

      <main inert={Boolean(loginMode || informationOpen || reviewLocation || auvOpen || timetableOpen || myPublicationsOpen || visibleMemberTarget)} className={`workspace workspace--tab-${activeTab}${state.routePlan ? ' workspace--has-route' : ''}${activeTab === 'map' && selectedLocation ? ' workspace--has-detail' : ''}`}>
        <AppUpdateNotice updates={updates} covered={!startupComplete || Boolean(loginMode || informationOpen || reviewLocation || auvOpen || timetableOpen || myPublicationsOpen || visibleMemberTarget)} />
        {activeTab === 'canvas' && <CanvasHome key={auth.user?.id ?? 'guest'} auth={auth} locations={state.locations} events={state.events} favoriteIds={state.favoriteLocationIds} unread={information.unread} onOpenMessages={() => openInformation()} onOpenMap={() => { rememberMapOrigin(); setActiveTab('map') }} onSearch={() => { setServiceSection('places'); setActiveTab('explore') }} onOpenServices={() => { setServiceSection('home'); setActiveTab('explore') }} onOpenCommunity={() => { setHallFullscreen(false); setActiveTab('hall') }} onOpenMe={() => setActiveTab('me')} onSelectLocation={handleExploreLocation} />}
        {activeTab === 'map' && <div className="canvas-map-return"><button type="button" onClick={() => { dispatch({ type: 'CLEAR_SELECTED_LOCATION' }); dispatch({ type: 'CLEAR_ROUTE' }); mapReturnRef.current = null; setActiveTab('canvas') }}>返回画布</button><span>校园地图</span></div>}
        <div style={{ display: 'contents' }} inert={activeTab !== 'map'} aria-hidden={activeTab !== 'map' ? true : undefined}>
        {mapVisited && <MapWorkspace
          locations={state.locations}
          visibleLocations={filteredLocations}
          events={activeHotspots}
          searchResults={searchResults}
          selectedId={state.selectedId}
          query={state.query}
          category={state.category}
          toolbarOpen={state.toolbarOpen}
          activeTool={state.activeTool}
          role={state.role}
          settings={state.settings}
          resetViewToken={state.resetViewToken}
          currentLocationId={state.currentLocationId}
          livePosition={devicePosition}
          livePositionFocusToken={devicePositionFocusToken}
          deviceLocationStatus={deviceLocationStatus}
          deviceLocationMessage={deviceLocationMessage}
          routePlan={state.routePlan}
          onPublishEvent={(event) => dispatch({ type: 'PUBLISH_EVENT', event })}
          onUpdateEvent={(eventId, changes) => dispatch({ type: 'UPDATE_EVENT', eventId, changes })}
          onCloseEvent={(eventId) => dispatch({ type: 'CLOSE_EVENT', eventId })}
          canUndoAdminAction={canUndoAdminAction}
          lastAdminAction={lastAdminAction}
          onUndoAdminAction={() => dispatch({ type: 'UNDO_ADMIN_ACTION' })}
          onToggleToolbar={(open) => dispatch({ type: 'TOGGLE_TOOLBAR', open })}
          onToolChange={(tool) => dispatch({ type: 'SET_ACTIVE_TOOL', tool })}
          onRoleChange={undefined}
          onCurrentLocationChange={handleCurrentLocationChange}
          onSettingsChange={(changes) => dispatch({ type: 'SET_SETTINGS', changes })}
          onResetSettings={() => dispatch({ type: 'RESET_SETTINGS' })}
          onResetView={() => dispatch({ type: 'RESET_VIEW' })}
          onFullscreen={handleFullscreen}
          onClearRoute={closeRoute}
          onClearCurrentLocation={() => handleCurrentLocationChange(null)}
          onLocateDevice={handleLocateDevice}
          onResetDemoData={() => dispatch({ type: 'RESET_DEMO_DATA', locations: initialSnapshot.locations, events: initialSnapshot.events })}
          onSelectLocation={(locationId) => dispatch({ type: 'SELECT_LOCATION', locationId })}
          onPlanRouteToLocation={handlePlanRouteToLocation}
          onOpenFeedback={openPlaceFeedback}
          lostFoundPosts={communityPosts}
          onOpenHall={handleOpenHall}
          onRouteStateChange={setTencentRouteState}
          onQueryChange={(query) => dispatch({ type: 'SET_QUERY', query })}
          onSelectSearchResult={handleSearchResult}
          onCategoryChange={(category) => dispatch({ type: 'SET_CATEGORY', category })}
        />}
        </div>

        {activeTab === 'explore' && (
          <ExplorePanel
            headerActions={<PrimaryPageActions unread={information.unread} onOpenMessages={() => openInformation()} />}
            section={serviceSection}
            onSectionChange={setServiceSection}
            onOpenTimetable={() => setTimetableOpen(true)}
            onOpenAssistant={() => askAi()}
            onOpenRepair={(locationId) => openPlaceFeedback(locationId, PLACE_FEEDBACK_TYPES.REPAIR)}
            onOpenRepairRecords={() => { setMyPublicationsFilter('feedback'); setMyPublicationsOpen(true) }}
            placeFeedback={state.placeFeedback}
            onUpdateFacilityReport={(feedbackId, status) => dispatch({ type: 'SET_FACILITY_REPORT_STATUS', feedbackId, status })}
            locations={filteredLocations}
            allLocations={state.locations}
            calendarEvents={state.events}
            services={campusServices}
            facilityContributions={communityState.facilities}
            livePosition={devicePosition}
            deviceLocationStatus={deviceLocationStatus}
            deviceLocationMessage={deviceLocationMessage}
            onLocateDevice={handleLocateDevice}
            role={state.role}
            onSubmitFacility={handleSubmitFacility}
            onReviewFacility={handleReviewFacility}
            selectedId={state.selectedId}
            query={state.query}
            category={state.category}
            onQueryChange={(query) => dispatch({ type: 'SET_QUERY', query })}
            onCategoryChange={(category) => dispatch({ type: 'SET_CATEGORY', category })}
            onSelectLocation={handleExploreLocation}
            onPlanRouteToLocation={handlePlanRouteToLocation}
            onReset={() => {
              dispatch({ type: 'SET_QUERY', query: '' })
              dispatch({ type: 'SET_CATEGORY', category: 'all' })
            }}
          />
        )}
        {activeTab === 'hall' && (
          <HallPanel
            onOpenMemberProfile={openMemberProfile}
            headerActions={<PrimaryPageActions unread={information.unread} onOpenMessages={() => openInformation()} />}
            messages={chat.messages}
            selectedRegionId={hallRegionId}
            onRegionChange={setHallRegionId}
            onSendMessage={chat.sendMessage}
            chat={chat}
            auth={auth}
            onOpenLogin={openLogin}
            information={information}
            onPublishInformation={() => openInformation({ kind: 'notice' })}
            onSubmitAsInformation={(message) => openInformation({ kind: 'notice', title: message.content.slice(0, 60), body: message.content, sourceMessageId: message.id, details: { image_paths: message.imagePaths ?? [] } })}
            activeSection={hallSection}
            isFullscreen={hallFullscreen}
            onCloseSection={() => { setHallFullscreen(false); setLostFoundPublishToken(0) }}
            onSectionChange={(section) => { setLostFoundPublishToken(0); setHallRegionId('all'); setHallLostFoundFilter('all'); setHallSection(section); setHallFullscreen(true) }}
            onStartLostFound={() => { setHallRegionId('all'); setHallLostFoundFilter('all'); setHallSection('lost-found'); setHallFullscreen(true); setLostFoundPublishToken((value) => value + 1) }}
            lostFoundPublishToken={lostFoundPublishToken}
            onAskAi={askAi}
            locations={state.locations}
            hotspots={activeHotspots}
            posts={communityPosts}
            lostFoundFilter={hallLostFoundFilter}
            onLostFoundFilterChange={setHallLostFoundFilter}
            onSubmitPost={handleSubmitLostFound}
            onPostStatusChange={handleLostFoundStatus}
            onDeletePost={handleDeleteLostFound}
            onSelectLocation={handleExploreLocation}
            onPlanRouteToLocation={handlePlanRouteToLocation}
            onOpenRestaurantReviews={setReviewLocationId}
            showLostFound={state.settings.showLostFound}
            onLostFoundMapChange={(showLostFound) => dispatch({ type: 'SET_SETTINGS', changes: { showLostFound } })}
          />
        )}
        {activeTab === 'routes' && (
          <TripPanel
            locations={state.locations}
            currentLocationId={state.currentLocationId}
            routePlan={state.routePlan}
            showRoute={state.settings.showRoute}
            onPlanRoute={handlePlanRoute}
            onOpenMap={() => setActiveTab('map')}
            onModeChange={(mode) => dispatch({ type: 'SET_ROUTE_MODE', mode })}
            onOriginChange={(originId) => dispatch({ type: 'SET_ROUTE_ORIGIN', originId })}
            onDestinationChange={(destinationId) => dispatch({ type: 'SET_ROUTE_DESTINATION', destinationId })}
            onSwap={() => dispatch({ type: 'SWAP_ROUTE_ENDPOINTS' })}
            onClear={closeRoute}
          />
        )}
        {activeTab === 'me' && (
          <MePanel
            updates={updates}
            onOpenMemberProfile={openMemberProfile}
            key={auth.user?.id ?? 'guest'}
            onOpenMyPublications={() => { setMyPublicationsFilter('all'); setMyPublicationsOpen(true) }}
            onOpenTimetable={() => setTimetableOpen(true)}
            onOpenMessages={() => openInformation()}
            unreadCount={information.unread}
            onOpenRepair={() => { setServiceSection('repair'); setActiveTab('explore') }}
            onOpenSubscriptions={() => openInformation(null, 'subscriptions')}
            onOpenReview={() => openInformation(null, 'review')}
            onOpenRestaurantManagement={() => handleOpenHall('restaurants')}
            onOpenLocationManagement={() => { setServiceSection('places'); setActiveTab('explore') }}
            onBeforeLogout={disablePushDevice}
            role={state.role}
            settings={state.settings}
            locations={state.locations}
            events={state.events}
            placeFeedback={state.placeFeedback}
            currentLocationId={state.currentLocationId}
            canUndoAdminAction={canUndoAdminAction}
            lastAdminAction={lastAdminAction}
            onRoleChange={undefined}
            auth={auth}
            onOpenLogin={openLogin}
            onCurrentLocationChange={handleCurrentLocationChange}
            onSettingsChange={(changes) => dispatch({ type: 'SET_SETTINGS', changes })}
            onResetSettings={() => dispatch({ type: 'RESET_SETTINGS' })}
            onResetView={() => dispatch({ type: 'RESET_VIEW' })}
            onFullscreen={handleFullscreen}
            onClearRoute={closeRoute}
            onResetDemoData={() => dispatch({ type: 'RESET_DEMO_DATA', locations: initialSnapshot.locations, events: initialSnapshot.events })}
            onUndoAdminAction={() => dispatch({ type: 'UNDO_ADMIN_ACTION' })}
            onPublishEvent={(event) => dispatch({ type: 'PUBLISH_EVENT', event })}
            onUpdateEvent={(eventId, changes) => dispatch({ type: 'UPDATE_EVENT', eventId, changes })}
            onCloseEvent={(eventId) => dispatch({ type: 'CLOSE_EVENT', eventId })}
            onReviewPlaceFeedback={(decision) => dispatch({ type: 'REVIEW_PLACE_FEEDBACK', ...decision })}
            onUpdateFacilityReport={(feedbackId, status) => dispatch({ type: 'SET_FACILITY_REPORT_STATUS', feedbackId, status })}
            favoriteLocationIds={state.favoriteLocationIds}
            savedRoutes={state.savedRoutes}
            lostFoundCount={communityPosts.filter((p) => p.authorId === LOCAL_AUTHOR_ID || p.authorId === auth.user?.id).length}
            onOpenMyLostFound={() => handleOpenHall('lost-found', true)}
            onSelectLocation={handleExploreLocation}
            onToggleFavorite={handleToggleFavorite}
            onPlanSavedRoute={(route) => {
              rememberMapOrigin()
              dispatch({ type: 'PLAN_SAVED_ROUTE', routeId: route.id })
              setActiveTab('map')
            }}
            onRemoveSavedRoute={(routeId) => dispatch({ type: 'REMOVE_SAVED_ROUTE', routeId })}
          />
        )}

        {activeTab === 'map' && selectedLocation && (
          <LocationDetail
            location={selectedLocation}
            events={activeHotspots.filter((event) => event.locationId === selectedLocation.id)}
            lostFoundPosts={communityPosts.filter((post) => post.locationId === selectedLocation.id && post.status === 'active')}
            onOpenLostFound={() => handleOpenHall('lost-found')}
            onOpenReviews={() => setReviewLocationId(selectedLocation.id)}
            role={state.role}
            isFavorite={state.favoriteLocationIds.includes(selectedLocation.id)}
            onToggleFavorite={() => handleToggleFavorite(selectedLocation.id)}
            onClose={closeLocation}
            onPlanRoute={handlePlanRouteFromDetail}
            onUpdate={(changes) => dispatch({ type: 'UPDATE_LOCATION_STATUS', locationId: selectedLocation.id, changes })}
            onSubmitFeedback={handleSubmitPlaceFeedback}
            onAskAi={askAi}
          />
        )}
        {feedbackLocation && (
          <PlaceFeedbackSheet
            key={`${feedbackLocation.id}:${feedbackInitialType}`}
            location={feedbackLocation}
            initialType={feedbackInitialType}
            onClose={() => setFeedbackLocationId(null)}
            onSubmitFeedback={handleSubmitPlaceFeedback}
          />
        )}
        {activeTab === 'map' && state.routePlan && (
          <RouteDock
            routePlan={state.routePlan}
            locations={state.locations}
            routeResult={tencentRouteState}
            showRoute={state.settings.showRoute}
            onModeChange={(mode) => dispatch({ type: 'SET_ROUTE_MODE', mode })}
            onOriginChange={(originId) => dispatch({ type: 'SET_ROUTE_ORIGIN', originId })}
            onDestinationChange={(destinationId) => dispatch({ type: 'SET_ROUTE_DESTINATION', destinationId })}
            onSwap={() => dispatch({ type: 'SWAP_ROUTE_ENDPOINTS' })}
            onClear={closeRoute}
            isSaved={state.savedRoutes.some((route) => route.originId === state.routePlan.originId && route.destinationId === state.routePlan.destinationId && route.mode === state.routePlan.mode)}
            onSave={() => dispatch({ type: 'SAVE_ROUTE', routePlan: state.routePlan })}
          />
        )}
        {!(activeTab === 'hall' && hallFullscreen) && <>
          {activeTab === 'map' && <PrimaryPageActions showAssistant unread={information.unread} onOpenAssistant={() => askAi()} onOpenMessages={() => openInformation()} />}
          <MobileTabBar activeTab={activeTab === 'map' ? 'canvas' : activeTab} onChange={(tab) => { mapReturnRef.current = null; setHallFullscreen(false); setLostFoundPublishToken(0); if (tab === 'explore') setServiceSection('home'); setActiveTab(tab) }} />
        </>}
      </main>
      {loginMode && <LoginSheet key={loginMode} auth={auth} initialMode={loginMode} onClose={closeLogin} />}
      {myPublicationsOpen && <MyPublicationsPage key={`${auth.user?.id ?? 'guest'}:${myPublicationsFilter}`} initialFilter={myPublicationsFilter} userId={auth.user?.id} reports={information.reports} posts={communityPosts} feedbacks={state.placeFeedback} locations={state.locations} refreshToken={myPublicationsRefresh} covered={informationOpen || Boolean(reviewLocation)} onClose={closeMyPublications} onRefresh={information.refresh} onOpenCloudReports={() => openInformation(null, 'reports')} onOpenMyLostFound={() => { closeMyPublications(); handleOpenHall('lost-found', true) }} onOpenReview={(restaurantId, windowId) => { setReviewWindowId(windowId); setReviewLocationId(restaurantId) }} onOpenFeedback={() => { closeMyPublications(); setServiceSection('repair'); setActiveTab('explore') }} onSelectLocation={(id) => { closeMyPublications(); handleExploreLocation(id) }} />}
      {visibleMemberTarget && !loginMode && <MemberProfilePage key={`${visibleMemberTarget.viewerId}:${visibleMemberTarget.userId}`} userId={visibleMemberTarget.userId} viewerId={visibleMemberTarget.viewerId} onClose={closeMemberProfile} />}
      <CampusNoticeBanner userId={auth.user?.id} information={information} covered={informationOpen || Boolean(loginMode) || auvOpen || Boolean(visibleMemberTarget)} onOpen={openNotice} />
      {informationOpen && <NotificationCenter onOpenChat={openChatFromNotice} key={`${auth.user?.id ?? 'guest'}:${informationTab}`} auth={auth} information={information} push={push} preferences={notificationPreferences} favoriteIds={state.favoriteLocationIds} locations={state.locations} initialTab={informationTab} initialDraft={informationDraftForUser(informationSeed, auth.user?.id)} noticeId={noticeId} onClose={closeInformation} onOpenLogin={() => { setInformationOpen(false); openLogin() }} onSelectLocation={(id) => { closeInformation(); closeMyPublications(); handleExploreLocation(id) }} onPlanRouteToLocation={(id) => { closeInformation(); closeMyPublications(); handlePlanRouteToLocation(id) }} />}
      {reviewLocation && <RestaurantReviewsPage onOpenMemberProfile={openMemberProfile} key={`${reviewLocation.id}:${auth.user?.id ?? 'guest'}:${reviewWindowId ?? ''}`} restaurant={reviewLocation} initialWindowId={reviewWindowId} authorName={auth.profile?.nickname ?? '我'} role={auth.role} userId={auth.user?.id} onOpenLogin={openLogin} onClose={closeRestaurantReviews} />}
      {timetableOpen && <TimetablePage key={auth.user?.id ?? 'guest'} userId={auth.user?.id} onClose={closeTimetable} onAskAi={(prompt) => { setTimetableOpen(false); setAuvSeed({ userId: auth.user?.id ?? null, prompt, source: 'timetable' }); setAuvOpen(true) }} />}
      {auvOpen && <AuvAssistantPage initialPurpose={auvSeed?.userId === (auth.user?.id ?? null) ? auvSeed?.source ?? '' : ''} initialDraft={auvSeed?.userId === (auth.user?.id ?? null) ? auvSeed?.prompt ?? '' : ''} auth={auth} locations={state.locations} initialLocationId={state.selectedId ?? ''} getContext={() => buildAuvContext({
        locations: state.locations,
        manualLocationId: aiLocation.current.ownerId === (auth.user?.id ?? null) && aiLocation.current.locationId === state.currentLocationId ? state.currentLocationId : null,
        routePlan: state.routePlan,
        favoriteIds: notificationPreferences.status === 'ready' ? notificationPreferences.value.favorite_location_ids : undefined,
        timetable: auth.user?.id ? loadTimetable(auth.user.id) : null,
      })} onClose={closeAuv} onOpenLogin={() => { setAuvOpen(false); openLogin() }} onSelectLocation={(id) => { setAuvOpen(false); handleExploreLocation(id) }} onPlanRouteToLocation={(id) => { setAuvOpen(false); handlePlanRouteToLocation(id) }} />}
    </div>
  )
}

export default App
