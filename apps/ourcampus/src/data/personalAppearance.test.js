import { describe, expect, it, vi } from 'vitest'
import { describeAppearanceError, savePersonalAppearance } from './personalAppearance.js'

const userId = '11111111-1111-4111-8111-111111111111'
const home = { avatar: 'data:image/jpeg;base64,bGVnYWN5', cover: '', bio: '仅本机', tags: ['阅读'] }

describe('saving a local appearance with an explicit public avatar change', () => {
  it('never uploads the legacy avatar when only local decoration is saved', async () => {
    const updateAvatar = vi.fn()
    const saveLocal = vi.fn((id, value) => value)
    const result = await savePersonalAppearance({ userId, home, avatarImage: null, updateAvatar, saveLocal })
    expect(updateAvatar).not.toHaveBeenCalled()
    expect(result.home).toEqual(home)
    expect(result.avatarSynced).toBe(false)
  })
  it('keeps the existing local appearance when the cloud avatar save fails', async () => {
    const saveLocal = vi.fn()
    await expect(savePersonalAppearance({ userId, home, avatarImage: 'data:image/jpeg;base64,bmV3', updateAvatar: async () => { throw new Error('上传失败') }, saveLocal })).rejects.toThrow('上传失败')
    expect(saveLocal).not.toHaveBeenCalled()
  })
  it('clears only the old local avatar after an explicit successful upload', async () => {
    const updateAvatar = vi.fn(async () => {})
    const result = await savePersonalAppearance({ userId, home, avatarImage: home.avatar, updateAvatar, saveLocal: (id, value) => value })
    expect(updateAvatar).toHaveBeenCalledWith(home.avatar)
    expect(result.home).toEqual({ ...home, avatar: '' })
    expect(result.avatarSynced).toBe(true)
  })
  it('distinguishes successful cloud sync from a later local storage failure', async () => {
    await expect(savePersonalAppearance({ userId, home, avatarImage: '', updateAvatar: async () => {}, saveLocal: () => { throw new Error('quota') } })).rejects.toMatchObject({ avatarSynced: true, message: expect.stringContaining('头像已同步') })
  })
  it('does not write local state after the account changes during upload', async () => {
    let current = true
    const saveLocal = vi.fn()
    await expect(savePersonalAppearance({ userId, home, avatarImage: home.avatar, updateAvatar: async () => { current = false }, isCurrent: () => current, saveLocal })).rejects.toThrow('账号已切换')
    expect(saveLocal).not.toHaveBeenCalled()
  })
})

it('preserves the partial success in the UI message instead of saying the upload failed', () => {
  expect(describeAppearanceError({ avatarSynced: true }, '头像未能同步')).toContain('头像已同步')
  expect(describeAppearanceError(new Error('Failed to fetch'), '上传失败')).toContain('网络连接失败')
})
