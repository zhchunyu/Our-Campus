const HISTORY_KEY = '__ourCampusBackEntry'
const GESTURE_IGNORE = 'input, textarea, select, [contenteditable="true"], canvas, video, .tencent-campus-map, .campus-2d-viewer, .campus-3d-viewer, [data-window-photo-viewer], [data-back-gesture="ignore"]'

export function isBackSwipe({ edge, startX, startY, x, y, elapsed }) {
  const distance = edge === 'left' ? x - startX : startX - x
  return elapsed <= 700 && distance >= 72 && Math.abs(y - startY) <= 44 && distance > Math.abs(y - startY) * 1.8
}

// One disposable history entry lets browser Back close the current UI layer.
// UI buttons remove the entry at the root, so opening/closing pages never piles up stale entries.
export function createBackNavigation(target, { enableSwipe = true } = {}) {
  const layers = new Map()
  let sequence = 0
  let armed = Boolean(target.history.state?.[HISTORY_KEY])
  let cleanupPending = false
  let syncTimer = null
  let gesture = null
  let disposed = false
  const top = () => [...layers.values()].sort((a, b) => b.priority - a.priority || b.order - a.order)[0]
  const sync = () => {
    syncTimer = null
    if (disposed || cleanupPending) return
    if (layers.size && !armed) {
      target.history.pushState({ ...target.history.state, [HISTORY_KEY]: true }, '', target.location.href)
      armed = true
    } else if (!layers.size && armed) {
      armed = false
      cleanupPending = true
      target.history.back()
    }
  }
  const queueSync = () => { if (syncTimer === null) syncTimer = target.setTimeout(sync, 0) }
  const requestBack = () => {
    if (cleanupPending) return true
    const layer = top()
    if (!layer) return false
    layer.onBack()
    queueSync()
    return true
  }
  const pop = (event) => {
    armed = Boolean(event.state?.[HISTORY_KEY])
    if (cleanupPending) cleanupPending = false
    else if (!armed) requestBack()
    queueSync()
  }
  const keydown = (event) => {
    if (event.key !== 'Escape' || !top()) return
    event.preventDefault()
    event.stopImmediatePropagation()
    requestBack()
  }
  const clearGesture = () => {
    gesture = null
    target.document.documentElement.removeAttribute('data-back-swipe')
  }
  const touchstart = (event) => {
    clearGesture()
    if (event.touches.length !== 1 || !top()?.swipe || event.target.closest?.(GESTURE_IGNORE)) return
    const point = event.touches[0]
    const width = target.innerWidth
    const edge = point.clientX <= 24 ? 'left' : point.clientX >= width - 24 ? 'right' : null
    if (edge) gesture = { edge, startX: point.clientX, startY: point.clientY, startedAt: Date.now(), layer: top() }
  }
  const touchmove = (event) => {
    if (!gesture) return
    if (event.touches.length !== 1 || top() !== gesture.layer) { clearGesture(); return }
    const point = event.touches[0]
    const dx = gesture.edge === 'left' ? point.clientX - gesture.startX : gesture.startX - point.clientX
    const dy = Math.abs(point.clientY - gesture.startY)
    if ((dy > 16 && dy > Math.abs(dx)) || dx < -10) { clearGesture(); return }
    if (dx > 16 && dx > dy * 1.8) {
      if (event.cancelable) event.preventDefault()
      target.document.documentElement.setAttribute('data-back-swipe', gesture.edge)
    }
  }
  const touchend = (event) => {
    const started = gesture
    const point = event.changedTouches[0]
    clearGesture()
    if (started && point && top() === started.layer && isBackSwipe({ ...started, x: point.clientX, y: point.clientY, elapsed: Date.now() - started.startedAt })) requestBack()
  }
  target.addEventListener('popstate', pop)
  target.addEventListener('keydown', keydown, true)
  if (enableSwipe) {
    target.document.addEventListener('touchstart', touchstart, { passive: true })
    target.document.addEventListener('touchmove', touchmove, { passive: false })
    target.document.addEventListener('touchend', touchend)
    target.document.addEventListener('touchcancel', clearGesture)
  }
  target.__ourCampusBack = requestBack
  queueSync()
  return {
    register(onBack, { priority = 0, swipe = true } = {}) {
      const id = ++sequence
      layers.set(id, { onBack, priority, swipe, order: id })
      queueSync()
      return () => { layers.delete(id); queueSync() }
    },
    requestBack,
    dispose() {
      disposed = true
      target.clearTimeout(syncTimer)
      target.removeEventListener('popstate', pop)
      target.removeEventListener('keydown', keydown, true)
      target.document.removeEventListener('touchstart', touchstart)
      target.document.removeEventListener('touchmove', touchmove)
      target.document.removeEventListener('touchend', touchend)
      target.document.removeEventListener('touchcancel', clearGesture)
      clearGesture()
      if (target.__ourCampusBack === requestBack) delete target.__ourCampusBack
    },
  }
}
