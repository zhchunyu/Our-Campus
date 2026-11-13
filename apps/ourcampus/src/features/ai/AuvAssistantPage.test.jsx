import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const hooks = vi.hoisted(() => ({ slots: [], cursor: 0, pending: [], dirty: false, result: null }))
vi.mock('react', () => ({
  useState(initial) { const i = hooks.cursor++; if (!hooks.slots[i]) hooks.slots[i] = { value: typeof initial === 'function' ? initial() : initial }; return [hooks.slots[i].value, (value) => { const next = typeof value === 'function' ? value(hooks.slots[i].value) : value; if (!Object.is(next, hooks.slots[i].value)) { hooks.slots[i].value = next; hooks.dirty = true } }] },
  useRef(initial) { const i = hooks.cursor++; if (!hooks.slots[i]) hooks.slots[i] = { current: initial }; return hooks.slots[i] },
  useEffect(effect, dependencies) { const i = hooks.cursor++; const old = hooks.slots[i]; if (!old || dependencies.some((value, j) => !Object.is(value, old.dependencies[j]))) hooks.pending.push(() => { old?.cleanup?.(); hooks.slots[i] = { dependencies, cleanup: effect() } }) },
}))
const mocks = vi.hoisted(() => ({ requestAuv: vi.fn() }))
vi.mock('../../data/auvClient.js', () => ({ requestAuv: mocks.requestAuv }))
vi.mock('react-dom', () => ({ createPortal: (node) => node }))
vi.mock('../../app/useBackLayer.js', () => ({ useBackLayer: () => {} }))
const { AuvAssistantPage } = await import('./AuvAssistantPage.jsx')
let props
function elements(node, type) { if (!node || typeof node !== 'object') return []; const children = Array.isArray(node) ? node : node.props?.children; return [...(node.type === type ? [node] : []), ...(Array.isArray(children) ? children.flatMap((child) => elements(child, type)) : elements(children, type))] }
function render(patch = {}) { props = { ...props, ...patch }; for (let turn = 0; turn < 20; turn++) { hooks.cursor = 0; hooks.dirty = false; hooks.result = AuvAssistantPage(props); hooks.pending.splice(0).forEach((effect) => effect()); if (!hooks.dirty) return hooks.result } throw new Error('AUV page did not settle') }
async function send(text) { elements(hooks.result, 'textarea')[0].props.onChange({ target: { value: text } }); render(); await elements(hooks.result, 'form')[0].props.onSubmit({ preventDefault() {} }); render() }
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-10T08:00:00.000Z'))
  vi.stubGlobal('document', { body: { style: {} }, activeElement: null })
  vi.stubGlobal('window', new EventTarget())
  mocks.requestAuv.mockReset().mockResolvedValue({ kind: 'answer', text: '测试回答', generated_by: 'auv', locations: [] })
  props = { auth: { user: { id: 'member-a' }, status: 'ready' }, locations: [{ id: 'library', name: '图书馆' }, { id: 'east-gate', name: '东门' }], initialLocationId: 'library', getContext: vi.fn(() => ({ capturedAt: new Date().toISOString(), locationSource: 'unknown' })), onClose: vi.fn(), onOpenLogin: vi.fn(), onSelectLocation: vi.fn(), onPlanRouteToLocation: vi.fn() }
})
afterEach(() => { for (const slot of hooks.slots) slot?.cleanup?.(); Object.assign(hooks, { slots: [], cursor: 0, pending: [], dirty: false, result: null }); vi.unstubAllGlobals(); vi.useRealTimers() })
describe('AUV app state handoff', () => {
  it('uses the viewed catalog place only as the associated query target', async () => {
    render()
    expect(elements(hooks.result, 'select')[0].props.value).toBe('library')
    await send('这里有什么')
    expect(mocks.requestAuv.mock.calls[0][0]).toMatchObject({ locationId: 'library', expectedUserId: 'member-a', context: { locationSource: 'unknown' } })
    expect(mocks.requestAuv.mock.calls[0][0].context).not.toHaveProperty('currentLocationId')
  })
  it('takes a fresh snapshot for each send without treating a manually associated target as position', async () => {
    render()
    expect(props.getContext).not.toHaveBeenCalled()
    await send('我的下一节课')
    vi.advanceTimersByTime(60000)
    elements(hooks.result, 'select')[0].props.onChange({ target: { value: 'east-gate' } }); render()
    await send('再看看')
    expect(props.getContext).toHaveBeenCalledTimes(2)
    expect(mocks.requestAuv.mock.calls[1][0]).toMatchObject({ locationId: 'east-gate', context: { capturedAt: '2026-11-10T08:01:00.000Z', locationSource: 'unknown' } })
    expect(mocks.requestAuv.mock.calls[0][0].context.capturedAt).toBe('2026-11-10T08:00:00.000Z')
  })
  it('uses the new account factory and clears old conversation history after account switching', async () => {
    render(); await send('旧账号的问题')
    const getContext = vi.fn(() => ({ capturedAt: new Date().toISOString(), locationSource: 'unknown', favoriteIds: [] }))
    render({ auth: { user: { id: 'member-b' }, status: 'ready' }, getContext })
    await send('新账号的问题')
    const sent = mocks.requestAuv.mock.calls[1][0]
    expect(sent.expectedUserId).toBe('member-b')
    expect(sent.history).toEqual([])
    expect(sent.context.favoriteIds).toEqual([])
    expect(getContext).toHaveBeenCalledTimes(1)
  })
})

