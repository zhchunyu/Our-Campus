import { useEffect, useState } from 'react'
import { Maximize2, Smartphone, X } from 'lucide-react'

function readViewportState() {
  if (typeof window === 'undefined') {
    return { isPhone: false, isPortrait: false, isFullscreen: false }
  }

  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false
  const hasTouch = coarsePointer || (navigator.maxTouchPoints ?? 0) > 0

  return {
    isPhone: hasTouch && Math.min(window.innerWidth, window.innerHeight) <= 760,
    isPortrait: window.innerHeight > window.innerWidth,
    isFullscreen: Boolean(document.fullscreenElement),
  }
}

export function MobileLandscapeController() {
  const [viewport, setViewport] = useState(readViewportState)
  const [message, setMessage] = useState('')
  const [allowPortrait, setAllowPortrait] = useState(false)
  const [lockedByApp, setLockedByApp] = useState(false)

  useEffect(() => {
    const refresh = () => setViewport(readViewportState())
    const orientation = window.screen?.orientation

    window.addEventListener('resize', refresh)
    window.addEventListener('orientationchange', refresh)
    document.addEventListener('fullscreenchange', refresh)
    orientation?.addEventListener?.('change', refresh)

    return () => {
      window.removeEventListener('resize', refresh)
      window.removeEventListener('orientationchange', refresh)
      document.removeEventListener('fullscreenchange', refresh)
      orientation?.removeEventListener?.('change', refresh)
    }
  }, [])

  const enterLandscape = async () => {
    setMessage('正在尝试进入全屏横屏…')

    try {
      const app = document.querySelector('.app-shell')
      if (!document.fullscreenElement && app?.requestFullscreen) {
        await app.requestFullscreen({ navigationUI: 'hide' })
      }
    } catch {
      setMessage('浏览器未开放全屏，请将手机旋转至横屏。')
      setViewport(readViewportState())
      return
    }

    try {
      const orientation = window.screen?.orientation
      if (!orientation?.lock) throw new Error('Screen orientation lock is unavailable')
      await orientation.lock('landscape')
      setLockedByApp(true)
      setMessage('')
    } catch {
      setMessage('浏览器无法自动切换横屏，请将手机旋转至横屏。')
    }

    setViewport(readViewportState())
  }

  const exitLandscape = async () => {
    try {
      window.screen?.orientation?.unlock?.()
    } catch {
      // The browser may not support unlocking orientation.
    }

    try {
      if (document.fullscreenElement) await document.exitFullscreen()
    } catch {
      // Keep the exit control usable if the browser refuses to leave fullscreen.
    }

    setLockedByApp(false)
    setAllowPortrait(true)
    setMessage('')
    setViewport(readViewportState())
  }

  if (!viewport.isPhone) return null

  return (
    <>
      {viewport.isPortrait && !allowPortrait && (
        <div className="mobile-landscape-gate" role="dialog" aria-modal="true" aria-labelledby="landscape-gate-title">
          <div className="mobile-landscape-gate__card">
            <div className="mobile-landscape-gate__icon"><Smartphone size={25} /></div>
            <span className="mobile-landscape-gate__eyebrow">CAMPUS TWIN · MOBILE MAP</span>
            <h2 id="landscape-gate-title">横屏查看校园地图</h2>
            <p aria-live="polite">{message || '横屏可以显示更完整的地图和路线。点击按钮尝试自动切换。'}</p>
            <button type="button" onClick={enterLandscape}>
              <Maximize2 size={17} /> 进入横屏地图
            </button>
            <small>若浏览器不支持自动旋转，请手动将手机横过来</small>
          </div>
        </div>
      )}
      {viewport.isLandscape && (viewport.isFullscreen || lockedByApp) && (
        <button className="mobile-landscape-exit" type="button" onClick={exitLandscape} aria-label="退出横屏全屏">
          <X size={16} /> 退出横屏
        </button>
      )}
    </>
  )
}
