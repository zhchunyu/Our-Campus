import { useEffect, useRef, useState } from 'react'
import { LocateFixed, Minus, Navigation, Plus, RotateCcw } from 'lucide-react'
import {
  getTencentCampusPosition,
  TENCENT_CAMPUS_CENTER,
  TENCENT_CAMPUS_MIN_ZOOM,
  TENCENT_CAMPUS_MAX_ZOOM,
  TENCENT_CAMPUS_ZOOM,
  TENCENT_CAMPUS_LABEL_BOUNDS,
} from '../../data/tencentCampusGeo.js'
import { loadTencentMapSdk, requestTencentWalkingRoute } from '../../data/tencentMapApi.js'
import { markStartupReady } from '../../app/startup.js'
import { COMPETITION_PRESENTATION, campusDisplayText } from '../../data/campusPresentation.js'

const apiKey = import.meta.env.VITE_TENCENT_MAP_KEY
const liveLocationMarkerImage = '/assets/current-location.svg'

function normalizePoiName(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/山西农业大学|山西农大|太谷校区|校园/g, '')
    .replace(/家属区/g, '家属院')
    .replace(/[\s·()（）_-]/g, '')
    .toLowerCase()
}

function findCampusLocationId(poiName, locations) {
  const poiNameText = String(poiName ?? '').trim()
  if (!poiNameText) return null

  const apartmentNumber = poiNameText.match(/(\d{1,2})(?:号)?(?:公寓)?(?:楼|栋)/)?.[1]
  if (apartmentNumber) {
    const apartment = locations.find((location) => location.mapApartmentNumber === Number(apartmentNumber))
    if (apartment) return apartment.id
  }

  const normalizedPoiName = normalizePoiName(poiNameText)
  const candidates = locations.flatMap((location) => [
    { id: location.id, name: location.name },
    ...(location.aliases ?? []).map((name) => ({ id: location.id, name })),
  ])
  const exactMatch = candidates.find(({ name }) => normalizePoiName(name) === normalizedPoiName)
  if (exactMatch) return exactMatch.id

  const partialMatch = candidates.find(({ name }) => {
    const candidateName = normalizePoiName(name)
    return candidateName.length >= 2 && normalizedPoiName.includes(candidateName)
  })
  return partialMatch?.id ?? null
}

