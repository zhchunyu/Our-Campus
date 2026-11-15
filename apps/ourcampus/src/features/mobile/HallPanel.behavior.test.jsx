import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({ hooks: [], index: 0, effects: [], photos: { items: [], busy: false, upload: vi.fn(), reset: vi.fn() } }))
vi.mock('react', async (original) => ({ ...await original(),
  useState: (initial) => {
    const index = harness.index++
    const hook = harness.hooks[index] ??= { value: typeof initial === 'function' ? initial() : initial }
    return [hook.value, (next) => { hook.value = typeof next === 'function' ? next(hook.value) : next }]
  },
  useRef: (initial) => harness.hooks[harness.index++] ??= { current: initial },
  useEffect: (effect, dependencies) => {
    const index = harness.index++
    const previous = harness.hooks[index]
    if (!previous || dependencies.some((value, i) => value !== previous.dependencies[i])) harness.effects.push(() => {
      previous?.cleanup?.()
      harness.hooks[index] = { dependencies, cleanup: effect() }
    })
  },
}))
vi.mock('./usePostImageDraft.js', () => ({ usePostImageDraft: () => harness.photos }))
vi.mock('../../app/useBackLayer.js', () => ({ useBackLayer: () => {}, requestAppBack: vi.fn(() => true) }))
import { requestAppBack } from '../../app/useBackLayer.js'
import { HallPanel } from './HallPanel.jsx'

const noop = () => {}
const defaults = { messages: [], selectedRegionId: 'sports', onRegionChange: vi.fn(), onSendMessage: vi.fn(),
  activeSection: 'chat', onSectionChange: noop, isFullscreen: true, locations: [], hotspots: [], posts: [],
  lostFoundFilter: 'all', auth: { user: { id: 'me' }, status: 'ready' },
  chat: { historyStatus: 'ready', connectionStatus: 'live', hasMore: false }, information: { status: 'ready' }, onOpenLogin: noop }
function elements(tree) {
  if (!tree || typeof tree !== 'object') return []
  if (Array.isArray(tree)) return tree.flatMap(elements)
  return [tree, ...elements(tree.props?.children)]
}
const find = (tree, predicate) => elements(tree).find(predicate)
function render(props = {}, flush = true) {
  harness.index = 0
  const tree = HallPanel({ ...defaults, ...props })
  if (flush) harness.effects.splice(0).forEach((effect) => effect())
  return tree
}
const changeText = (tree, value) => find(tree, (node) => node.props?.id === 'mobile-hall-message').props.onChange({ target: { value } })
const submit = (tree) => find(tree, (node) => node.type === 'form').props.onSubmit({ preventDefault: noop })

beforeEach(() => {
  harness.hooks = []; harness.effects = []; harness.index = 0
  harness.photos.items = []; harness.photos.upload.mockReset().mockResolvedValue([]); harness.photos.reset.mockReset()
  defaults.onSendMessage.mockReset().mockResolvedValue(undefined); defaults.onRegionChange.mockReset(); vi.mocked(requestAppBack).mockClear()
  const window = new EventTarget(); window.innerHeight = 750
  vi.stubGlobal('window', window); vi.stubGlobal('document', new EventTarget())
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1)); vi.stubGlobal('cancelAnimationFrame', noop)
})
afterEach(() => { harness.hooks.forEach((hook) => hook.cleanup?.()); vi.unstubAllGlobals() })

