import { describe, expect, it } from 'vitest'
import { MAP_SCALE_MAX, MAP_SCALE_MIN, clampMapScale, panMapViewport, zoomMapViewport } from './mapViewport.js'

describe('map viewport helpers', () => {
  it('clamps zoom to the supported map scale range', () => {
    expect(clampMapScale(MAP_SCALE_MIN)).toBe(MAP_SCALE_MIN)
    expect(clampMapScale(2.5)).toBe(2.5)
    expect(clampMapScale(MAP_SCALE_MAX)).toBe(MAP_SCALE_MAX)
    expect(clampMapScale(MAP_SCALE_MIN / 2)).toBe(MAP_SCALE_MIN)
    expect(clampMapScale(MAP_SCALE_MAX * 2)).toBe(MAP_SCALE_MAX)
  })

  it('moves the viewport when the user drags the map', () => {
    expect(panMapViewport({ scale: 2, offsetX: 4, offsetY: -3 }, 80, 25)).toEqual({
      scale: 2,
      offsetX: 84,
      offsetY: 22,
    })
  })

  it('keeps the zoom focus under the cursor', () => {
    expect(zoomMapViewport({ scale: 1, offsetX: 0, offsetY: 0 }, 1, { x: 100, y: 40 })).toEqual({
      scale: 1.2,
      offsetX: -20,
      offsetY: -8,
    })
  })

  it('keeps rotation when zooming, so the transform string stays valid CSS', () => {
    const zoomed = zoomMapViewport({ scale: 1, offsetX: 0, offsetY: 0, rotation: 0.4 }, 1)
    // 丢 rotation 会让 stage 的 transform 拼成 rotate(undefinedrad)：
    // 非法值被 CSSOM 丢弃 ⇒ 地图停在上一帧，表现为缩放和拖动都失效。
    expect(zoomed.rotation).toBe(0.4)
    expect(zoomed.scale).toBeCloseTo(1.2)
  })

  it('keeps rotation when panning', () => {
    const panned = panMapViewport({ scale: 1, offsetX: 0, offsetY: 0, rotation: -0.25 }, 10, 20)
    expect(panned.rotation).toBe(-0.25)
  })
})