function isInsideCampusBounds(poiPosition, locations) {
  const lat = Number(typeof poiPosition?.getLat === 'function' ? poiPosition.getLat() : poiPosition?.lat)
  const lng = Number(typeof poiPosition?.getLng === 'function' ? poiPosition.getLng() : poiPosition?.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false

  const positions = locations
    .map(getTencentCampusPosition)
    .filter(Boolean)
  if (positions.length === 0) return false

  const minLat = Math.min(...positions.map((position) => position.lat)) - 0.0003
  const maxLat = Math.max(...positions.map((position) => position.lat)) + 0.0003
  const minLng = Math.min(...positions.map((position) => position.lng)) - 0.0003
  const maxLng = Math.max(...positions.map((position) => position.lng)) + 0.0003
  return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng
}

function routeErrorMessage(error) {
  if (error?.code === 110 || error?.code === 112) return '腾讯路线接口未授权当前来源'
  if (error?.code === 121) return '腾讯路线接口今日免费额度已用完'
  if (error?.code === 347) return '腾讯地图暂时没有找到这条步行路线'
  if (error?.message === 'walking-route-timeout') return '腾讯步行路线请求超时'
  return '腾讯步行路线暂不可用'
}

export function TencentCampusMap({
  locations = [],
  events = [],
  lostFoundPosts = [],
  selectedId = null,
  currentLocationId = null,
  livePosition = null,
  livePositionFocusToken = 0,
  routePlan = null,
  showLabels = true,
  resetViewToken = 0,
  onSelectLocation,
  onRouteStateChange,
  onUseCampusMap,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const locationsRef = useRef(locations)
  const layersRef = useRef({ route: null, liveLocation: null, community: null, campusLabels: null })
  const selectCallbackRef = useRef(onSelectLocation)
  const routeStateCallbackRef = useRef(onRouteStateChange)
  const lastResetTokenRef = useRef(resetViewToken)
  const lastLivePositionFocusTokenRef = useRef(0)
  const [loadState, setLoadState] = useState('loading')
  const [mapVersion, setMapVersion] = useState(0)
  const [loadError, setLoadError] = useState('')
  const [zoomLevel, setZoomLevel] = useState(TENCENT_CAMPUS_ZOOM)
  const [routeState, setRouteState] = useState({ status: 'idle', route: null, message: '' })

  routeStateCallbackRef.current = onRouteStateChange
  locationsRef.current = locations
  selectCallbackRef.current = onSelectLocation

  useEffect(() => {
    let disposed = false
    let map = null

    loadTencentMapSdk(apiKey)
      .then((TMap) => {
        if (disposed || !containerRef.current) return
        map = new TMap.Map(containerRef.current, {
          center: new TMap.LatLng(TENCENT_CAMPUS_CENTER.lat, TENCENT_CAMPUS_CENTER.lng),
          zoom: TENCENT_CAMPUS_ZOOM,
          minZoom: TENCENT_CAMPUS_MIN_ZOOM,
          maxZoom: TENCENT_CAMPUS_MAX_ZOOM,
          // 校园标注包围矩形约占可移动范围的 20%，南侧另留底部菜单避让空间。
          boundary: new TMap.LatLngBounds(
            new TMap.LatLng(TENCENT_CAMPUS_LABEL_BOUNDS.south, TENCENT_CAMPUS_LABEL_BOUNDS.west),
            new TMap.LatLng(TENCENT_CAMPUS_LABEL_BOUNDS.north, TENCENT_CAMPUS_LABEL_BOUNDS.east),
          ),
          pitch: 0,
          rotation: 0,
          viewMode: '3D',
          // 保留道路、绿地和二维建筑，底图文字统一由匿名校园标签代替。
          ...(COMPETITION_PRESENTATION ? { baseMap: { type: 'vector', features: ['base', 'building2d', 'arrow'], buildingRange: [14.5, 20] } } : {}),
          draggable: true,
          scrollable: true,
          touchZoomable: true,
          rotatable: true,
          pitchable: false,
          doubleClickZoom: true,
          showControl: false,
        })
        mapRef.current = map
        // Fast Refresh may replace a ready map with another ready map. Notify
        // all overlays and resize effects even when loadState stays unchanged.
        setMapVersion((value) => value + 1)
        setZoomLevel(map.getZoom())
        map.on('zoom', () => setZoomLevel(Number(Number(map.getZoom()).toFixed(1))))
        map.on('click', (event) => {
          const poiName = event?.poi?.name?.trim()
          const poiPosition = event?.poi?.latLng
          if (!poiName || !poiPosition || !isInsideCampusBounds(poiPosition, locationsRef.current)) {
            return
          }

          const locationId = findCampusLocationId(poiName, locationsRef.current)
          if (locationId) selectCallbackRef.current?.(locationId)
        })
        setLoadState('ready')
        markStartupReady('map')
      })
      .catch((error) => {
        if (disposed) return
        setLoadError(error?.message === 'missing-key'
          ? '尚未配置腾讯地图 Key。'
          : '腾讯地图 SDK 加载失败，请检查网络和 Key。')
        setLoadState('error')
        markStartupReady('map')
      })

    return () => {
      disposed = true
      Object.values(layersRef.current).forEach((layer) => layer?.setMap?.(null))
      layersRef.current.campusLabels?.destroy?.()
      layersRef.current = { route: null, liveLocation: null, community: null, campusLabels: null }
      map?.destroy?.()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const TMap = window.TMap
    const map = mapRef.current
    if (!COMPETITION_PRESENTATION || loadState !== 'ready' || !TMap || !map) return
    const geometries = locations.flatMap((location) => {
      const coordinates = getTencentCampusPosition(location)
      return coordinates ? [{
        id: location.id, styleId: 'campus', content: campusDisplayText(location.name),
        position: new TMap.LatLng(coordinates.lat, coordinates.lng),
        rank: location.id === selectedId ? 100 : location.category === 'living' ? 1 : 10,
      }] : []
    })
    if (!layersRef.current.campusLabels) {
      const labels = new TMap.MultiLabel({
        id: 'campus-anonymous-labels', map, isStopPropagation: true,
        collisionOptions: { sameSource: true },
        styles: { campus: new TMap.LabelStyle({
          color: '#34584e', strokeColor: '#fff', strokeWidth: 3, size: 13,
          alignment: 'center', verticalAlignment: 'middle',
        }) },
        geometries,
      })
      labels.on('click', (event) => {
        const location = locationsRef.current.find((item) => item.id === event.geometry?.id)
        if (location) selectCallbackRef.current?.(location.id)
      })
      layersRef.current.campusLabels = labels
    } else {
      layersRef.current.campusLabels.setGeometries(geometries)
    }
    layersRef.current.campusLabels.setVisible(showLabels)
  }, [loadState, mapVersion, locations, selectedId, showLabels])

  useEffect(() => {
    const TMap = window.TMap
    const map = mapRef.current
    if (loadState !== 'ready' || !TMap || !map) return
    const byId = new Map(locations.map((location) => [location.id, location]))
    const hotspotIds = new Set(events.map((event) => event.locationId))
    const lostIds = new Set(lostFoundPosts.filter((post) => post.status === 'active').map((post) => post.locationId))
    const geometries = []
    for (const [type, ids] of [['hotspot', hotspotIds], ['lost', lostIds]]) {
      for (const locationId of ids) {
        const coordinates = getTencentCampusPosition(byId.get(locationId))
        if (!coordinates) continue
        geometries.push({ id: `${type}-${locationId}`, styleId: type === 'lost' && hotspotIds.has(locationId) ? 'lost-offset' : type,
          position: new TMap.LatLng(coordinates.lat, coordinates.lng), properties: { locationId } })
      }
    }
    if (!layersRef.current.community) {
      const layer = new TMap.MultiMarker({
        id: 'campus-community', map, minZoom: 15, isStopPropagation: true, zIndex: 8,
        styles: {
          hotspot: new TMap.MarkerStyle({ width: 32, height: 38, anchor: { x: 16, y: 38 }, src: '/assets/community-hotspot.svg' }),
          lost: new TMap.MarkerStyle({ width: 32, height: 38, anchor: { x: 16, y: 38 }, src: '/assets/community-lost.svg' }),
          'lost-offset': new TMap.MarkerStyle({ width: 32, height: 38, anchor: { x: -18, y: 38 }, src: '/assets/community-lost.svg' }),
        },
        geometries,
      })
      layer.on('click', (event) => {
        const locationId = event.geometry?.properties?.locationId
        if (locationId) selectCallbackRef.current?.(locationId)
      })
      layersRef.current.community = layer
    } else layersRef.current.community.setGeometries(geometries)
  }, [loadState, mapVersion, locations, events, lostFoundPosts])

  useEffect(() => {
    const TMap = window.TMap
    const map = mapRef.current
    if (loadState !== 'ready' || !TMap || !map) return

    const route = routeState.status === 'success' ? routeState.route : null
    const routeGeometries = route?.points?.length
      ? [{
          id: 'tencent-walking-route',
          styleId: 'walking',
          paths: route.points.map((point) => new TMap.LatLng(point.lat, point.lng)),
        }]
      : []
    if (!layersRef.current.route) {
      const routeLayer = new TMap.MultiPolyline({
        id: 'tencent-walking-route',
        map,
        styles: {
          walking: new TMap.PolylineStyle({
            color: '#20b88a', width: 7, borderColor: '#ffffff', borderWidth: 3,
          }),
        },
        geometries: routeGeometries,
      })
      layersRef.current.route = routeLayer
    } else {
      layersRef.current.route.setGeometries(routeGeometries)
    }
  }, [loadState, mapVersion, routeState])

  useEffect(() => {
    const TMap = window.TMap
    const map = mapRef.current
    if (loadState !== 'ready' || !TMap || !map || !livePosition) return

    const position = new TMap.LatLng(livePosition.lat, livePosition.lng)
    const geometry = [{ id: 'device-location', styleId: 'device-location', position }]
    if (!layersRef.current.liveLocation) {
      layersRef.current.liveLocation = new TMap.MultiMarker({
        id: 'campus-device-location',
        map,
        styles: {
          'device-location': new TMap.MarkerStyle({
            width: 32,
            height: 32,
            anchor: { x: 16, y: 16 },
            src: liveLocationMarkerImage,
          }),
        },
        geometries: geometry,
      })
    } else {
      layersRef.current.liveLocation.setGeometries(geometry)
    }

    if (livePositionFocusToken > 0 && lastLivePositionFocusTokenRef.current !== livePositionFocusToken) {
      lastLivePositionFocusTokenRef.current = livePositionFocusToken
      map.panTo(position, { duration: 360 })
      map.zoomTo(Math.max(Number(map.getZoom()) || TENCENT_CAMPUS_ZOOM, 17), { duration: 300 })
    }
  }, [loadState, mapVersion, livePosition, livePositionFocusToken])

  useEffect(() => {
    const map = mapRef.current
    if (loadState !== 'ready' || !map) return
    // The detail sheet gives the map its own visible upper half. Resize before
    // centering, so the selected label stays above the sheet.
    const container = containerRef.current
    map.resize(container.clientWidth, container.clientHeight)
    const focusedLocation = locations.find((location) => location.id === selectedId)
      ?? locations.find((location) => location.id === currentLocationId)
    const position = getTencentCampusPosition(focusedLocation)
    if (position) map.panTo(new window.TMap.LatLng(position.lat, position.lng), { duration: 320 })
  }, [loadState, mapVersion, locations, selectedId, currentLocationId])

  useEffect(() => {
    const map = mapRef.current
    const container = containerRef.current
    if (loadState !== 'ready' || !map || !container) return undefined
    const observer = new ResizeObserver(() => map.resize(container.clientWidth, container.clientHeight))
    observer.observe(container)
    return () => observer.disconnect()
  }, [loadState, mapVersion])

  useEffect(() => {
    const map = mapRef.current
    if (loadState !== 'ready' || !map || lastResetTokenRef.current === resetViewToken) return
    lastResetTokenRef.current = resetViewToken
    map.panTo(new window.TMap.LatLng(TENCENT_CAMPUS_CENTER.lat, TENCENT_CAMPUS_CENTER.lng), { duration: 260 })
    map.zoomTo(TENCENT_CAMPUS_ZOOM, { duration: 260 })
    map.rotateTo(0, { duration: 260 })
  }, [loadState, mapVersion, resetViewToken])

  useEffect(() => {
    if (!routePlan || routePlan.status !== 'preview') {
      setRouteState({ status: 'idle', route: null, message: '' })
      return undefined
    }
    const hasBlockedEdges = (routePlan.blockedEdgeIds?.length ?? 0) > 0
    if (routePlan.mode !== 'shortest' || hasBlockedEdges) {
      const nextState = {
        status: 'local',
        route: null,
        message: hasBlockedEdges
          ? `校园路网已避开 ${routePlan.blockedEdgeIds.length} 段封闭道路；分段指引见路线面板`
          : '该路线模式按校园路网预览；分段指引见路线面板',
      }
      setRouteState(nextState)
      routeStateCallbackRef.current?.({ ...nextState, originId: routePlan.originId, destinationId: routePlan.destinationId })
      return undefined
    }

    const origin = locations.find((location) => location.id === routePlan.originId)
    const destination = locations.find((location) => location.id === routePlan.destinationId)
    const from = getTencentCampusPosition(origin)
    const to = getTencentCampusPosition(destination)
    if (!from || !to) {
      const nextState = { status: 'error', route: null, message: '起终点暂无可用腾讯坐标' }
      setRouteState(nextState)
      routeStateCallbackRef.current?.({ ...nextState, originId: routePlan.originId, destinationId: routePlan.destinationId })
      return undefined
    }

    let active = true
    const loadingState = { status: 'loading', route: null, message: '' }
    setRouteState(loadingState)
    routeStateCallbackRef.current?.({ ...loadingState, originId: routePlan.originId, destinationId: routePlan.destinationId })
    requestTencentWalkingRoute({ key: apiKey, from, to })
      .then((route) => {
        if (!active) return
        const nextState = { status: 'success', route, message: '' }
        setRouteState(nextState)
        routeStateCallbackRef.current?.({ ...nextState, originId: routePlan.originId, destinationId: routePlan.destinationId })
      })
      .catch((error) => {
        if (!active) return
        const nextState = { status: 'error', route: null, message: routeErrorMessage(error) }
        setRouteState(nextState)
        routeStateCallbackRef.current?.({ ...nextState, originId: routePlan.originId, destinationId: routePlan.destinationId })
      })

    return () => { active = false }
  }, [routePlan?.originId, routePlan?.destinationId, routePlan?.mode, routePlan?.status, routePlan?.blockedEdgeIds?.join(','), locations])

  return (
    <div className="tencent-campus-map" aria-label="腾讯地图校园地图">
      <div className="tencent-campus-map__canvas" ref={containerRef} />
      {loadState === 'loading' && (
        <div className="tencent-campus-map__state"><span className="tencent-campus-map__spinner" />正在连接腾讯地图…</div>
      )}
      {loadState === 'error' && (
        <div className="tencent-campus-map__state tencent-campus-map__state--error">
          <strong>腾讯地图暂时无法加载</strong>
          <span>{loadError}</span>
          {onUseCampusMap
            ? <button type="button" onClick={onUseCampusMap}>切回校园引导图</button>
            : <span>请检查网络后重试。</span>}
        </div>
      )}
      {loadState === 'ready' && (
        <>
          <div className="tencent-campus-map__compass">
            <button type="button" aria-label="恢复地图朝北" title="恢复朝北" onClick={() => mapRef.current?.rotateTo(0, { duration: 240 })}>
              <span><Navigation size={17} /></span><small>N</small>
            </button>
          </div>
          <div className="tencent-campus-map__controls" aria-label="腾讯地图操作">
            <button type="button" aria-label="放大地图" title="放大" onClick={() => mapRef.current?.zoomTo(Math.min(mapRef.current.getZoom() + 1, TENCENT_CAMPUS_MAX_ZOOM), { duration: 180 })}><Plus size={15} /></button>
            <span>{zoomLevel.toFixed(1)}级</span>
            <button type="button" aria-label="缩小地图" title="缩小" onClick={() => mapRef.current?.zoomTo(Math.max(mapRef.current.getZoom() - 1, TENCENT_CAMPUS_MIN_ZOOM), { duration: 180 })}><Minus size={15} /></button>
            <button type="button" aria-label="回到本校区" title="回到校区" onClick={() => {
              mapRef.current?.panTo(new window.TMap.LatLng(TENCENT_CAMPUS_CENTER.lat, TENCENT_CAMPUS_CENTER.lng), { duration: 260 })
              mapRef.current?.zoomTo(TENCENT_CAMPUS_ZOOM, { duration: 260 })
              mapRef.current?.rotateTo(0, { duration: 260 })
            }}><LocateFixed size={14} /></button>
          </div>
          {routeState.status === 'loading' && <div className="tencent-campus-map__route-note">正在请求腾讯步行路线…</div>}
          {routeState.status === 'success' && (
            <div className="tencent-campus-map__route-note">腾讯步行路线 · {routeState.route.distance} 米 · 约 {routeState.route.durationMinutes} 分钟</div>
          )}
          {routeState.status === 'error' && (
            <div className="tencent-campus-map__route-note">{routeState.message} · 腾讯路线暂未生成</div>
          )}
          {routeState.status === 'local' && <div className="tencent-campus-map__route-note">{routeState.message} · 路径仅供预览</div>}
        </>
      )}
    </div>
  )
}
