import { Capacitor, registerPlugin } from '@capacitor/core'
import { normalizeSupabaseUrl, supabase } from './supabaseClient.js'

export const APP_UPDATE_PACKAGE_ID = 'cn.edu.sxau.campustwin'
export const APP_UPDATE_CHECK_TIMEOUT = 8000
const MAX_APK_BYTES = 200 * 1024 * 1024
const RELEASE_COLUMNS = 'platform,channel,package_id,version_code,version_name,release_notes,download_url,apk_sha256,apk_size_bytes,published_at,status'
const configuredOrigin = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL)
const CampusUpdates = registerPlugin('CampusUpdates')

export const isAndroidApp = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'

function requestError(message, name = 'Error') {
  return Object.assign(new Error(message), { name })
}

// Settle even if a bridge or transport does not honor cancellation.
function boundedRequest(run, { signal, timeoutMs = APP_UPDATE_CHECK_TIMEOUT } = {}) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController()
    let settled = false
    let timer
    const finish = (callback, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      callback(value)
    }
    const onAbort = () => {
      controller.abort()
      finish(reject, requestError('检查已取消', 'AbortError'))
    }
    timer = setTimeout(() => {
      controller.abort()
      finish(reject, requestError('检查更新超时，请重试', 'TimeoutError'))
    }, timeoutMs)
    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) { onAbort(); return }
    Promise.resolve().then(() => settled ? undefined : run(controller.signal)).then(
      (value) => finish(resolve, value),
      (error) => finish(reject, error),
    )
  })
}

function validVersionCode(value) {
  return Number.isSafeInteger(value) && value > 0 && value <= 2100000000
}

function downloadUrl(value, origin) {
  if (typeof value !== 'string' || !origin || value.includes('..')) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password || url.search || url.hash || url.href !== value) return null
    if (!/^\/storage\/v1\/object\/public\/app-releases\/android\/[A-Za-z0-9._-]+\.apk$/.test(url.pathname)) return null
    return url.href
  } catch {
    return null
  }
}

export function normalizeAppRelease(row, { origin = configuredOrigin, now = Date.now() } = {}) {
  if (!row || row.platform !== 'android' || row.channel !== 'stable' || row.package_id !== APP_UPDATE_PACKAGE_ID || row.status !== 'published') return null
  if (!validVersionCode(row.version_code) || typeof row.version_name !== 'string' || !row.version_name.trim() || row.version_name.trim().length > 40) return null
  if (!Array.isArray(row.release_notes) || row.release_notes.length > 12 || row.release_notes.some((note) => typeof note !== 'string' || note.length > 500) || row.release_notes.join('').length > 4000) return null
  if (!Number.isSafeInteger(row.apk_size_bytes) || row.apk_size_bytes <= 0 || row.apk_size_bytes > MAX_APK_BYTES || typeof row.apk_sha256 !== 'string' || !/^[a-fA-F0-9]{64}$/.test(row.apk_sha256)) return null
  const published = typeof row.published_at === 'string' ? Date.parse(row.published_at) : NaN
  const url = downloadUrl(row.download_url, origin)
  if (!url || !Number.isFinite(published) || published > now) return null
  return {
    versionCode: row.version_code,
    versionName: row.version_name.trim(),
    notes: row.release_notes.map((note) => note.trim()).filter(Boolean),
    downloadUrl: url,
    sha256: row.apk_sha256.toLowerCase(),
    sizeBytes: row.apk_size_bytes,
    publishedAt: row.published_at,
  }
}

export async function fetchLatestAppRelease({ client = supabase, origin = configuredOrigin, now = Date.now(), signal, timeoutMs } = {}) {
  if (!client || !origin) throw requestError('更新服务尚未配置')
  const result = await boundedRequest((requestSignal) => client.from('app_releases')
    .select(RELEASE_COLUMNS)
    .eq('platform', 'android')
    .eq('channel', 'stable')
    .eq('package_id', APP_UPDATE_PACKAGE_ID)
    .eq('status', 'published')
    .lte('published_at', new Date(now).toISOString())
    .order('version_code', { ascending: false })
    .limit(1)
    .abortSignal(requestSignal)
    .maybeSingle(), { signal, timeoutMs })
  if (result.error) throw requestError('检查更新失败，请稍后重试')
  if (!result.data) return null
  const release = normalizeAppRelease(result.data, { origin, now })
  if (!release) throw requestError('版本信息无效，请稍后重试')
  return release
}

export async function getCurrentAppInfo({ signal, timeoutMs } = {}) {
  if (!isAndroidApp()) return null
  const info = await boundedRequest(() => CampusUpdates.getInfo(), { signal, timeoutMs })
  if (!info || info.packageId !== APP_UPDATE_PACKAGE_ID || info.platform !== 'android' || !validVersionCode(info.versionCode) || typeof info.versionName !== 'string' || !info.versionName.trim() || info.versionName.length > 40) {
    throw requestError('无法读取本机版本信息，请重试')
  }
  return { packageId: info.packageId, versionCode: info.versionCode, versionName: info.versionName, platform: info.platform }
}

export async function openAppUpdateDownload(value, { origin = configuredOrigin } = {}) {
  const url = downloadUrl(value, origin)
  if (!isAndroidApp() || !url) throw requestError('更新下载地址无效，请重新检查更新')
  await CampusUpdates.openDownload({ url })
}
