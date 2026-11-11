import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const hooks = vi.hoisted(() => ({ slots: [], cursor: 0, pending: [], dirty: false, result: null }))
vi.mock('react', () => ({
  useState(initial) {
    const index = hooks.cursor++
    if (!hooks.slots[index]) hooks.slots[index] = { value: typeof initial === 'function' ? initial() : initial }
    return [hooks.slots[index].value, (value) => {
      const next = typeof value === 'function' ? value(hooks.slots[index].value) : value
      if (!Object.is(next, hooks.slots[index].value)) { hooks.slots[index].value = next; hooks.dirty = true }
    }]
  },
  useRef(initial) {
    const index = hooks.cursor++
    if (!hooks.slots[index]) hooks.slots[index] = { current: initial }
    return hooks.slots[index]
  },
  useCallback(callback, dependencies) {
    const index = hooks.cursor++
    const previous = hooks.slots[index]
    if (!previous || dependencies.some((value, item) => !Object.is(value, previous.dependencies[item]))) hooks.slots[index] = { callback, dependencies }
    return hooks.slots[index].callback
  },
  useEffect(effect, dependencies) {
    const index = hooks.cursor++
    const previous = hooks.slots[index]
    if (!previous || dependencies.some((value, item) => !Object.is(value, previous.dependencies[item]))) hooks.pending.push(() => { previous?.cleanup?.(); hooks.slots[index] = { dependencies, cleanup: effect() } })
  },
}))
const mocks = vi.hoisted(() => ({ native: true, getCurrentAppInfo: vi.fn(), fetchLatestAppRelease: vi.fn(), openAppUpdateDownload: vi.fn() }))
vi.mock('../../data/appUpdates.js', () => ({ isAndroidApp: () => mocks.native, getCurrentAppInfo: mocks.getCurrentAppInfo, fetchLatestAppRelease: mocks.fetchLatestAppRelease, openAppUpdateDownload: mocks.openAppUpdateDownload }))
const { useAppUpdates } = await import('./useAppUpdates.js')
const current = { packageId: 'cn.edu.sxau.campustwin', versionCode: 117, versionName: '1.17', platform: 'android' }
const release = { versionCode: 118, versionName: '1.18', notes: ['头像同步修复'], downloadUrl: 'https://campus.supabase.co/storage/v1/object/public/app-releases/android/a.apk', sha256: 'a'.repeat(64), sizeBytes: 100, publishedAt: '2026-10-22T07:00:00Z' }
let values
function render() {
  hooks.cursor = 0; hooks.dirty = false
  hooks.result = useAppUpdates()
  hooks.pending.splice(0).forEach((effect) => effect())
  return hooks.result
}
async function flush() {
  for (let turn = 0; turn < 18; turn++) { await Promise.resolve(); if (hooks.dirty) render() }
  return hooks.result
}
async function mount() { render(); return flush() }
function unmount() { for (const slot of hooks.slots) slot?.cleanup?.(); Object.assign(hooks, { slots: [], cursor: 0, pending: [], dirty: false, result: null }) }
function deferred() { let resolve; const promise = new Promise((done) => { resolve = done }); return { promise, resolve } }
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-22T08:00:00Z'))
  values = new Map()
  vi.stubGlobal('localStorage', { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) })
  vi.stubGlobal('navigator', { onLine: true })
  mocks.native = true
  mocks.getCurrentAppInfo.mockReset().mockResolvedValue(current)
  mocks.fetchLatestAppRelease.mockReset().mockResolvedValue(release)
  mocks.openAppUpdateDownload.mockReset().mockResolvedValue(undefined)
})
afterEach(() => { unmount(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe('app update lifecycle', () => {
  it('does not query releases or the native bridge on the web', async () => {
    mocks.native = false
    const result = await mount()
    expect(result).toMatchObject({ supported: false, status: 'idle', noticeVisible: false, busy: false })
    await result.checkNow(); await result.download()
    expect(mocks.getCurrentAppInfo).not.toHaveBeenCalled()
    expect(mocks.fetchLatestAppRelease).not.toHaveBeenCalled()
    expect(mocks.openAppUpdateDownload).not.toHaveBeenCalled()
  })
  it('checks once on native startup and waits for a user click to open the download', async () => {
    await mount()
    expect(hooks.result).toMatchObject({ supported: true, current, release, status: 'available', noticeVisible: true, busy: false })
    render(); await flush()
    expect(mocks.fetchLatestAppRelease).toHaveBeenCalledTimes(1)
    expect(mocks.openAppUpdateDownload).not.toHaveBeenCalled()
    await hooks.result.download(); await flush()
    expect(mocks.openAppUpdateDownload).toHaveBeenCalledWith(release.downloadUrl)
  })
  it.each([null, { ...release, versionCode: 117 }, { ...release, versionCode: 116 }])('does not advertise an equal or older release: %o', async (candidate) => {
    mocks.fetchLatestAppRelease.mockResolvedValue(candidate)
    await mount()
    expect(hooks.result).toMatchObject({ status: 'current', release: null, noticeVisible: false })
    await hooks.result.download()
    expect(mocks.openAppUpdateDownload).not.toHaveBeenCalled()
  })
  it('suppresses the same dismissed version for 24 hours and then reminds again', async () => {
    await mount(); hooks.result.dismiss(); await flush()
    expect(hooks.result.noticeVisible).toBe(false)
    expect(values.size).toBe(1)
    unmount(); await mount()
    expect(hooks.result).toMatchObject({ status: 'available', noticeVisible: false })
    vi.advanceTimersByTime(24 * 60 * 60 * 1000)
    unmount(); await mount()
    expect(hooks.result.noticeVisible).toBe(true)
  })
  it('shows a later version even while the previous version is dismissed', async () => {
    await mount(); hooks.result.dismiss(); await flush(); unmount()
    mocks.fetchLatestAppRelease.mockResolvedValue({ ...release, versionCode: 119, versionName: '1.19' })
    await mount()
    expect(hooks.result.noticeVisible).toBe(true)
  })
  it('allows a manual check to override the dismissal', async () => {
    await mount(); hooks.result.dismiss(); await flush()
    await hooks.result.checkNow(); await flush()
    expect(hooks.result).toMatchObject({ status: 'available', noticeVisible: true })
  })
  it('keeps automatic failures quiet and allows a failed manual check to retry', async () => {
    mocks.fetchLatestAppRelease.mockRejectedValue(new Error('private network detail'))
    await mount()
    expect(hooks.result).toMatchObject({ status: 'idle', error: '', noticeVisible: false, busy: false })
    await hooks.result.checkNow(); await flush()
    expect(hooks.result.status).toBe('error')
    expect(hooks.result.error).toContain('重试')
    expect(hooks.result.error).not.toContain('private network detail')
    mocks.fetchLatestAppRelease.mockResolvedValue(release)
    await hooks.result.checkNow(); await flush()
    expect(hooks.result).toMatchObject({ status: 'available', error: '', busy: false })
  })
  it('keeps an offline launch usable and checks when the user retries online', async () => {
    navigator.onLine = false
    await mount()
    expect(hooks.result).toMatchObject({ status: 'idle', error: '', noticeVisible: false })
    expect(mocks.fetchLatestAppRelease).not.toHaveBeenCalled()
    navigator.onLine = true
    await hooks.result.checkNow(); await flush()
    expect(hooks.result.status).toBe('available')
  })
  it('does not start duplicate requests during a pending check', async () => {
    const waiting = deferred()
    mocks.fetchLatestAppRelease.mockReturnValue(waiting.promise)
    await mount()
    expect(hooks.result).toMatchObject({ status: 'checking', busy: true })
    void hooks.result.checkNow(); void hooks.result.checkNow()
    expect(mocks.fetchLatestAppRelease).toHaveBeenCalledTimes(1)
    waiting.resolve(release); await flush()
    expect(hooks.result.busy).toBe(false)
  })
  it('aborts on unmount and ignores a late release response', async () => {
    const waiting = deferred()
    mocks.fetchLatestAppRelease.mockReturnValue(waiting.promise)
    await mount()
    const signal = mocks.fetchLatestAppRelease.mock.calls[0][0].signal
    unmount(); waiting.resolve(release); await flush()
    expect(signal.aborted).toBe(true)
    expect(hooks.dirty).toBe(false)
  })
  it('does not query releases after late version info from an unmounted view', async () => {
    const waiting = deferred()
    mocks.getCurrentAppInfo.mockReturnValue(waiting.promise)
    await mount(); unmount(); waiting.resolve(current); await flush()
    expect(mocks.fetchLatestAppRelease).not.toHaveBeenCalled()
    expect(hooks.dirty).toBe(false)
  })
  it('recovers when the installed version could not be read at startup', async () => {
    mocks.getCurrentAppInfo.mockRejectedValueOnce(new Error('bridge unavailable'))
    await mount()
    expect(hooks.result.status).toBe('idle')
    await hooks.result.checkNow(); await flush()
    expect(hooks.result.status).toBe('available')
  })
  it('allows download retry after the system browser fails to open', async () => {
    await mount()
    mocks.openAppUpdateDownload.mockRejectedValueOnce(new Error('activity missing'))
    await hooks.result.download(); await flush()
    expect(hooks.result).toMatchObject({ status: 'available', release, busy: false, noticeVisible: true })
    expect(hooks.result.error).toContain('重试')
    await hooks.result.download(); await flush()
    expect(hooks.result.error).toBe('')
    expect(mocks.openAppUpdateDownload).toHaveBeenCalledTimes(2)
  })
  it('ignores corrupted or unavailable local reminder storage', async () => {
    vi.stubGlobal('localStorage', { getItem: () => '{broken', setItem: () => { throw new Error('quota') } })
    await mount()
    expect(hooks.result.noticeVisible).toBe(true)
    expect(() => hooks.result.dismiss()).not.toThrow()
    await flush()
    expect(hooks.result.noticeVisible).toBe(false)
  })
})
