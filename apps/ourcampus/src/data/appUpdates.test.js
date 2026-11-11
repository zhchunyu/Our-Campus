import { afterEach, describe, expect, it, vi } from 'vitest'
import { APP_UPDATE_CHECK_TIMEOUT, APP_UPDATE_PACKAGE_ID, fetchLatestAppRelease, getCurrentAppInfo, isAndroidApp, normalizeAppRelease, openAppUpdateDownload } from './appUpdates.js'

const bridge = vi.hoisted(() => ({ native: true, platform: 'android', getInfo: vi.fn(), openDownload: vi.fn() }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => bridge.native, getPlatform: () => bridge.platform }, registerPlugin: () => bridge }))
const origin = 'https://campus.supabase.co'
const now = Date.parse('2026-10-22T08:00:00Z')
const row = (patch = {}) => ({ platform: 'android', channel: 'stable', package_id: 'cn.edu.sxau.campustwin', version_code: 118, version_name: '1.18', release_notes: ['头像同步修复'], download_url: `${origin}/storage/v1/object/public/app-releases/android/ourcampus-118.apk`, apk_sha256: 'a'.repeat(64), apk_size_bytes: 45 * 1024 * 1024, published_at: '2026-10-22T07:00:00Z', status: 'published', ...patch })
function clientFor(result) {
  const query = Object.fromEntries(['select', 'eq', 'lte', 'order', 'limit', 'abortSignal'].map((key) => [key, vi.fn(() => query)]))
  query.maybeSingle = vi.fn(() => result)
  return { client: { from: vi.fn(() => query) }, query }
}
afterEach(() => { bridge.native = true; bridge.platform = 'android'; vi.clearAllMocks(); vi.useRealTimers() })