describe('district chat behavior', () => {
  it('sends to the viewed district immediately after changing the reading district', async () => {
    changeText(render(), '体育课在哪里')
    await submit(render({ selectedRegionId: 'teaching' }))
    expect(defaults.onSendMessage).toHaveBeenCalledWith({ content: '体育课在哪里', regionId: 'teaching', imagePaths: [] })
    expect(defaults.onRegionChange).not.toHaveBeenCalled()
  })

  it('requires a choice in All and resets that choice after leaving All', async () => {
    changeText(render({ selectedRegionId: 'all' }), '一起吃饭')
    await submit(render({ selectedRegionId: 'all' }))
    expect(defaults.onSendMessage).not.toHaveBeenCalled()
    const tree = render({ selectedRegionId: 'all' })
    find(tree, (node) => node.type === 'select').props.onChange({ target: { value: 'living' } })
    await submit(render({ selectedRegionId: 'all' }))
    expect(defaults.onSendMessage).toHaveBeenLastCalledWith({ content: '一起吃饭', regionId: 'living', imagePaths: [] })
    render({ selectedRegionId: 'sports' })
    changeText(render({ selectedRegionId: 'all' }), '新的消息')
    defaults.onSendMessage.mockClear()
    await submit(render({ selectedRegionId: 'all' }))
    expect(defaults.onSendMessage).not.toHaveBeenCalled()
  })

  it('preserves the text and photo draft after a failed send', async () => {
    defaults.onSendMessage.mockRejectedValue(new Error('offline'))
    harness.photos.items = [{ id: 'photo' }]; harness.photos.upload.mockResolvedValue(['me/photo.jpg'])
    changeText(render(), '请帮我看看')
    await submit(render())
    const tree = render()
    expect(find(tree, (node) => node.props?.id === 'mobile-hall-message').props.value).toBe('请帮我看看')
    expect(harness.photos.reset).not.toHaveBeenCalled()
    expect(elements(tree).some((node) => node.props?.role === 'alert')).toBe(true)
  })

  it('uses the source-aware close callback before generic navigation', () => {
    const close = vi.fn()
    const tree = render({ onCloseSection: close })
    find(tree, (node) => node.props?.['aria-label'] === '返回上一页').props.onClick()
    expect(close).toHaveBeenCalledOnce()
    expect(requestAppBack).not.toHaveBeenCalled()
  })

  it('scrolls to a loaded original message once, without jumping on new messages', () => {
    const target = { id: 'source', authorId: 'other', author: '同学', regionId: 'sports', content: '原消息' }
    const props = { initialMessageId: 'source', messages: [target] }
    const tree = render(props, false)
    const scrollIntoView = vi.fn(); const scrollTo = vi.fn()
    find(tree, (node) => node.props?.['data-message-id'] === 'source').props.ref({ scrollIntoView })
    find(tree, (node) => node.props?.['aria-label'] === '校园聊天消息').props.ref.current = { scrollHeight: 999, scrollTo }
    harness.effects.splice(0).forEach((effect) => effect())
    expect(scrollIntoView).toHaveBeenCalledOnce()
    expect(scrollTo).not.toHaveBeenCalled()
    render({ ...props, messages: [target, { ...target, id: 'newer' }] })
    expect(scrollIntoView).toHaveBeenCalledOnce()
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('restores the reading position after closing chat and returning from community', () => {
    const props = { messages: [{ id: 'message', authorId: 'other', author: '同学', content: '内容' }] }
    const first = render(props, false)
    const feed = { scrollTop: 210, scrollHeight: 999, clientHeight: 300, scrollTo: vi.fn() }
    const feedNode = find(first, (node) => node.props?.['aria-label'] === '校园聊天消息')
    feedNode.props.ref.current = feed
    harness.effects.splice(0).forEach((effect) => effect())
    feedNode.props.onScroll({ currentTarget: feed })
    render({ ...props, isFullscreen: false })
    const returned = render(props, false)
    const reopenedFeed = { ...feed, scrollTop: 0, scrollTo: vi.fn() }
    find(returned, (node) => node.props?.['aria-label'] === '校园聊天消息').props.ref.current = reopenedFeed
    harness.effects.splice(0).forEach((effect) => effect())
    expect(reopenedFeed.scrollTop).toBe(210)
    expect(reopenedFeed.scrollTo).not.toHaveBeenCalled()
  })

  it('preserves the visible history when an older page is inserted', async () => {
    const old = { id: 'message', authorId: 'other', author: '同学', content: '内容' }
    const loadOlder = vi.fn(async () => {})
    const props = { messages: [old], chat: { ...defaults.chat, hasMore: true, loadOlder } }
    const first = render(props, false)
    const feed = { scrollTop: 25, scrollHeight: 600, clientHeight: 300, scrollTo: vi.fn() }
    find(first, (node) => node.props?.['aria-label'] === '校园聊天消息').props.ref.current = feed
    harness.effects.splice(0).forEach((effect) => effect())
    await find(first, (node) => node.props?.className === 'mobile-chat-load-more').props.onClick()
    feed.scrollHeight = 1000
    render({ ...props, messages: [{ ...old, id: 'older' }, old] })
    expect(feed.scrollTop).toBe(425)
    expect(loadOlder).toHaveBeenCalledOnce()
  })
})
