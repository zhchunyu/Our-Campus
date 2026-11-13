import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CanvasHome } from './CanvasHome.jsx'
import { DEFAULT_PERSONAL_ARTWORK, savePersonalHome } from '../../data/personalHome.js'

const imageA = 'data:image/jpeg;base64,YWJj'
const imageB = 'data:image/png;base64,ZGVm'
const locations = [{ id: 'library', name: '图书馆' }, { id: 'canteen', name: '餐厅' }]
const render = (userId = 'student-a', props = {}) => renderToStaticMarkup(<CanvasHome auth={{ user: userId ? { id: userId } : null }} locations={locations} events={[]} {...props} />)
let values

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-13T04:00:00Z'))
  values = new Map()
  vi.stubGlobal('localStorage', { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) })
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('canvas home account content', () => {
  it('reloads the same account cover and crop when the home tab is mounted again after saving', () => {
    savePersonalHome('student-a', { cover: imageA, coverX: 20, coverY: 30 })
    expect(render()).toContain(`src="${imageA}"`)
    savePersonalHome('student-a', { cover: imageB, coverX: 75, coverY: 10 })
    const returnedHome = render()
    expect(returnedHome).toContain(`src="${imageB}"`)
    expect(returnedHome).toContain('object-position:75% 10%')
    expect(returnedHome).not.toContain(`src="${imageA}"`)
  })

  it('keeps a saved cover and section arrangement separate for the next account and guest', () => {
    savePersonalHome('student-a', { cover: imageA })
    values.set('ourcampus.canvas-order.v1.student-a', JSON.stringify(['places', 'events', 'space']))
    const owner = render('student-a')
    expect(owner.indexOf('canvas-section--places')).toBeLessThan(owner.indexOf('canvas-section--space'))
    for (const nextUser of ['student-b', null]) {
      const html = render(nextUser)
      expect(html).not.toContain(`src="${imageA}"`)
      expect(html).toContain(`src="${DEFAULT_PERSONAL_ARTWORK}"`)
      expect(html.indexOf('canvas-section--space')).toBeLessThan(html.indexOf('canvas-section--places'))
    }
  })

  it('does not offer a map action for a campus announcement with no matching place', () => {
    const base = { status: 'active', startAt: '2026-11-13T03:00:00Z', endAt: '2026-11-14T03:00:00Z', isCloud: true }
    const html = render('student-a', { events: [{ ...base, id: 'notice', title: '全校通知', locationId: null }] })
    expect(html).toContain('全校通知')
    expect(html).not.toContain('canvas-place-link')
    const located = render('student-a', { events: [{ ...base, id: 'event', title: '阅读活动', locationId: 'library' }] })
    expect(located).toContain('canvas-place-link')
    expect(located).toContain('图书馆</button>')
  })
})