it('does not label an ordinary prefilled place question as timetable planning', () => {
  render({ initialDraft: '我想了解图书馆，请说明信息缺口。' })
  expect(elements(hooks.result, 'h2')[0].props.children).toBe('校园信息查询')
})
it('labels only the explicit timetable entry as planning and keeps the question short', () => {
  render({ initialPurpose: 'timetable', initialDraft: '请根据我的课表规划第11教学周。' })
  expect(elements(hooks.result, 'h2')[0].props.children).toBe('课表规划')
  expect(elements(hooks.result, 'textarea')[0].props.value).toBe('请根据我的课表规划第11教学周。')
})
it('keeps the question draft after a failed request', async () => {
  mocks.requestAuv.mockRejectedValue(new Error('暂时连不上 AI 服务'))
  render(); await send('不要丢失这条问题')
  expect(elements(hooks.result, 'textarea')[0].props.value).toBe('不要丢失这条问题')
})
it('shows the assistant author for an authenticated greeting rule reply', async () => {
  mocks.requestAuv.mockResolvedValue({ kind: 'answer', text: '你好', generated_by: 'greeting_rule', locations: [] })
  render(); await send('你好')
  const authors = elements(hooks.result, 'span').filter((node) => node.props.className === 'auv-message__author').map((node) => node.props.children)
  expect(authors).toEqual(['我', 'AUV'])
})

it('keeps the AUV author label for existing event extraction replies', async () => {
  mocks.requestAuv.mockResolvedValue({ kind: 'event', text: '事件分析草稿', generated_by: 'auv', locations: [] })
  render(); await send('图书馆施工')
  const authors = elements(hooks.result, 'span').filter((node) => node.props.className === 'auv-message__author').map((node) => node.props.children)
  expect(authors).toEqual(['我', 'AUV'])
})

it('builds example prompts from current place names by stable id in both modes', () => {
  const locations = [{ id: 'library', name: '亭兰图书馆' }, { id: 'canteen', name: '谷园餐厅' }, { id: 'teaching-a', name: '崇学楼' }, { id: 'apartment-9', name: '9号公寓楼' }]
  const promptTexts = () => elements(hooks.result, 'button').flatMap((button) => Array.isArray(button.props.children) ? button.props.children.filter((child) => typeof child === 'string') : [])
  render({ locations })
  expect(promptTexts()).toContain('查询亭兰图书馆开放时间')
  expect(promptTexts()).toContain('查看谷园餐厅服务信息')
  elements(hooks.result, 'button').find((button) => button.props.children === '事件分析').props.onClick(); render()
  expect(promptTexts()).toEqual(expect.arrayContaining(['谷园餐厅现在排队很久', '崇学楼门前正在施工', '9号公寓楼下路灯坏了']))
  render({ locations: locations.map((place) => place.id === 'canteen' ? { ...place, name: '当前餐厅名称' } : place) })
  expect(promptTexts()).toContain('当前餐厅名称现在排队很久')
  expect(promptTexts().join('')).not.toContain('禾香')
})
