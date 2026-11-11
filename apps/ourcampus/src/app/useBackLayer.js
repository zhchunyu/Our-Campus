import { useLayoutEffect, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import { createBackNavigation } from './backNavigation.js'

let navigation
function getNavigation() {
  navigation ??= createBackNavigation(window, { enableSwipe: !Capacitor.isNativePlatform() })
  return navigation
}

export function requestAppBack() { return getNavigation().requestBack() }

export function useBackLayer(enabled, onBack, priority, swipe = true) {
  const latest = useRef(onBack)
  useLayoutEffect(() => { latest.current = onBack })
  useLayoutEffect(() => {
    const back = getNavigation()
    if (enabled) return back.register(() => latest.current(), { priority, swipe })
  }, [enabled, priority, swipe])
}

if (import.meta.hot) import.meta.hot.dispose(() => { navigation?.dispose(); navigation = undefined })
