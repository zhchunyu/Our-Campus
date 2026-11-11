import { useEffect, useMemo, useRef, useState } from 'react'
import { CircleAlert, LocateFixed, MapPinned, Minus, Navigation, Plus, RefreshCw } from 'lucide-react'
import { teamCampusMap } from '../../data/campusMap.js'
import { getCampusMapPositionFromTencentPosition } from '../../data/tencentCampusGeo.js'
import { getLocationMapPosition, getRouteMapPoints } from '../../domain/mapScene.js'
import { clampMapScale, panMapViewport, zoomMapViewport } from '../../domain/mapViewport.js'
import { markStartupReady } from '../../app/startup.js'

function pointDistance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function pointAngle(a, b) {
  return Math.atan2(b.y - a.y, b.x - a.x)
}

function normalizeAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}

function rotatePoint(point, angle) {
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  return {
    x: point.x * cosine - point.y * sine,
    y: point.x * sine + point.y * cosine,
  }
}

function gestureCenter(a, b, rect) {
  return {
    x: (a.x + b.x) / 2 - (rect.left + rect.width / 2),
    y: (a.y + b.y) / 2 - (rect.top + rect.height / 2),
  }
}

function makeGesture(points, rect, viewport) {
  const [first, second] = [...points.entries()].slice(0, 2)
  if (!second) {
    return {
      type: 'pan',
      pointerId: first[0],
      startX: first[1].x,
      startY: first[1].y,
      dragged: false,
      viewport,
    }
  }

  return {
    type: 'transform',
    pointerIds: [first[0], second[0]],
    center: gestureCenter(first[1], second[1], rect),
    distance: Math.max(pointDistance(first[1], second[1]), 1),
    angle: pointAngle(first[1], second[1]),
    viewport,
  }
}

function markerStyle(position) {
  return {
    left: `${position[0] * 100}%`,
    top: `${position[1] * 100}%`,
  }
}

function routePointsToSvg(points) {
  return points?.map(([x, y]) => `${x * 100},${y * 100}`).join(' ') ?? ''
}

