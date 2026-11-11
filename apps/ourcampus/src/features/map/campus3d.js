import * as THREE from 'three'

export function projectWorldToContainer(worldPosition, camera, width, height) {
  const projected = worldPosition.clone().project(camera)
  return {
    x: (projected.x * 0.5 + 0.5) * width,
    y: (-projected.y * 0.5 + 0.5) * height,
    depth: projected.z,
  }
}

export function isProjectedPointVisible(point, width, height) {
  return point.depth >= -1
    && point.depth <= 1
    && point.x >= -32
    && point.x <= width + 32
    && point.y >= -32
    && point.y <= height + 32
}

export function collectModelAnchors(model, locations) {
  const anchors = new Map()
  locations.forEach((location) => {
    const object = location.modelAnchorId ? model.getObjectByName(location.modelAnchorId) : null
    if (object) anchors.set(location.id, object)
    else {
      const metadataAnchor = createMetadataAnchor(location)
      if (metadataAnchor) anchors.set(location.id, metadataAnchor)
    }
  })
  return anchors
}

export function createMetadataAnchor(location) {
  const position = location?.mapPosition?.['3d']
  if (!position) return null

  const anchor = new THREE.Object3D()
  anchor.position.set(...position)
  return anchor
}

export function createRoutePoints(points, lift = 1.2) {
  return points.map(([x, y, z]) => new THREE.Vector3(x, y + lift, z))
}
