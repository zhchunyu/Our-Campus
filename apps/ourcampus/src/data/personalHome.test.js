import { describe, expect, it } from 'vitest'
import { loadPersonalHome, normalizePersonalHome, savePersonalHome } from './personalHome.js'

function memoryStorage() {
  const values = new Map()
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
}

describe('personal home persistence', () => {
  it('keeps saved decorations separate between accounts and visitors', () => {
    const storage = memoryStorage()
    savePersonalHome('student-a', { bio: '喜欢校园漫游', theme: 'coral' }, storage)
    expect(loadPersonalHome('student-a', storage)).toMatchObject({ bio: '喜欢校园漫游', theme: 'coral' })
    expect(loadPersonalHome('student-b', storage).bio).toBe('')
    expect(loadPersonalHome(null, storage).bio).toBe('')
  })

  it('restores a selected image and focal point without storing arbitrary remote URLs', () => {
    const storage = memoryStorage()
    const image = 'data:image/jpeg;base64,YWJj'
    savePersonalHome('student-a', { avatar: image, cover: 'https://example.com/tracker.png', coverX: 78, coverY: 22 }, storage)
    expect(loadPersonalHome('student-a', storage)).toMatchObject({ avatar: image, cover: '', coverX: 78, coverY: 22 })
  })

  it('recovers from damaged or unavailable storage without breaking the page', () => {
    expect(loadPersonalHome('student-a', { getItem: () => '{broken' }).theme).toBe('forest')
    expect(loadPersonalHome('student-a', { getItem: () => { throw new Error('blocked') } }).avatar).toBe('')
  })

  it('surfaces a failed write so the editor can retain unsaved changes', () => {
    const storage = { setItem: () => { throw new Error('quota') } }
    expect(() => savePersonalHome('student-a', { bio: '不要丢失这次修改' }, storage)).toThrow('quota')
    expect(() => savePersonalHome(null, {}, memoryStorage())).toThrow('请先登录')
  })

  it('limits personal text, deduplicates tags and rejects invalid decoration data', () => {
    const next = normalizePersonalHome({ bio: '好'.repeat(50), tags: ['图书馆', '图书馆', '早八困困', '校园漫游', '第四个'], theme: 'invalid', motion: 'yes', coverX: -10, coverY: 140 })
    expect([...next.bio]).toHaveLength(40)
    expect(next.tags).toEqual(['图书馆', '早八困困', '校园漫游'])
    expect(next).toMatchObject({ theme: 'forest', motion: false, coverX: 0, coverY: 100 })
  })
})
