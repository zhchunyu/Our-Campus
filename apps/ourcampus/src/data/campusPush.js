import { Capacitor, registerPlugin } from '@capacitor/core'
import { requireSupabase } from './supabaseClient.js'

export const CampusPush = registerPlugin('CampusPush')
export const isAndroidPush = () => Capacitor.getPlatform() === 'android'
export async function pushStatus() {
  return isAndroidPush() ? CampusPush.getStatus() : { platform: 'web', configured: false, enabled: false, permission: 'unavailable' }
}
export async function registerPushDevice(status) {
  if (!status.cid || !status.installationId || !status.enabled || status.permission !== 'granted') return false
  const { error } = await requireSupabase().rpc('campus_register_push_device', { p_installation_id: status.installationId, p_cid: status.cid })
  if (error) throw error
  return true
}
export async function disablePushDevice() {
  if (!isAndroidPush()) return
  const status = await CampusPush.getStatus()
  try {
    if (status.cid) {
      const { error } = await requireSupabase().rpc('campus_disable_push_device', { p_installation_id: status.installationId })
      if (error) throw error
    }
  } finally { await CampusPush.disable() }
}
