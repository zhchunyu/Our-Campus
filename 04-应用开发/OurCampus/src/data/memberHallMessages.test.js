import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listMemberHallMessages, toMemberHallMessage } from './memberHallMessages.js'

const { requireSupabase } = vi.hoisted(() => ({ requireSupabase: vi.fn() }))
vi.mock('./supabaseClient.js', () => ({ requireSupabase }))
const authorId = '11111111-1111-4111-8111-111111111111'
const messageId = '22222222-2222-4222-8222-222222222222'
const row = { id: messageId, author_id: authorId, content: '去图书馆', region_id: 'teaching', created_at: '2026-10-21T04:00:00.123456Z', deleted_at: null }

function queryResult(result) {
  const calls = []
  const query = {}
  for (const method of ['from', 'select', 'eq', 'is', 'order']) query[method] = (...args) => { calls.push([method, ...args]); return query }
  query.limit = (...args) => { calls.push(['limit', ...args]); return Promise.resolve(result) }
  requireSupabase.mockReturnValue(query)
  return calls
}

beforeEach(() => requireSupabase.mockReset())

describe('member public hall messages', () => {
  it('projects only the public hall fields and requests this author’s latest 20 unretracted messages', async () => {
    const calls = queryResult({ data: [row], error: null })
    expect(await listMemberHallMessages(authorId)).toEqual([{ id: messageId, authorId, content: '去图书馆', regionId: 'teaching', createdAt: row.created_at, deletedAt: null, imagePaths: [] }])
    expect(calls).toEqual([
      ['from', 'hall_messages'], ['select', 'id,author_id,content,region_id,created_at,deleted_at,image_paths'],
      ['eq', 'author_id', authorId], ['is', 'deleted_at', null],
      ['order', 'created_at', { ascending: false }], ['order', 'id', { ascending: false }], ['limit', 20],
    ])
  })

  it.each(['', null, 'demo-1', authorId + ',or=(author_id.neq.x)'])('rejects invalid member IDs before touching the server: %s', async (id) => {
    await expect(listMemberHallMessages(id)).rejects.toThrow('成员标识无效')
    expect(requireSupabase).not.toHaveBeenCalled()
  })

  it('drops private fields, other authors and retracted rows even if an unexpected response contains them', async () => {
    queryResult({ data: [{ ...row, email: 'private@example.com', signature: 'secret' }, { ...row, id: '33333333-3333-4333-8333-333333333333', deleted_at: '2026-10-21T05:00:00Z' }, { ...row, author_id: messageId }], error: null })
    const messages = await listMemberHallMessages(authorId)
    expect(messages).toHaveLength(1)
    expect(Object.keys(messages[0])).toEqual(['id', 'authorId', 'content', 'regionId', 'createdAt', 'deletedAt', 'imagePaths'])
  })

  it('propagates server failures instead of showing an empty success', async () => {
    const error = new Error('offline')
    queryResult({ data: null, error })
    await expect(listMemberHallMessages(authorId)).rejects.toBe(error)
  })

  it('normalizes realtime rows without accepting deleted or malformed messages', () => {
    expect(toMemberHallMessage({ ...row, deleted_at: 'now' }, authorId)).toBeNull()
    expect(toMemberHallMessage({ ...row, author_id: messageId }, authorId)).toBeNull()
    expect(toMemberHallMessage({ ...row, created_at: 'bad' }, authorId)).toBeNull()
  })
})

it('rejects malformed message timestamp types before they reach the public feed', () => {
  expect(toMemberHallMessage({ ...row, created_at: 0 }, authorId)).toBeNull()
})
