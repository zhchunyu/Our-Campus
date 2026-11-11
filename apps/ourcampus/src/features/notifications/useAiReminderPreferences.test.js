import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const hooks = vi.hoisted(() => ({ values: [], index: 0, effects: [] }))
const data = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn() }))
vi.mock('react', () => ({
  useState: (initial) => {
    const i = hooks.index++; const slot = hooks.values[i] ??= { value: typeof initial === 'function' ? initial() : initial }
    return [slot.value, (next) => { slot.value = typeof next === 'function' ? next(slot.value) : next }]
  },
  useRef: (current) => hooks.values[hooks.index++] ??= { current },
  useCallback: (callback, deps) => {
    const i = hooks.index++; const previous = hooks.values[i]
    if (!previous || deps.some((value, n) => value !== previous.deps[n])) hooks.values[i] = { callback, deps }
    return hooks.values[i].callback
  },
  useEffect: (effect, deps) => {
    const i = hooks.index++; const previous = hooks.values[i]
    if (!previous || deps.some((value, n) => value !== previous.deps[n])) hooks.effects.push(() => {
      previous?.cleanup?.(); hooks.values[i] = { deps, cleanup: effect() }
    })
  },
}))
vi.mock('../../data/aiReminderPreferences.js', () => ({
  DEFAULT_AI_REMINDER_PREFERENCES: { enabled: false, use_favorites: true, match_lost: true, interest_keywords: [] },
  readAiReminderPreferences: data.read, saveAiReminderPreferences: data.save,
}))
import { useAiReminderPreferences } from './useAiReminderPreferences.js'
const userA = '11111111-1111-4111-8111-111111111111'
const userB = '22222222-2222-4222-8222-222222222222'
const defaults = { enabled: false, use_favorites: true, match_lost: true, interest_keywords: [] }
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done }); return { promise, resolve } }
function render(userId = userA) {
  hooks.index = 0
  const value = useAiReminderPreferences(userId)
  hooks.effects.splice(0).forEach((effect) => effect())
  return value
}
function cleanup() { hooks.values.forEach((slot) => slot.cleanup?.()) }
beforeEach(() => {
  hooks.values = []; hooks.index = 0; hooks.effects = []
  data.read.mockReset().mockResolvedValue(defaults)
  data.save.mockReset().mockResolvedValue({ ...defaults, enabled: true })
})
afterEach(cleanup)
describe('AI reminder setting ownership and synchronization', () => {
  it('does not read guest preferences and stays disabled until explicit consent is saved', async () => {
    expect(render(null).value.enabled).toBe(false)
    await settle()
    expect(data.read).not.toHaveBeenCalled()
    render(); await settle()
    expect(render()).toMatchObject({ status: 'ready', value: defaults })
  })
  it('does not let a late old-account read enable reminders for the new account', async () => {
    const oldRead = deferred(); data.read.mockReturnValueOnce(oldRead.promise)
    render()
    expect(render(userB)).toMatchObject({ status: 'loading', value: defaults })
    await settle()
    oldRead.resolve({ ...defaults, enabled: true, interest_keywords: ['阅读'] }); await settle()
    expect(render(userB)).toMatchObject({ status: 'ready', value: defaults })
  })
  it('rejects a save callback from a previous account before any write', async () => {
    render(); await settle(); const old = render()
    render(userB)
    await expect(old.save({ enabled: true })).rejects.toMatchObject({ name: 'AbortError' })
    expect(data.save).not.toHaveBeenCalled()
  })
  it('keeps a previous login callback invalid after switching away and back', async () => {
    render(); await settle(); const old = render()
    render(userB); await settle(); render(userA); await settle()
    await expect(old.save({ enabled: true })).rejects.toMatchObject({ name: 'AbortError' })
    expect(data.save).not.toHaveBeenCalled()
  })
  it('serializes explicit patches and prevents an older refresh from undoing a saved switch', async () => {
    render(); await settle()
    const oldRead = deferred(); data.read.mockReturnValueOnce(oldRead.promise)
    const refresh = render().refresh()
    const saved = render().save({ enabled: true }); await saved
    oldRead.resolve(defaults); await refresh; await settle()
    expect(render().value.enabled).toBe(true)
    expect(data.save).toHaveBeenCalledWith(userA, { enabled: true })
  })
  it('keeps the confirmed value after a failed save and reports an unavailable backend on read', async () => {
    render(); await settle()
    data.save.mockRejectedValueOnce(new Error('保存失败'))
    await expect(render().save({ enabled: true })).rejects.toThrow('保存失败')
    expect(render().value.enabled).toBe(false)
    data.read.mockRejectedValueOnce(new Error('相关聊天提醒服务尚未升级，请稍后再试。'))
    await render().refresh()
    expect(render()).toMatchObject({ status: 'unavailable', value: defaults })
  })
  it('ignores a late read after unmount', async () => {
    const pending = deferred(); data.read.mockReturnValueOnce(pending.promise)
    render(); cleanup()
    const state = hooks.values[0].value
    pending.resolve({ ...defaults, enabled: true }); await settle()
    expect(hooks.values[0].value).toBe(state)
  })
})
