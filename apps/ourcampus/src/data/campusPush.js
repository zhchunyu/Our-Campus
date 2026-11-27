import { Capacitor, registerPlugin } from '@capacitor/core'
import { requireSupabase } from './supabaseClient.js'

export const CampusPush = registerPlugin('CampusPush')
export const isAndroidPush = () => Capacitor.getPlatform() === 'android'
const registrationId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function pushStatus() {
  return isAndroidPush() ? CampusPush.getStatus() : { platform: 'web', configured: false, enabled: false, permission: 'unavailable' }
}

export function canRegisterPushDevice(status) {
  return Boolean(status.configured && status.enabled && status.permission === 'granted' && status.installationId && status.cid)
}

async function pushSession(client, userId) {
  const { data, error } = await client.auth.getSession()
  if (error) throw error
  const session = data?.session
  if (!session?.access_token || session.user?.id !== userId) throw new Error('账号已变化，请重新登录后再试。')
  return session
}

export async function registerPushDevice(status, userId) {
  if (!canRegisterPushDevice(status)) return false
  const client = requireSupabase()
  const session = await pushSession(client, userId)
  // Pin the request to this account, even if the Supabase client session changes before fetch.
  const { data, error } = await client.rpc('campus_register_push_device', { p_installation_id: status.installationId, p_cid: status.cid })
    .setHeader('Authorization', `Bearer ${session.access_token}`)
  if (error) throw error
  if (typeof data !== 'string' || !registrationId.test(data)) return false
  await pushSession(client, userId)
  return true
}

export async function disablePushDevice(userId) {
  if (!isAndroidPush()) return
  try {
    const status = await CampusPush.getStatus()
    if (status.installationId && (status.enabled || status.cid)) {
      const client = requireSupabase()
      const session = await pushSession(client, userId)
      const { error } = await client.rpc('campus_disable_push_device', { p_installation_id: status.installationId })
        .setHeader('Authorization', `Bearer ${session.access_token}`)
      if (error) throw error
    }
  } finally { await CampusPush.disable() }
}
