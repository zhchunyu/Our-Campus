let mapSdkPromise
const walkingRoutePromises = new Map()

export function loadTencentMapSdk(key) {
  if (window.TMap) return Promise.resolve(window.TMap)
  if (!key) return Promise.reject(new Error('missing-key'))
  if (mapSdkPromise) return mapSdkPromise

  mapSdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `https://map.qq.com/api/gljs?v=1.exp&key=${encodeURIComponent(key)}`
    script.async = true
    script.onload = () => {
      if (window.TMap) resolve(window.TMap)
      else reject(new Error('sdk-global-missing'))
    }
    script.onerror = () => reject(new Error('sdk-load-failed'))
    document.head.append(script)
  }).catch((error) => {
    mapSdkPromise = undefined
    throw error
  })

  return mapSdkPromise
}

function decodeTencentPolyline(polyline) {
  if (!Array.isArray(polyline) || polyline.length < 2) return []
  const coordinates = [...polyline]
  for (let index = 2; index < coordinates.length; index += 2) {
    coordinates[index] = coordinates[index - 2] + coordinates[index] / 1e6
    coordinates[index + 1] = coordinates[index - 1] + coordinates[index + 1] / 1e6
  }

  const points = []
  for (let index = 0; index + 1 < coordinates.length; index += 2) {
    const lat = coordinates[index]
    const lng = coordinates[index + 1]
    if (Number.isFinite(lat) && Number.isFinite(lng)) points.push({ lat, lng })
  }
  return points
}

function makeServiceError(response) {
  const error = new Error(response?.message || 'walking-route-failed')
  error.code = response?.status
  return error
}

export function requestTencentWalkingRoute({ key, from, to, timeoutMs = 15_000 }) {
  if (!key || !from || !to) return Promise.reject(new Error('route-input-missing'))
  const cacheKey = `${from.lat.toFixed(6)},${from.lng.toFixed(6)}:${to.lat.toFixed(6)},${to.lng.toFixed(6)}`
  if (walkingRoutePromises.has(cacheKey)) return walkingRoutePromises.get(cacheKey)

  const routePromise = new Promise((resolve, reject) => {
    const callbackName = `__campusTencentRoute_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const script = document.createElement('script')
    const url = new URL('https://apis.map.qq.com/ws/direction/v1/walking/')
    let settled = false

    const cleanup = () => {
      window.clearTimeout(timer)
      delete window[callbackName]
      script.remove()
    }
    const finish = (callback, value) => {
      if (settled) return
      settled = true
      cleanup()
      callback(value)
    }
    const timer = window.setTimeout(() => finish(reject, new Error('walking-route-timeout')), timeoutMs)

    window[callbackName] = (response) => {
      if (response?.status !== 0) {
        finish(reject, makeServiceError(response))
        return
      }
      const route = response?.result?.routes?.[0]
      const points = decodeTencentPolyline(route?.polyline)
      if (!route || points.length < 2) {
        finish(reject, new Error('walking-route-empty'))
        return
      }
      finish(resolve, {
        distance: route.distance,
        durationMinutes: route.duration,
        steps: route.steps ?? [],
        points,
      })
    }

    url.searchParams.set('from', `${from.lat},${from.lng}`)
    url.searchParams.set('to', `${to.lat},${to.lng}`)
    url.searchParams.set('key', key)
    url.searchParams.set('output', 'jsonp')
    url.searchParams.set('callback', callbackName)
    script.src = url.toString()
    script.async = true
    script.onerror = () => finish(reject, new Error('walking-route-network-error'))
    document.head.append(script)
  }).catch((error) => {
    walkingRoutePromises.delete(cacheKey)
    throw error
  })

  walkingRoutePromises.set(cacheKey, routePromise)
  return routePromise
}
