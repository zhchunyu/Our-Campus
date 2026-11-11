import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { CATEGORY_LABELS } from '../../domain/campus.js'
import { CAMERA_MODES } from '../../domain/camera.js'
import { collectModelAnchors, createRoutePoints, isProjectedPointVisible, projectWorldToContainer } from './campus3d.js'
import { MapControls } from './MapControls.jsx'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const INITIAL_CAMERA = Object.freeze({
  position: [0, 1080, 520],
  target: [0, 0, -400],
  lens: 30,
})

const CAMERA_EYE_HEIGHT = 8
const WALK_SPEED = 110
const WORLD_BOUNDS = Object.freeze({ minX: -780, maxX: 780, minZ: -900, maxZ: 120 })
const ROUTE_SEGMENT_RADIUS = 4.2
const ROUTE_CORE_RADIUS = 2.4

function fovFromLens(lens, aspect) {
  return 2 * Math.atan((18 / lens) / aspect) * 180 / Math.PI
}

function disposeMaterial(material) {
  if (!material) return
  Object.values(material).forEach((value) => {
    if (value?.isTexture) value.dispose()
  })
  material.dispose()
}

function disposeObject(root) {
  root.traverse((object) => {
    if (!object.isMesh) return
    object.geometry?.dispose()
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    materials.forEach(disposeMaterial)
  })
}

function clearRouteGroup(routeGroup) {
  if (!routeGroup) return
  const geometries = new Set()
  const materials = new Set()

  while (routeGroup.children.length) {
    const object = routeGroup.children.at(-1)
    routeGroup.remove(object)
    object.traverse?.((child) => {
      if (child.geometry) geometries.add(child.geometry)
      const childMaterials = Array.isArray(child.material) ? child.material : [child.material]
      childMaterials.filter(Boolean).forEach((material) => materials.add(material))
    })
  }

  geometries.forEach((geometry) => geometry.dispose())
  materials.forEach(disposeMaterial)
}

function addRouteSegment(routeGroup, from, to, radius, material, renderOrder) {
  const direction = to.clone().sub(from)
  const length = direction.length()
  if (length < 0.01) return

  const segment = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, 10),
    material,
  )
  segment.position.copy(from).add(to).multiplyScalar(0.5)
  segment.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize())
  segment.renderOrder = renderOrder
  routeGroup.add(segment)
}

function addRouteMarker(routeGroup, position, color, isWaypoint = false) {
  const outerRadius = isWaypoint ? ROUTE_SEGMENT_RADIUS : 12
  const innerRadius = isWaypoint ? ROUTE_CORE_RADIUS : 8
  const outer = new THREE.Mesh(
    new THREE.SphereGeometry(outerRadius, 16, 12),
    new THREE.MeshBasicMaterial({
      color: 0x07343a,
      transparent: true,
      opacity: 0.96,
      depthTest: false,
      depthWrite: false,
    }),
  )
  outer.position.copy(position)
  outer.renderOrder = isWaypoint ? 1000 : 1002
  routeGroup.add(outer)

  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(innerRadius, 16, 12),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 1,
      depthTest: false,
      depthWrite: false,
    }),
  )
  marker.position.copy(position)
  marker.renderOrder = isWaypoint ? 1001 : 1003
  routeGroup.add(marker)
}

function updateRouteGroup(routeGroup, routePlan) {
  clearRouteGroup(routeGroup)
  if (!routePlan || routePlan.status !== 'preview' || routePlan.points.length < 2) return

  const points = createRoutePoints(routePlan.points)
  const outlineMaterial = new THREE.MeshBasicMaterial({
    color: 0x07343a,
    transparent: true,
    opacity: 0.96,
    depthTest: false,
    depthWrite: false,
  })
  const routeMaterial = new THREE.MeshBasicMaterial({
    color: 0x64e8d5,
    transparent: true,
    opacity: 1,
    depthTest: false,
    depthWrite: false,
  })

  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]
    const to = points[index]
    addRouteSegment(routeGroup, from, to, ROUTE_SEGMENT_RADIUS, outlineMaterial, 1000)
    addRouteSegment(routeGroup, from, to, ROUTE_CORE_RADIUS, routeMaterial, 1001)
    if (index < points.length - 1) addRouteMarker(routeGroup, to, 0x64e8d5, true)
  }

  addRouteMarker(routeGroup, points[0], 0xffc266)
  addRouteMarker(routeGroup, points.at(-1), 0x64e8d5)
}