describe('published Android app releases', () => {
  it('normalizes a release from the configured public APK bucket', () => {
    expect(normalizeAppRelease(row(), { origin, now })).toEqual({ versionCode: 118, versionName: '1.18', notes: ['头像同步修复'], downloadUrl: row().download_url, sha256: 'a'.repeat(64), sizeBytes: 45 * 1024 * 1024, publishedAt: row().published_at })
  })
  it.each([
    { version_code: 118.2 }, { version_code: '118' }, { version_code: -1 }, { version_code: 2100000001 }, { version_code: Number.MAX_SAFE_INTEGER + 1 },
    { version_name: '' }, { version_name: 'x'.repeat(41) }, { release_notes: '修复' }, { release_notes: Array(13).fill('说明') }, { release_notes: ['x'.repeat(501)] }, { release_notes: [null] }, { release_notes: Array(9).fill('x'.repeat(500)) },
    { apk_sha256: 'invalid' }, { apk_sha256: ['a'.repeat(64)] }, { apk_size_bytes: 0 }, { apk_size_bytes: 200 * 1024 * 1024 + 1 }, { apk_size_bytes: 1.5 },
    { platform: 'ios' }, { channel: 'beta' }, { package_id: 'another.app' }, { status: 'draft' }, { published_at: '2026-10-23T00:00:00Z' }, { published_at: 'invalid' },
  ])('rejects malformed or ineligible metadata: %o', (patch) => {
    expect(normalizeAppRelease(row(patch), { origin, now })).toBeNull()
  })
  it.each([
    'http://campus.supabase.co/storage/v1/object/public/app-releases/android/a.apk',
    'https://other.supabase.co/storage/v1/object/public/app-releases/android/a.apk',
    'https://campus.supabase.co.evil.test/storage/v1/object/public/app-releases/android/a.apk',
    `${origin}/storage/v1/object/public/avatars/android/a.apk`,
    `${origin}/storage/v1/object/public/app-releases/android/../android/a.apk`,
    `${origin}/storage/v1/object/public/app-releases/android/a..apk`,
    `${origin}/storage/v1/object/public/app-releases/android/%61.apk`,
    `${origin}/storage/v1/object/public/app-releases/android/a.apk?token=x`,
    `${origin}/storage/v1/object/public/app-releases/android/a.apk#x`,
    'https://user:pass@campus.supabase.co/storage/v1/object/public/app-releases/android/a.apk',
    `${origin}/storage/v1/object/public/app-releases/android/sub/a.apk`,
  ])('rejects unsafe APK URL %s', (download_url) => {
    expect(normalizeAppRelease(row({ download_url }), { origin, now })).toBeNull()
  })
  it('selects only public release metadata and filters the latest published stable package', async () => {
    const { client, query } = clientFor(Promise.resolve({ data: row(), error: null }))
    const result = await fetchLatestAppRelease({ client, origin, now })
    expect(result.versionCode).toBe(118)
    expect(client.from).toHaveBeenCalledWith('app_releases')
    expect(query.select).toHaveBeenCalledWith('platform,channel,package_id,version_code,version_name,release_notes,download_url,apk_sha256,apk_size_bytes,published_at,status')
    expect(query.eq.mock.calls).toEqual([['platform', 'android'], ['channel', 'stable'], ['package_id', APP_UPDATE_PACKAGE_ID], ['status', 'published']])
    expect(query.lte).toHaveBeenCalledWith('published_at', new Date(now).toISOString())
    expect(query.order).toHaveBeenCalledWith('version_code', { ascending: false })
    expect(query.limit).toHaveBeenCalledWith(1)
  })
  it('treats no published release as current and rejects an invalid published release', async () => {
    expect(await fetchLatestAppRelease({ ...clientFor(Promise.resolve({ data: null, error: null })), origin, now })).toBeNull()
    await expect(fetchLatestAppRelease({ ...clientFor(Promise.resolve({ data: row({ apk_sha256: '' }), error: null })), origin, now })).rejects.toThrow('版本信息')
  })
  it('rejects server failures without exposing SQL details', async () => {
    const { client } = clientFor(Promise.resolve({ data: null, error: { message: 'secret query', code: '42P01' } }))
    await expect(fetchLatestAppRelease({ client, origin, now })).rejects.toThrow('检查更新失败')
  })
  it('times out a stalled query and aborts it', async () => {
    vi.useFakeTimers()
    const { client, query } = clientFor(new Promise(() => {}))
    const pending = expect(fetchLatestAppRelease({ client, origin, now })).rejects.toMatchObject({ name: 'TimeoutError' })
    await vi.advanceTimersByTimeAsync(APP_UPDATE_CHECK_TIMEOUT)
    await pending
    expect(query.abortSignal.mock.calls[0][0].aborted).toBe(true)
  })
  it('does not start a query that was already cancelled', async () => {
    const controller = new AbortController(); controller.abort()
    const { client } = clientFor(new Promise(() => {}))
    await expect(fetchLatestAppRelease({ client, origin, now, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(client.from).not.toHaveBeenCalled()
  })
  it('cancels a request even when the underlying query ignores abort', async () => {
    const controller = new AbortController()
    const { client } = clientFor(new Promise(() => {}))
    const pending = fetchLatestAppRelease({ client, origin, now, signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})
describe('native update bridge', () => {
  it('requires native Android before requesting version info', async () => {
    bridge.native = false
    expect(isAndroidApp()).toBe(false)
    expect(await getCurrentAppInfo()).toBeNull()
    expect(bridge.getInfo).not.toHaveBeenCalled()
    bridge.native = true; bridge.platform = 'ios'
    expect(await getCurrentAppInfo()).toBeNull()
  })
  it('reads and validates the actual installed package version', async () => {
    bridge.getInfo.mockResolvedValueOnce({ packageId: APP_UPDATE_PACKAGE_ID, versionCode: 117, versionName: '1.17', platform: 'android' })
    expect(await getCurrentAppInfo()).toMatchObject({ versionCode: 117, versionName: '1.17' })
    bridge.getInfo.mockResolvedValueOnce({ packageId: 'wrong.package', versionCode: 117, versionName: '1.17', platform: 'android' })
    await expect(getCurrentAppInfo()).rejects.toThrow('版本信息')
  })
  it('rejects an installed version beyond the Android release code limit', async () => {
    bridge.getInfo.mockResolvedValueOnce({ packageId: APP_UPDATE_PACKAGE_ID, versionCode: 2100000001, versionName: '1.17', platform: 'android' })
    await expect(getCurrentAppInfo()).rejects.toThrow('版本信息')
  })
  it('times out an unavailable native version bridge', async () => {
    vi.useFakeTimers()
    bridge.getInfo.mockReturnValueOnce(new Promise(() => {}))
    const pending = expect(getCurrentAppInfo()).rejects.toMatchObject({ name: 'TimeoutError' })
    await vi.advanceTimersByTimeAsync(APP_UPDATE_CHECK_TIMEOUT)
    await pending
  })
  it('never opens native downloads from a web preview', async () => {
    bridge.native = false
    await expect(openAppUpdateDownload(row().download_url, { origin })).rejects.toThrow('下载地址')
    expect(bridge.openDownload).not.toHaveBeenCalled()
  })
  it('revalidates download URLs at the user action boundary', async () => {
    await openAppUpdateDownload(row().download_url, { origin })
    expect(bridge.openDownload).toHaveBeenCalledWith({ url: row().download_url })
    await expect(openAppUpdateDownload('https://example.com/app.apk', { origin })).rejects.toThrow('下载地址')
    expect(bridge.openDownload).toHaveBeenCalledTimes(1)
  })
})
