export const MAP_SCALE_MIN = 0.2
export const MAP_SCALE_MAX = 5

export function clampMapScale(scale) {
  return Math.min(MAP_SCALE_MAX, Math.max(MAP_SCALE_MIN, scale))
}

export function panMapViewport(viewport, deltaX, deltaY) {
  return {
    ...viewport,
    offsetX: viewport.offsetX + deltaX,
    offsetY: viewport.offsetY + deltaY,
  }
}

export function zoomMapViewport(viewport, direction, focus = { x: 0, y: 0 }) {
  const nextScale = clampMapScale(viewport.scale * (direction > 0 ? 1.2 : 1 / 1.2))
  const ratio = nextScale / viewport.scale

  // ★ 必须展开原 viewport：漏掉 rotation 会让 transform 拼成 rotate(undefinedrad)，
  //   非法 CSS 值被 CSSOM 丢弃 ⇒ 地图停在上一帧，表现为"缩放/拖动都没反应"。
  return {
    ...viewport,
    scale: nextScale,
    offsetX: focus.x + (viewport.offsetX - focus.x) * ratio,
    offsetY: focus.y + (viewport.offsetY - focus.y) * ratio,
  }
}
