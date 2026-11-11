import { Capacitor, registerPlugin, SystemBars, SystemBarsStyle } from '@capacitor/core'

const CampusAppearance = registerPlugin('CampusAppearance')

const readyParts = new Set()
let checkReady = () => {}

export function markStartupReady(part) {
  readyParts.add(part)
  checkReady()
}

export function startStartup({ previewShell = false } = {}) {
  const overlay = document.getElementById('app-startup')
  if (!overlay) return
  if (previewShell) {
    // The actual app in the phone iframe owns its own startup animation.
    overlay.querySelector('video')?.pause()
    overlay.remove()
    return
  }

  const root = document.getElementById('root')
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const startedAt = performance.getEntriesByName('ourcampus-startup')[0]?.startTime ?? performance.now()
  const elapsed = performance.now() - startedAt
  const minimum = reduceMotion ? 450 : 1400
  let closing = false
  let minimumReached = elapsed >= minimum
  const video = overlay.querySelector('.app-startup__video')
  let mediaComplete = reduceMotion || !video
  const showVideo = () => overlay.classList.add('is-playing')
  const completeVideo = () => {
    mediaComplete = true
    checkReady()
  }
  const useStaticLogo = () => {
    overlay.classList.remove('is-playing')
    overlay.classList.add('is-static')
    video?.pause()
    completeVideo()
  }
  root.inert = true
  root.setAttribute('aria-hidden', 'true')

  const finish = () => {
    if (closing) return
    closing = true
    clearTimeout(minimumTimer)
    clearTimeout(maximumTimer)
    clearTimeout(waitingTimer)
    checkReady = () => {}
    video?.pause()
    video?.removeEventListener('playing', showVideo)
    video?.removeEventListener('ended', completeVideo)
    video?.removeEventListener('error', useStaticLogo)
    // React has already mounted underneath; no second app or map initialization.
    root.inert = false
    root.removeAttribute('aria-hidden')
    overlay.classList.add('is-leaving')
    let removed = false
    const remove = () => {
      if (removed) return
      removed = true
      overlay.remove()
      if (Capacitor.getPlatform() === 'android') {
        // Keep the native insets dark until the startup has fully faded out.
        void CampusAppearance.finishStartup()
          .then(() => SystemBars.setStyle({ style: SystemBarsStyle.Light }))
          .catch((error) => console.warn('Unable to restore Android system bars', error))
      }
    }
    overlay.addEventListener('transitionend', (event) => {
      if (event.target === overlay && event.propertyName === 'opacity') remove()
    })
    window.setTimeout(remove, reduceMotion ? 220 : 700)
  }

  checkReady = () => {
    if (minimumReached && mediaComplete
      && ['interface', 'map', 'account'].every((part) => readyParts.has(part))) finish()
  }
  const minimumTimer = window.setTimeout(() => {
    minimumReached = true
    checkReady()
  }, Math.max(0, minimum - elapsed))
  // Do not hold navigation hostage to a failed SDK request or offline Auth.
  const maximumTimer = window.setTimeout(finish, Math.max(0, 9000 - elapsed))
  const waitingTimer = window.setTimeout(() => overlay.classList.add('is-waiting'), Math.max(0, 5600 - elapsed))
  if (video && !reduceMotion) {
    video.muted = true
    video.playsInline = true
    video.addEventListener('playing', showVideo)
    video.addEventListener('ended', completeVideo, { once: true })
    video.addEventListener('error', useStaticLogo, { once: true })
    if (video.error) useStaticLogo()
    else if (video.ended) {
      showVideo()
      completeVideo()
    } else {
      if (!video.paused && video.readyState >= 2) showVideo()
      void video.play().catch(useStaticLogo)
    }
  } else {
    overlay.classList.add('is-static')
    video?.pause()
  }
  checkReady()
}