export function Campus2DViewer({
  mapUrl,
  imageWidth = 2140,
  imageHeight = 1020,
  imageCrop = { x: 0, y: 0, width: 1, height: 1 },
  locations = [],
  visibleLocationIds = new Set(),
  mapMarkerLocationIds = visibleLocationIds,
  events = [],
  lostFoundLocationIds = new Set(),
  selectedId = null,
  currentLocationId = null,
  livePosition = null,
  livePositionFocusToken = 0,
  routePlan = null,
  showLabels = true,
  showStatusColors = true,
  showTips = true,
  resetViewToken = 0,
  onSelectLocation,
}) {
  const viewerRef = useRef(null)
  const stageRef = useRef(null)
  const pointersRef = useRef(new Map())
  const gestureRef = useRef(null)
  const suppressMarkerClickRef = useRef(false)
  const [imageState, setImageState] = useState('loading')
  useEffect(() => {
    if (imageState !== 'loading') markStartupReady('map')
  }, [imageState])
  const [imageKey, setImageKey] = useState(0)
  const [viewport, setViewport] = useState({ scale: 1, offsetX: 0, offsetY: 0, rotation: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const viewportRef = useRef(viewport)
  viewportRef.current = viewport
  const routePoints = useMemo(
    () => teamCampusMap.routeOverlayCalibrated ? getRouteMapPoints(routePlan, '2d') : null,
    [routePlan],
  )
  const currentLocation = locations.find((location) => location.id === currentLocationId) ?? null
  const liveMapPosition = livePosition ? getCampusMapPositionFromTencentPosition(livePosition) : null
  const hotspotLocationIds = useMemo(() => new Set(events.map((event) => event.locationId)), [events])
  const imageStyle = {
    left: `${-imageCrop.x / imageCrop.width * 100}%`,
    top: `${-imageCrop.y / imageCrop.height * 100}%`,
    width: `${100 / imageCrop.width}%`,
    height: `${100 / imageCrop.height}%`,
  }

  const retryImage = () => {
    setImageState('loading')
    setImageKey((key) => key + 1)
  }

  const resetViewport = () => setViewport({ scale: 1, offsetX: 0, offsetY: 0, rotation: 0 })

  useEffect(() => {
    resetViewport()
  }, [resetViewToken])

  useEffect(() => {
    const position = getLocationMapPosition(locations.find((location) => location.id === selectedId), '2d')
    const stage = stageRef.current
    if (!position || !stage) return

    const localPoint = {
      x: (position[0] - 0.5) * stage.offsetWidth,
      y: (position[1] - 0.5) * stage.offsetHeight,
    }
    const projectedPoint = rotatePoint(localPoint, viewportRef.current.rotation)
    setViewport((current) => ({
      ...current,
      offsetX: -projectedPoint.x * current.scale,
      offsetY: -projectedPoint.y * current.scale,
    }))
  }, [selectedId, locations])

  useEffect(() => {
    if (!liveMapPosition || livePositionFocusToken === 0) return
    const stage = stageRef.current
    if (!stage) return

    const localPoint = {
      x: (liveMapPosition[0] - 0.5) * stage.offsetWidth,
      y: (liveMapPosition[1] - 0.5) * stage.offsetHeight,
    }
    const projectedPoint = rotatePoint(localPoint, viewportRef.current.rotation)
    setViewport((current) => ({
      ...current,
      offsetX: -projectedPoint.x * current.scale,
      offsetY: -projectedPoint.y * current.scale,
    }))
  }, [liveMapPosition?.[0], liveMapPosition?.[1], livePositionFocusToken])

  const zoomFromCenter = (direction) => {
    setViewport((current) => zoomMapViewport(current, direction))
  }

  const handleWheel = (event) => {
    event.preventDefault()
    const rect = viewerRef.current?.getBoundingClientRect()
    if (!rect) return

    setViewport((current) => zoomMapViewport(current, event.deltaY < 0 ? 1 : -1, {
      x: event.clientX - (rect.left + rect.width / 2),
      y: event.clientY - (rect.top + rect.height / 2),
    }))
  }

  const handleDoubleClick = (event) => {
    const rect = viewerRef.current?.getBoundingClientRect()
    if (!rect) return
    setViewport((current) => zoomMapViewport(current, 1, {
      x: event.clientX - (rect.left + rect.width / 2),
      y: event.clientY - (rect.top + rect.height / 2),
    }))
  }

  const handlePointerDown = (event) => {
    const startsOnMarker = Boolean(event.target.closest('.campus-2d-marker'))
    if (!startsOnMarker) {
      // 阻止浏览器在拖动地图时启动原生框选/拖放（否则拖动会变成选文本，地图拖不动）
      event.preventDefault()
      event.currentTarget.setPointerCapture?.(event.pointerId)
    }
    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      captured: !startsOnMarker,
    })
    const rect = viewerRef.current?.getBoundingClientRect()
    if (rect) gestureRef.current = makeGesture(pointersRef.current, rect, viewportRef.current)
    setIsDragging(true)
  }

  const handlePointerMove = (event) => {
    const pointers = pointersRef.current
    if (!pointers.has(event.pointerId)) return
    pointers.set(event.pointerId, { ...pointers.get(event.pointerId), x: event.clientX, y: event.clientY })

    const gesture = gestureRef.current
    const rect = viewerRef.current?.getBoundingClientRect()
    if (!gesture || !rect) return

    if (gesture.type === 'pan' && pointers.size === 1 && gesture.pointerId === event.pointerId) {
      const deltaX = event.clientX - gesture.startX
      const deltaY = event.clientY - gesture.startY
      if (!gesture.dragged && Math.hypot(deltaX, deltaY) < 4) return

      gesture.dragged = true
      suppressMarkerClickRef.current = true
      if (!pointers.get(event.pointerId).captured) {
        event.currentTarget.setPointerCapture?.(event.pointerId)
        pointers.set(event.pointerId, { ...pointers.get(event.pointerId), captured: true })
      }
      setViewport(panMapViewport(
        gesture.viewport,
        deltaX,
        deltaY,
      ))
      return
    }

    const [firstId, secondId] = gesture.pointerIds ?? []
    const first = pointers.get(firstId)
    const second = pointers.get(secondId)
    if (!first || !second) return

    const center = gestureCenter(first, second, rect)
    const distanceRatio = pointDistance(first, second) / gesture.distance
    const scale = clampMapScale(gesture.viewport.scale * distanceRatio)
    const rotation = gesture.viewport.rotation + normalizeAngle(pointAngle(first, second) - gesture.angle)
    gesture.dragged = true
    suppressMarkerClickRef.current = true
    const initialLocalPoint = rotatePoint({
      x: (gesture.center.x - gesture.viewport.offsetX) / gesture.viewport.scale,
      y: (gesture.center.y - gesture.viewport.offsetY) / gesture.viewport.scale,
    }, -gesture.viewport.rotation)
    const transformedPoint = rotatePoint(initialLocalPoint, rotation)

    setViewport({
      scale,
      rotation,
      offsetX: center.x - transformedPoint.x * scale,
      offsetY: center.y - transformedPoint.y * scale,
    })
  }

  const handlePointerUp = (event) => {
    const pointers = pointersRef.current
    if (!pointers.has(event.pointerId)) return
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    pointers.delete(event.pointerId)
    if (gestureRef.current?.dragged) {
      suppressMarkerClickRef.current = true
      window.setTimeout(() => { suppressMarkerClickRef.current = false }, 0)
    }
    const rect = viewerRef.current?.getBoundingClientRect()
    gestureRef.current = rect && pointers.size
      ? makeGesture(pointers, rect, viewportRef.current)
      : null
    setIsDragging(pointers.size > 0)
  }

  return (
    <div
      className={`campus-2d-viewer ${isDragging ? 'is-dragging' : ''}`}
      ref={viewerRef}
      onWheel={handleWheel}
    >
      <div
        className="campus-2d-stage"
        ref={stageRef}
        style={{
          aspectRatio: `${imageWidth * imageCrop.width} / ${imageHeight * imageCrop.height}`,
          transform: `translate3d(${viewport.offsetX}px, ${viewport.offsetY}px, 0) scale(${viewport.scale}) rotate(${viewport.rotation}rad)`,
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        onDragStart={(event) => event.preventDefault()}
      >
        <img
          key={imageKey}
          className={`campus-2d-image campus-2d-image--${imageState}`}
          src={mapUrl}
          alt={`${teamCampusMap.campusName}校园 2D 引导图`}
          style={imageStyle}
          draggable={false}
          onLoad={() => setImageState('ready')}
          onError={() => setImageState('error')}
        />

        {imageState === 'ready' && (
          <div className="campus-2d-overlay">
            {liveMapPosition && (
              <div className="campus-2d-live-location" style={markerStyle(liveMapPosition)} aria-label="我的实时位置">
                <span className="campus-2d-live-location__halo" />
                <span className="campus-2d-live-location__dot" />
              </div>
            )}
            {routePoints && (
              <svg className="campus-2d-route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="当前路线">
                <polyline points={routePointsToSvg(routePoints)} />
                <circle cx={routePoints[0][0] * 100} cy={routePoints[0][1] * 100} r="1.5" className="campus-2d-route__origin" />
                <circle cx={routePoints.at(-1)[0] * 100} cy={routePoints.at(-1)[1] * 100} r="1.8" className="campus-2d-route__destination" />
              </svg>
            )}

            {locations.filter((location) => mapMarkerLocationIds.has(location.id)).map((location) => {
              const position = getLocationMapPosition(location, '2d')
              if (!position) return null
              const isSelected = selectedId === location.id
              const isCurrent = currentLocationId === location.id
              return (
                <button
                  className={`campus-2d-marker ${location.mapApartmentNumber ? 'campus-2d-marker--numbered' : ''} ${isSelected ? 'is-selected' : ''} ${isCurrent ? 'is-current' : ''} ${showStatusColors && location.crowdStatus === 'busy' ? 'is-busy' : ''} ${showStatusColors && location.openStatus === 'closed' ? 'is-closed' : ''} ${showStatusColors && location.openStatus === 'limited' ? 'is-limited' : ''} ${hotspotLocationIds.has(location.id) ? 'has-hotspot' : ''}`}
                  key={location.id}
                  type="button"
                  style={markerStyle(position)}
                  aria-label={`查看${location.name}${hotspotLocationIds.has(location.id) ? '，有热点' : ''}${lostFoundLocationIds.has(location.id) ? '，有失物信息' : ''}`}
                  aria-pressed={isSelected}
                  onClick={(clickEvent) => {
                    if (suppressMarkerClickRef.current) {
                      clickEvent.preventDefault()
                      clickEvent.stopPropagation()
                      suppressMarkerClickRef.current = false
                      return
                    }
                    onSelectLocation(location.id)
                  }}
                >
                  {location.mapApartmentNumber
                    ? <span className="campus-2d-marker__number">{location.mapApartmentNumber}号</span>
                    : <span className="campus-2d-marker__dot" />}
                  {showLabels && <span className="campus-2d-marker__label">{location.name}</span>}
                  {!showLabels && hotspotLocationIds.has(location.id) && <span className="campus-2d-marker__hotspot-count">热点</span>}
                  {lostFoundLocationIds.has(location.id) && <span className="campus-2d-marker__lost-found">失物</span>}
                </button>
              )
            })}

            {currentLocation && !visibleLocationIds.has(currentLocation.id) && (
              <div className="campus-2d-current-note"><LocateFixed size={14} />当前位置已被筛选隐藏</div>
            )}
          </div>
        )}

        {imageState === 'loading' && (
          <div className="campus-2d-state"><MapPinned size={18} /><span>2D 平面图加载中…</span></div>
        )}
        {imageState === 'error' && (
          <div className="campus-2d-state campus-2d-state--error">
            <CircleAlert size={18} />
            <span>2D 底图加载失败</span>
            <button type="button" onClick={retryImage}><RefreshCw size={13} />重试</button>
          </div>
        )}
        {routePlan?.status === 'preview' && !routePoints && (
          <div className="campus-2d-route-note">路线演示尚未按这张校园图校准</div>
        )}
        {routePlan?.status === 'arrived' && (
          <div className="campus-2d-route-note">当前位置已在目的地，无需规划路线</div>
        )}
        {routePlan?.status === 'unavailable' && (
          <div className="campus-2d-route-note">当前路线模式下没有可用路线</div>
        )}
      </div>
      <button
        className="campus-2d-compass"
        type="button"
        aria-label="恢复地图朝北方向"
        title="恢复朝北"
        onClick={() => setViewport((current) => ({ ...current, rotation: 0 }))}
      >
        <span style={{ transform: `rotate(${viewport.rotation}rad)` }}><Navigation size={17} /></span>
        <small>N</small>
      </button>
      <div className="campus-2d-controls" aria-label="2D 地图操作">
        <button type="button" aria-label="放大地图" title="放大" onClick={() => zoomFromCenter(1)}><Plus size={15} /></button>
        <span aria-live="polite">{Math.round(viewport.scale * 100)}%</span>
        <button type="button" aria-label="缩小地图" title="缩小" onClick={() => zoomFromCenter(-1)}><Minus size={15} /></button>
        <button type="button" aria-label="重置地图视图" title="重置视图" onClick={resetViewport}><RefreshCw size={14} /></button>
      </div>
      {showTips && <div className="campus-2d-help">单指拖动 · 双指缩放和旋转</div>}
    </div>
  )
}
