import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchLatestAppRelease, getCurrentAppInfo, isAndroidApp, openAppUpdateDownload } from '../../data/appUpdates.js'

const DISMISS_KEY = 'ourcampus.app-update.dismissal.v1'
const DISMISS_MS = 24 * 60 * 60 * 1000

function isDismissed(versionCode) {
  try {
    const saved = JSON.parse(localStorage.getItem(DISMISS_KEY) ?? 'null')
    const now = Date.now()
    return saved?.versionCode === versionCode && Number.isFinite(saved.until) && saved.until > now && saved.until <= now + DISMISS_MS
  } catch {
    return false
  }
}

export function useAppUpdates() {
  const supported = isAndroidApp()
  const [state, setState] = useState({ current: null, release: null, status: 'idle', error: '', noticeVisible: false, busy: false })
  const lifecycle = useRef({ mounted: false, sequence: 0, controller: null, busy: false, current: null, release: null })

  const runCheck = useCallback(async (manual) => {
    const life = lifecycle.current
    if (!supported || !life.mounted || life.busy) return
    life.busy = true
    const sequence = ++life.sequence
    const controller = new AbortController()
    life.controller = controller
    const active = () => life.mounted && life.sequence === sequence && !controller.signal.aborted
    setState((previous) => ({ ...previous, status: 'checking', error: '', busy: true }))
    try {
      const current = life.current ?? await getCurrentAppInfo({ signal: controller.signal })
      if (!active()) return
      if (!current) throw new Error('无法读取本机版本信息')
      life.current = current
      setState((previous) => ({ ...previous, current }))
      if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('offline')
      const latest = await fetchLatestAppRelease({ signal: controller.signal })
      if (!active()) return
      const release = latest && latest.versionCode > current.versionCode ? latest : null
      life.release = release
      setState((previous) => ({
        ...previous,
        release,
        status: release ? 'available' : 'current',
        error: '',
        noticeVisible: Boolean(release && (manual || !isDismissed(release.versionCode))),
      }))
    } catch (error) {
      if (!active()) return
      life.release = null
      setState((previous) => ({
        ...previous,
        release: null,
        noticeVisible: false,
        status: manual ? 'error' : 'idle',
        error: manual ? (error?.name === 'TimeoutError' ? '检查更新超时，请重试' : '检查更新失败，请检查网络后重试') : '',
      }))
    } finally {
      if (active()) {
        life.busy = false
        life.controller = null
        setState((previous) => ({ ...previous, busy: false }))
      }
    }
  }, [supported])

  useEffect(() => {
    const life = lifecycle.current
    life.mounted = true
    if (supported) void runCheck(false)
    return () => {
      life.mounted = false
      life.sequence++
      life.busy = false
      life.controller?.abort()
      life.controller = null
    }
  }, [runCheck, supported])

  const checkNow = useCallback(() => runCheck(true), [runCheck])
  const dismiss = useCallback(() => {
    const life = lifecycle.current
    if (!life.mounted || !life.release) return
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify({ versionCode: life.release.versionCode, until: Date.now() + DISMISS_MS }))
    } catch {
      // Reminder preferences are optional when local storage is unavailable.
    }
    setState((previous) => ({ ...previous, noticeVisible: false }))
  }, [])

  const download = useCallback(async () => {
    const life = lifecycle.current
    if (!supported || !life.mounted || life.busy || !life.release) return
    const release = life.release
    const sequence = ++life.sequence
    const active = () => life.mounted && life.sequence === sequence
    life.busy = true
    setState((previous) => ({ ...previous, busy: true, error: '' }))
    try {
      await openAppUpdateDownload(release.downloadUrl)
    } catch {
      if (active()) setState((previous) => ({ ...previous, error: '无法打开更新下载，请重试' }))
    } finally {
      if (active()) {
        life.busy = false
        setState((previous) => ({ ...previous, busy: false }))
      }
    }
  }, [supported])

  return { supported, ...state, checkNow, dismiss, download }
}