export function Campus3DViewer({
  modelUrl,
  locations = [],
  visibleLocationIds = new Set(),
  events = [],
  selectedId = null,
  currentLocationId = null,
  cameraMode = CAMERA_MODES.ORBIT,
  routePlan = null,
  showLabels = true,
  showStatusColors = true,
  showTips = true,
  resetViewToken = 0,
  onSelectLocation,
  onCameraModeChange,
  onSwitchTo2D,
}) {
  const containerRef = useRef(null)
  const labelsRef = useRef(new Map())
  const currentLocationMarkerRef = useRef(null)
  const propsRef = useRef({ locations, visibleLocationIds, selectedId, currentLocationId, routePlan })
  const modelAnchorsRef = useRef(new Map())
  const routeGroupRef = useRef(null)
  const cameraModeRef = useRef(cameraMode)
  const onCameraModeChangeRef = useRef(onCameraModeChange)
  const orbitControlsRef = useRef(null)
  const cameraRef = useRef(null)
  const cameraSnapshotRef = useRef(null)
  const mapCommandsRef = useRef(null)
  const enterFirstPersonRef = useRef(null)
  const exitFirstPersonRef = useRef(null)
  const resetViewRef = useRef(null)
  const [status, setStatus] = useState('loading')
  const [loadProgress, setLoadProgress] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [retryToken, setRetryToken] = useState(0)
  const [missingAnchors, setMissingAnchors] = useState([])

  propsRef.current = { locations, visibleLocationIds, selectedId, currentLocationId, routePlan }
  cameraModeRef.current = cameraMode
  onCameraModeChangeRef.current = onCameraModeChange

  const eventCountByLocationId = useMemo(() => events.reduce((counts, event) => ({
    ...counts,
    [event.locationId]: (counts[event.locationId] ?? 0) + 1,
  }), {}), [events])
  const currentLocation = locations.find((location) => location.id === currentLocationId) ?? null

  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined
    setStatus('loading')
    setLoadProgress(null)
    setLoadError('')

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xb9cbdb)
    scene.fog = new THREE.Fog(0xb9cbdb, 2600, 7000)

    const width = Math.max(container.clientWidth, 1)
    const height = Math.max(container.clientHeight, 1)
    const camera = new THREE.PerspectiveCamera(
      fovFromLens(INITIAL_CAMERA.lens, width / height),
      width / height,
      1,
      30000,
    )
    camera.position.set(...INITIAL_CAMERA.position)
    cameraRef.current = camera

    let renderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    } catch {
      setLoadError('当前浏览器无法创建 WebGL 渲染器。')
      setStatus('error')
      return undefined
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    renderer.setSize(width, height, false)
    renderer.toneMapping = THREE.NeutralToneMapping
    renderer.toneMappingExposure = 1
    renderer.outputColorSpace = THREE.SRGBColorSpace
    container.prepend(renderer.domElement)
    const onWebGLContextLost = (event) => {
      event.preventDefault()
      if (!disposed) {
        setLoadError('地图渲染上下文已丢失。')
        setStatus('error')
      }
    }
    renderer.domElement.addEventListener('webglcontextlost', onWebGLContextLost)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.06
    controls.enablePan = true
    controls.screenSpacePanning = true
    controls.panSpeed = 0.85
    controls.zoomSpeed = 1.05
    controls.rotateSpeed = 0.7
    controls.maxPolarAngle = Math.PI * 0.495
    controls.minDistance = 20
    controls.maxDistance = 6000
    controls.target.set(...INITIAL_CAMERA.target)
    orbitControlsRef.current = controls

    scene.add(new THREE.HemisphereLight(0xcfe0ee, 0x6d6455, 0.55))
    const sun = new THREE.DirectionalLight(0xfff2dd, 2.2)
    sun.position.set(900, 1600, 1100)
    scene.add(sun)
    scene.add(new THREE.AmbientLight(0xffffff, 0.08))

    const routeGroup = new THREE.Group()
    routeGroup.name = 'CampusRouteOverlay'
    scene.add(routeGroup)
    routeGroupRef.current = routeGroup

    const loader = new GLTFLoader()
    const draco = new DRACOLoader()
    draco.setDecoderPath('/draco/')
    draco.setWorkerLimit(2)
    loader.setDRACOLoader(draco)

    let model = null
    let animationFrame = 0
    let disposed = false
    const anchorPoint = new THREE.Vector3()
    const spawnPoint = new THREE.Vector3()
    const clock = new THREE.Clock()
    const movement = { forward: false, backward: false, left: false, right: false }
    const look = { active: false, lastX: 0, lastY: 0, yaw: 0, pitch: 0 }
    const forward = new THREE.Vector3()
    const right = new THREE.Vector3()

    const focusFirstPerson = () => {
      const { currentLocationId: locationId } = propsRef.current
      const anchor = modelAnchorsRef.current.get(locationId ?? 'east-gate')
        ?? modelAnchorsRef.current.get('east-gate')
      if (!anchor) return

      anchor.getWorldPosition(spawnPoint)
      const location = propsRef.current.locations.find((item) => item.id === (locationId ?? 'east-gate'))
      const [offsetX, offsetY, offsetZ] = location?.firstPersonSpawnOffset ?? [0, 5, 52]
      camera.position.set(spawnPoint.x + offsetX, Math.max(CAMERA_EYE_HEIGHT, spawnPoint.y + offsetY), spawnPoint.z + offsetZ)
      camera.rotation.order = 'YXZ'
      camera.lookAt(spawnPoint.x, camera.position.y, spawnPoint.z - 26)
      look.yaw = camera.rotation.y
      look.pitch = camera.rotation.x
      camera.updateMatrixWorld()
    }

    const enterFirstPerson = () => {
      if (!cameraSnapshotRef.current) {
        cameraSnapshotRef.current = {
          position: camera.position.clone(),
          quaternion: camera.quaternion.clone(),
          target: controls.target.clone(),
        }
      }

      focusFirstPerson()
      camera.fov = 70
      camera.near = 0.1
      camera.far = 6000
      camera.updateProjectionMatrix()
      controls.enabled = false
    }

    const exitFirstPerson = () => {
      look.active = false
      controls.enabled = true
      camera.fov = fovFromLens(INITIAL_CAMERA.lens, camera.aspect)
      camera.near = 1
      camera.far = 30000

      if (cameraSnapshotRef.current) {
        camera.position.copy(cameraSnapshotRef.current.position)
        camera.quaternion.copy(cameraSnapshotRef.current.quaternion)
        controls.target.copy(cameraSnapshotRef.current.target)
        cameraSnapshotRef.current = null
      }
      camera.updateProjectionMatrix()
    }

    const resetView = () => {
      if (cameraModeRef.current === CAMERA_MODES.FIRST_PERSON) {
        onCameraModeChangeRef.current?.(CAMERA_MODES.ORBIT)
        return
      }

      camera.position.set(...INITIAL_CAMERA.position)
      controls.target.set(...INITIAL_CAMERA.target)
      camera.fov = fovFromLens(INITIAL_CAMERA.lens, camera.aspect)
      camera.near = 1
      camera.far = 30000
      camera.updateProjectionMatrix()
      controls.update()
    }

    const focusPoint = (point, distance = 420) => {
      const viewDirection = camera.position.clone().sub(controls.target)
      if (viewDirection.lengthSq() < 0.001) viewDirection.set(0, 1, 1)
      viewDirection.normalize()
      controls.target.copy(point)
      camera.position.copy(point).addScaledVector(viewDirection, distance)
      controls.update()
    }

    const focusLocation = (locationId) => {
      const anchor = modelAnchorsRef.current.get(locationId)
      if (!anchor) return
      anchor.getWorldPosition(spawnPoint)
      focusPoint(spawnPoint)
    }

    const focusRoute = () => {
      const route = propsRef.current.routePlan
      if (route?.status !== 'preview' || route.points.length < 2) return
      const points = route.points.map((position) => new THREE.Vector3(...position))
      const bounds = new THREE.Box3().setFromPoints(points)
      const sphere = bounds.getBoundingSphere(new THREE.Sphere())
      focusPoint(sphere.center, THREE.MathUtils.clamp(sphere.radius * 2.8, 420, 1800))
    }

    const zoom = (factor) => {
      if (cameraModeRef.current === CAMERA_MODES.FIRST_PERSON) return
      const offset = camera.position.clone().sub(controls.target)
      const nextDistance = THREE.MathUtils.clamp(
        offset.length() * factor,
        controls.minDistance,
        controls.maxDistance,
      )
      offset.setLength(nextDistance)
      camera.position.copy(controls.target).add(offset)
      controls.update()
    }

    mapCommandsRef.current = {
      zoomIn: () => zoom(0.82),
      zoomOut: () => zoom(1.22),
      focusSelected: () => focusLocation(propsRef.current.selectedId),
      focusCurrentLocation: () => focusLocation(propsRef.current.currentLocationId),
      focusRoute,
      resetView,
    }

    enterFirstPersonRef.current = enterFirstPerson
    exitFirstPersonRef.current = exitFirstPerson
    resetViewRef.current = resetView

    const applyLook = () => {
      camera.rotation.order = 'YXZ'
      camera.rotation.set(look.pitch, look.yaw, 0, 'YXZ')
    }
    const onPointerDown = (event) => {
      if (cameraModeRef.current !== CAMERA_MODES.FIRST_PERSON || event.button !== 0) return
      look.active = true
      look.lastX = event.clientX
      look.lastY = event.clientY
      renderer.domElement.setPointerCapture?.(event.pointerId)
    }
    const onPointerMove = (event) => {
      if (!look.active || cameraModeRef.current !== CAMERA_MODES.FIRST_PERSON) return
      const sensitivity = 0.003
      look.yaw -= (event.clientX - look.lastX) * sensitivity
      look.pitch -= (event.clientY - look.lastY) * sensitivity
      look.pitch = THREE.MathUtils.clamp(look.pitch, -Math.PI * 0.48, Math.PI * 0.48)
      look.lastX = event.clientX
      look.lastY = event.clientY
      applyLook()
    }
    const onPointerUp = (event) => {
      look.active = false
      renderer.domElement.releasePointerCapture?.(event.pointerId)
    }
    const onKeyChange = (event, pressed) => {
      if (cameraModeRef.current !== CAMERA_MODES.FIRST_PERSON) return
      if (event.code === 'Escape' && pressed) {
        onCameraModeChangeRef.current?.(CAMERA_MODES.ORBIT)
        return
      }
      const keyMap = { KeyW: 'forward', ArrowUp: 'forward', KeyS: 'backward', ArrowDown: 'backward', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' }
      const direction = keyMap[event.code]
      if (!direction) return
      event.preventDefault()
      movement[direction] = pressed
    }
    const onKeyDown = (event) => onKeyChange(event, true)
    const onKeyUp = (event) => onKeyChange(event, false)

    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointermove', onPointerMove)
    renderer.domElement.addEventListener('pointerup', onPointerUp)
    renderer.domElement.addEventListener('pointercancel', onPointerUp)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    const resize = () => {
      const nextWidth = Math.max(container.clientWidth, 1)
      const nextHeight = Math.max(container.clientHeight, 1)
      camera.aspect = nextWidth / nextHeight
      camera.fov = cameraModeRef.current === CAMERA_MODES.FIRST_PERSON ? 70 : fovFromLens(INITIAL_CAMERA.lens, camera.aspect)
      camera.updateProjectionMatrix()
      renderer.setSize(nextWidth, nextHeight, false)
    }

    const syncAnnotationPositions = () => {
      const {
        locations: currentLocations,
        visibleLocationIds: currentVisibleIds,
        selectedId: currentSelectedId,
        currentLocationId: currentId,
        routePlan: currentRoutePlan,
      } = propsRef.current
      const currentWidth = Math.max(container.clientWidth, 1)
      const currentHeight = Math.max(container.clientHeight, 1)

      currentLocations.forEach((location) => {
        const label = labelsRef.current.get(location.id)
        const anchor = modelAnchorsRef.current.get(location.id)
        if (
          !label
          || !anchor
          || currentRoutePlan?.status === 'preview'
          || (!currentVisibleIds.has(location.id) && currentSelectedId !== location.id)
        ) {
          if (label) label.hidden = true
          return
        }

        anchor.getWorldPosition(anchorPoint)
        const point = projectWorldToContainer(anchorPoint, camera, currentWidth, currentHeight)
        const visible = isProjectedPointVisible(point, currentWidth, currentHeight)
        label.hidden = !visible
        if (!visible) return

        label.style.transform = `translate3d(${point.x}px, ${point.y}px, 0) translate(-50%, -100%)`
        label.dataset.positioned = 'true'
      })

      const marker = currentLocationMarkerRef.current
      const currentAnchor = modelAnchorsRef.current.get(currentId)
      if (!marker || !currentAnchor || !currentId || cameraModeRef.current === CAMERA_MODES.FIRST_PERSON) {
        if (marker) marker.hidden = true
        return
      }

      currentAnchor.getWorldPosition(anchorPoint)
      const currentPoint = projectWorldToContainer(anchorPoint, camera, currentWidth, currentHeight)
      const currentVisible = isProjectedPointVisible(currentPoint, currentWidth, currentHeight)
      marker.hidden = !currentVisible
      if (currentVisible) marker.style.transform = `translate3d(${currentPoint.x}px, ${currentPoint.y}px, 0) translate(-50%, 10px)`
    }

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(container)

    const render = () => {
      if (disposed) return
      const delta = Math.min(clock.getDelta(), 0.05)
      if (cameraModeRef.current === CAMERA_MODES.FIRST_PERSON) {
        const distance = WALK_SPEED * delta
        camera.getWorldDirection(forward)
        forward.y = 0
        forward.normalize()
        right.setFromMatrixColumn(camera.matrixWorld, 0)
        right.y = 0
        right.normalize()
        if (movement.forward) camera.position.addScaledVector(forward, distance)
        if (movement.backward) camera.position.addScaledVector(forward, -distance)
        if (movement.left) camera.position.addScaledVector(right, -distance)
        if (movement.right) camera.position.addScaledVector(right, distance)
        camera.position.x = THREE.MathUtils.clamp(camera.position.x, WORLD_BOUNDS.minX, WORLD_BOUNDS.maxX)
        camera.position.z = THREE.MathUtils.clamp(camera.position.z, WORLD_BOUNDS.minZ, WORLD_BOUNDS.maxZ)
        camera.position.y = CAMERA_EYE_HEIGHT
      } else {
        controls.update()
      }
      syncAnnotationPositions()
      renderer.render(scene, camera)
      animationFrame = requestAnimationFrame(render)
    }

    loader.load(
      modelUrl,
      (gltf) => {
        if (disposed) return
        model = gltf.scene
        model.traverse((object) => {
          if (!object.isMesh) return
          object.frustumCulled = true
          object.castShadow = false
          object.receiveShadow = false
          const material = object.material
          if (material?.transmission > 0) {
            material.transmission = 0
            material.transparent = true
            material.opacity = 0.34
            material.depthWrite = false
          }
        })
        scene.add(model)
        const anchors = collectModelAnchors(model, propsRef.current.locations)
        modelAnchorsRef.current = anchors
        setMissingAnchors(propsRef.current.locations
          .filter((location) => !anchors.has(location.id))
          .map((location) => location.name))
        updateRouteGroup(routeGroup, propsRef.current.routePlan)
        if (cameraModeRef.current === CAMERA_MODES.FIRST_PERSON) enterFirstPerson()
        setLoadProgress(100)
        setStatus('ready')
      },
      (progressEvent) => {
        if (!disposed && progressEvent.total > 0) {
          setLoadProgress(Math.min(99, Math.round((progressEvent.loaded / progressEvent.total) * 100)))
        }
      },
      (error) => {
        if (!disposed) {
          setLoadError(error?.message || '模型或 Draco 解码资源加载失败。')
          setStatus('error')
        }
      },
    )

    render()

    return () => {
      disposed = true
      cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointermove', onPointerMove)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      renderer.domElement.removeEventListener('pointercancel', onPointerUp)
      renderer.domElement.removeEventListener('webglcontextlost', onWebGLContextLost)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      controls.dispose()
      draco.dispose()
      clearRouteGroup(routeGroup)
      if (model) {
        scene.remove(model)
        disposeObject(model)
      }
      renderer.dispose()
      renderer.domElement.remove()
      routeGroupRef.current = null
      modelAnchorsRef.current = new Map()
      cameraRef.current = null
      orbitControlsRef.current = null
      mapCommandsRef.current = null
      enterFirstPersonRef.current = null
      exitFirstPersonRef.current = null
      resetViewRef.current = null
    }
  }, [modelUrl, retryToken])

  useEffect(() => {
    if (cameraMode === CAMERA_MODES.FIRST_PERSON) enterFirstPersonRef.current?.()
    else exitFirstPersonRef.current?.()
  }, [cameraMode])

  useEffect(() => {
    if (cameraMode === CAMERA_MODES.FIRST_PERSON) enterFirstPersonRef.current?.()
  }, [cameraMode, currentLocationId])

  useEffect(() => {
    updateRouteGroup(routeGroupRef.current, routePlan)
  }, [routePlan])

  useEffect(() => {
    resetViewRef.current?.()
  }, [resetViewToken])

  const setLabelRef = (locationId) => (node) => {
    if (node) labelsRef.current.set(locationId, node)
    else labelsRef.current.delete(locationId)
  }

  return (
    <div className={`campus-3d-viewer ${cameraMode === CAMERA_MODES.FIRST_PERSON ? 'is-first-person' : ''}`} ref={containerRef}>
      {status === 'ready' && cameraMode === CAMERA_MODES.ORBIT && (
        <MapControls
          canFocusSelected={Boolean(selectedId && modelAnchorsRef.current.has(selectedId))}
          canFocusCurrentLocation={Boolean(currentLocationId && modelAnchorsRef.current.has(currentLocationId))}
          canFocusRoute={routePlan?.status === 'preview' && routePlan.points.length > 1}
          onZoomIn={() => mapCommandsRef.current?.zoomIn()}
          onZoomOut={() => mapCommandsRef.current?.zoomOut()}
          onFocusSelected={() => mapCommandsRef.current?.focusSelected()}
          onFocusCurrentLocation={() => mapCommandsRef.current?.focusCurrentLocation()}
          onFocusRoute={() => mapCommandsRef.current?.focusRoute()}
          onResetView={() => mapCommandsRef.current?.resetView()}
        />
      )}
      <div className="campus-3d-annotations" aria-label="地图地点标签">
        {locations.map((location) => {
          const eventCount = eventCountByLocationId[location.id] ?? 0
          const statusClass = showStatusColors && location.openStatus === 'closed'
            ? 'is-closed'
            : showStatusColors && location.openStatus === 'limited'
              ? 'is-limited'
              : showStatusColors && location.crowdStatus === 'busy'
                ? 'is-busy'
                : ''
          return (
            <button
              className={`campus-3d-label ${selectedId === location.id ? 'is-selected' : ''} ${showLabels ? '' : 'is-compact'}`}
              aria-label={`${location.name}，${CATEGORY_LABELS[location.category]}${eventCount > 0 ? `，${eventCount} 条热点` : ''}`}
              data-location-id={location.id}
              key={location.id}
              onClick={() => onSelectLocation?.(location.id)}
              ref={setLabelRef(location.id)}
              type="button"
            >
              <i className={`campus-3d-label__pin ${statusClass}`} />
              <span className="campus-3d-label__title">{location.name}</span>
              <small>{CATEGORY_LABELS[location.category]}</small>
              {eventCount > 0 && <em className="campus-3d-label__hotspot">{eventCount} 条热点</em>}
            </button>
          )
        })}
      </div>
      <div className="campus-3d-current-location" ref={currentLocationMarkerRef} hidden>
        <span className="campus-3d-current-location__dot" />
        <strong>我的位置</strong>
        <small>{currentLocation?.name ?? ''}</small>
      </div>
      {cameraMode === CAMERA_MODES.FIRST_PERSON && (
        <div className="campus-3d-first-person-hint">
          <strong>第一人称漫游</strong>
          <span>WASD 移动 · 按住鼠标拖拽环顾 · Esc 返回俯视</span>
          <button type="button" onClick={() => onCameraModeChange?.(CAMERA_MODES.ORBIT)}>返回俯视</button>
        </div>
      )}
      {showTips && cameraMode !== CAMERA_MODES.FIRST_PERSON && (
        <div className="campus-3d-controls-hint">左键旋转 · 右键拖动平移 · 滚轮缩放</div>
      )}
      {missingAnchors.length > 0 && (
        <div className="campus-3d-anchor-warning" role="status">
          模型锚点待校准：{missingAnchors.join('、')}
        </div>
      )}
      {status !== 'ready' && (
        <div className={`campus-3d-state campus-3d-state--${status}`} role="status">
          <strong>{status === 'error' ? '三维地图暂不可用' : '正在加载全园模型'}</strong>
          <span>{status === 'error' ? (loadError || '请检查模型资源与浏览器 WebGL 支持。') : `GLB / Draco 解码中${loadProgress === null ? '…' : ` · ${loadProgress}%`}`}</span>
          {status === 'error' && (
            <div className="campus-3d-state__actions">
              <button type="button" onClick={() => { setStatus('loading'); setRetryToken((token) => token + 1) }}>重新加载</button>
              <button type="button" onClick={onSwitchTo2D}>切换到二维地图</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
