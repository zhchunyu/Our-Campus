import { savePersonalHome } from './personalHome.js'
import { describeServerError } from './supabaseClient.js'

export async function savePersonalAppearance({ userId, home, avatarImage = null, updateAvatar, isCurrent = () => true, saveLocal = savePersonalHome }) {
  const checkOwner = () => { if (!userId || !isCurrent()) throw new Error('账号已切换，请重新打开个人主页') }
  checkOwner()
  let avatarSynced = false
  if (avatarImage !== null) {
    await updateAvatar(avatarImage)
    avatarSynced = true
    checkOwner()
  }
  try {
    const next = saveLocal(userId, { ...home, ...(avatarSynced ? { avatar: '' } : {}) })
    return { home: next, avatarSynced }
  } catch (cause) {
    const error = new Error(avatarSynced ? '头像已同步，但本机装扮保存失败，请重试' : '本机装扮保存失败，请检查设备存储空间后重试', { cause })
    error.avatarSynced = avatarSynced
    throw error
  }
}

export function describeAppearanceError(error, fallback) {
  return error?.avatarSynced === true ? '头像已同步，但本机装扮保存失败，请重试' : describeServerError(error, fallback)
}
