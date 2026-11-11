import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'

export async function getDeviceLocation() {
  if (Capacitor.isNativePlatform()) {
    const currentPermission = await Geolocation.checkPermissions()
    const permission = currentPermission.location === 'granted'
      ? currentPermission
      : await Geolocation.requestPermissions({ permissions: ['location'] })

    if (permission.location !== 'granted') {
      const error = new Error('location-permission-denied')
      error.code = 'OS-PLUG-GLOC-0003'
      throw error
    }
  }

  const position = await Geolocation.getCurrentPosition({
    enableHighAccuracy: true,
    timeout: 20000,
    maximumAge: 5000,
  })

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    timestamp: position.timestamp,
  }
}

export function describeLocationError(error) {
  const code = error?.code
  if (code === 1 || code === 'OS-PLUG-GLOC-0003' || error?.message === 'location-permission-denied') {
    return '定位权限未开启，请在手机设置中允许后重试。'
  }
  if (code === 'OS-PLUG-GLOC-0007' || code === 'OS-PLUG-GLOC-0009' || code === 'OS-PLUG-GLOC-0017') {
    return '手机定位服务未开启，请打开系统定位后重试。'
  }
  if (code === 3 || code === 'OS-PLUG-GLOC-0010') {
    return '暂时没有获取到 GPS，请到开阔位置后重试。'
  }
  return '定位失败，请检查手机定位设置后重试。'
}
