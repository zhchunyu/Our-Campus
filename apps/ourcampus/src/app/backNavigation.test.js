import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBackNavigation, isBackSwipe } from './backNavigation.js'

function browser(initialState = { existing: 'preserved' }) {
  const target = new EventTarget()
  const document = new EventTarget()
  document.documentElement = { removeAttribute: vi.fn(), setAttribute: vi.fn() }
  const entries = [initialState]
  let index = 0
  Object.assign(target, { document, innerWidth: 390, location: { href: 'https://campus.test/' }, setTimeout, clearTimeout })
  target.history = {
    get state() { return entries[index] },
    pushState(state) { entries.splice(index + 1); entries.push(state); index++ },
    back: vi.fn(() => {
      if (!index) return
      index--
      setTimeout(() => {
        const event = new Event('popstate')
        event.state = entries[index]
        target.dispatchEvent(event)
      }, 0)
    }),
  }
  return { target, depth: () => index }
}

describe('page back navigation', () => {
  let navigation
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => { navigation?.dispose(); vi.useRealTimers() })
  it('closes the top page first and browser Back can then close its parent', () => {
    const { target, depth } = browser()
    navigation = createBackNavigation(target)
    const closed = []
    const parent = navigation.register(() => { closed.push('services'); parent() }, { priority: 10 })
    const child = navigation.register(() => { closed.push('AI'); child() }, { priority: 80 })
    vi.runAllTimers()
    expect(depth()).toBe(1)
    expect(target.history.state.existing).toBe('preserved')
    target.history.back(); vi.runAllTimers()
    expect(closed).toEqual(['AI'])
    expect(depth()).toBe(1)
    target.history.back(); vi.runAllTimers()
    expect(closed).toEqual(['AI', 'services'])
    expect(depth()).toBe(0)
    expect(target.__ourCampusBack()).toBe(false)
  })
  it('removes its history entry after UI Back and does not accumulate entries on reopening', () => {
    const { target, depth } = browser()
    navigation = createBackNavigation(target)
    for (let i = 0; i < 5; i++) {
      const close = navigation.register(vi.fn())
      vi.runAllTimers(); expect(depth()).toBe(1)
      close(); vi.runAllTimers(); expect(depth()).toBe(0)
    }
  })
  it('keeps a newly opened page if an earlier UI-close history cleanup is still pending', () => {
    const { target, depth } = browser()
    navigation = createBackNavigation(target)
    const close = navigation.register(vi.fn())
    vi.runAllTimers()
    close(); vi.advanceTimersToNextTimer()
    const next = vi.fn()
    navigation.register(next)
    vi.runAllTimers()
    expect(next).not.toHaveBeenCalled()
    expect(depth()).toBe(1)
  })
  it('consumes native Back while a submission is busy, without closing a lower page', () => {
    const { target, depth } = browser()
    navigation = createBackNavigation(target)
    const parent = vi.fn()
    let busy = true
    navigation.register(parent, { priority: 10 })
    const close = navigation.register(() => { if (!busy) close() }, { priority: 100 })
    vi.runAllTimers()
    expect(target.__ourCampusBack()).toBe(true)
    target.history.back(); vi.runAllTimers()
    expect(parent).not.toHaveBeenCalled()
    expect(depth()).toBe(1)
    busy = false
    target.__ourCampusBack(); vi.runAllTimers()
    expect(parent).not.toHaveBeenCalled()
  })
  it('cleans a stale history entry after a page reload', () => {
    const { target, depth } = browser()
    target.history.pushState({ __ourCampusBackEntry: true })
    navigation = createBackNavigation(target)
    vi.runAllTimers()
    expect(depth()).toBe(0)
    expect(target.__ourCampusBack()).toBe(false)
  })
  it('accepts inward swipes from both edges and rejects scrolling, tiny or slow gestures', () => {
    const start = { edge: 'left', startX: 10, startY: 300, x: 110, y: 310, elapsed: 250 }
    expect(isBackSwipe(start)).toBe(true)
    expect(isBackSwipe({ ...start, edge: 'right', startX: 380, x: 280 })).toBe(true)
    expect(isBackSwipe({ ...start, x: 45 })).toBe(false)
    expect(isBackSwipe({ ...start, y: 400 })).toBe(false)
    expect(isBackSwipe({ ...start, elapsed: 900 })).toBe(false)
    expect(isBackSwipe({ ...start, x: -90 })).toBe(false)
  })
  it('never turns a map drag or multitouch into a page return', () => {
    const { target } = browser()
    navigation = createBackNavigation(target)
    const close = vi.fn()
    navigation.register(close)
    const touch = (type, points, ignored) => {
      const event = new Event(type)
      Object.assign(event, { touches: points, changedTouches: points })
      Object.defineProperty(event, 'target', { value: { closest: (selector) => ignored && selector.includes(ignored) } })
      target.document.dispatchEvent(event)
    }
    for (const map of ['.tencent-campus-map', '.campus-2d-viewer', '.campus-3d-viewer']) {
      touch('touchstart', [{ clientX: 10, clientY: 300 }], map)
      touch('touchend', [{ clientX: 110, clientY: 300 }], false)
    }
    touch('touchstart', [{ clientX: 10, clientY: 300 }, { clientX: 20, clientY: 320 }], false)
    touch('touchend', [{ clientX: 110, clientY: 300 }], false)
    expect(close).not.toHaveBeenCalled()
  })
})
