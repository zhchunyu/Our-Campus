import { describe, expect, it } from 'vitest'
import { acquireInert } from './modalInert.js'

describe('nested modal inert ownership', () => {
  it('keeps the app inert until a child releases after its parent unmounts', () => {
    const root = { inert: false }
    const releaseParent = acquireInert(root)
    const releaseChild = acquireInert(root)
    expect(root.inert).toBe(true)
    releaseParent()
    expect(root.inert).toBe(true)
    releaseChild()
    expect(root.inert).toBe(false)
  })

  it('keeps the app inert when the child closes before its parent', () => {
    const root = { inert: false }
    const releaseParent = acquireInert(root)
    const releaseChild = acquireInert(root)
    releaseChild()
    expect(root.inert).toBe(true)
    releaseParent()
    expect(root.inert).toBe(false)
  })

  it('preserves a preexisting inert value after the last release', () => {
    const root = { inert: true }
    const release = acquireInert(root)
    release()
    expect(root.inert).toBe(true)
  })

  it('does not release another modal when cleanup is repeated', () => {
    const root = { inert: false }
    const releaseParent = acquireInert(root)
    const releaseChild = acquireInert(root)
    releaseParent()
    releaseParent()
    expect(root.inert).toBe(true)
    releaseChild()
    expect(root.inert).toBe(false)
    releaseChild()
    const releaseNext = acquireInert(root)
    releaseChild()
    expect(root.inert).toBe(true)
    releaseNext()
    expect(root.inert).toBe(false)
  })
})
