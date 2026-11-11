import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { collectModelAnchors, isProjectedPointVisible, projectWorldToContainer } from './campus3d.js'

describe('campus 3D helpers', () => {
  it('projects a world point into container pixels', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100)
    camera.position.set(0, 0, 10)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()
    camera.updateProjectionMatrix()

    const point = projectWorldToContainer(new THREE.Vector3(0, 0, 0), camera, 400, 200)

    expect(point.x).toBeCloseTo(200)
    expect(point.y).toBeCloseTo(100)
    expect(point.depth).toBeGreaterThan(-1)
    expect(point.depth).toBeLessThan(1)
  })

  it('marks points behind the camera as hidden', () => {
    expect(isProjectedPointVisible({ x: 20, y: 20, depth: 1.2 }, 400, 200)).toBe(false)
    expect(isProjectedPointVisible({ x: 20, y: 20, depth: 0.5 }, 400, 200)).toBe(true)
  })

  it('falls back to metadata coordinates when a model anchor is unavailable', () => {
    const model = new THREE.Group()
    const locations = [{
      id: 'library',
      modelAnchorId: 'ANCHOR_Library',
      mapPosition: { '3d': [1, 4, -8] },
    }]

    const anchors = collectModelAnchors(model, locations)
    const anchor = anchors.get('library')

    expect(anchor).toBeTruthy()
    expect(anchor.position.toArray()).toEqual([1, 4, -8])
  })
})
