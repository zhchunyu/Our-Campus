import { describe, expect, it, vi } from 'vitest'
vi.mock('./supabaseClient.js', () => ({ requireSupabase: () => { throw new Error('Inject a test client') } }))
import { DEFAULT_AI_REMINDER_PREFERENCES, parseAiReminderInterestKeywords, readAiReminderPreferences, saveAiReminderPreferences } from './aiReminderPreferences.js'

const userId = '11111111-1111-4111-8111-111111111111'
function clientWith(results) {
  const query = { select: vi.fn(), eq: vi.fn(), update: vi.fn(), insert: vi.fn(), maybeSingle: vi.fn() }
  for (const key of ['select', 'eq', 'update', 'insert']) query[key].mockReturnValue(query)
  query.maybeSingle.mockImplementation(async () => results.shift())
  return { from: vi.fn(() => query), query }
}
describe('explicit AI reminder choices', () => {
  it('does not enable automatic reminders before the user chooses them', () => {
    expect(DEFAULT_AI_REMINDER_PREFERENCES).toEqual({ enabled: false, use_favorites: true, match_lost: true, interest_keywords: [] })
  })
  it('trims and deduplicates explicitly entered words without inferring more interests', () => {
    expect(parseAiReminderInterestKeywords(' 阅读、篮球，阅读;志愿活动\n')).toEqual(['阅读', '篮球', '志愿活动'])
    expect(parseAiReminderInterestKeywords('')).toEqual([])
    expect(parseAiReminderInterestKeywords('😀😀')).toEqual(['😀😀'])
  })
  it.each(['读', '一'.repeat(17), Array.from({ length: 9 }, (_, i) => `兴趣${i}`).join('、')])('rejects invalid interest input %s', (input) => {
    expect(() => parseAiReminderInterestKeywords(input)).toThrow('最多 8 个兴趣词，每个 2–16 字')
  })
  it('reads only the signed-in account settings and keeps a missing row disabled', async () => {
    const client = clientWith([{ data: null, error: null }])
    expect(await readAiReminderPreferences(userId, client)).toEqual(DEFAULT_AI_REMINDER_PREFERENCES)
    expect(client.from).toHaveBeenCalledWith('campus_ai_reminder_preferences')
    expect(client.query.eq).toHaveBeenCalledWith('user_id', userId)
  })
  it('saves only the changed criteria rather than replacing other-device choices', async () => {
    const row = { user_id: userId, ...DEFAULT_AI_REMINDER_PREFERENCES, enabled: true, interest_keywords: ['篮球'] }
    const client = clientWith([{ data: row, error: null }])
    expect(await saveAiReminderPreferences(userId, { enabled: true }, client)).toMatchObject({ enabled: true, interest_keywords: ['篮球'] })
    expect(client.query.update).toHaveBeenCalledWith({ enabled: true })
    expect(client.query.eq).toHaveBeenCalledWith('user_id', userId)
    expect(client.query.insert).not.toHaveBeenCalled()
  })
  it('creates the first row with explicit defaults and retries only the same patch after a concurrent insert', async () => {
    const row = { user_id: userId, ...DEFAULT_AI_REMINDER_PREFERENCES, enabled: true, interest_keywords: ['阅读'] }
    const client = clientWith([{ data: null, error: null }, { data: null, error: { code: '23505' } }, { data: row, error: null }])
    expect(await saveAiReminderPreferences(userId, { enabled: true }, client)).toMatchObject({ enabled: true, interest_keywords: ['阅读'] })
    expect(client.query.insert).toHaveBeenCalledWith({ user_id: userId, ...DEFAULT_AI_REMINDER_PREFERENCES, enabled: true })
    expect(client.query.update.mock.calls).toEqual([[{ enabled: true }], [{ enabled: true }]])
  })
  it.each([{ user_id: userId }, { enabled: 'true' }, { interest_keywords: ['读'] }, { recipient_ids: [userId] }])('rejects an invalid patch before writing %j', async (patch) => {
    const client = clientWith([])
    await expect(saveAiReminderPreferences(userId, patch, client)).rejects.toThrow()
    expect(client.from).not.toHaveBeenCalled()
  })
  it('blocks guests and surfaces a missing database upgrade instead of claiming a save', async () => {
    const guest = clientWith([])
    await expect(readAiReminderPreferences(null, guest)).rejects.toThrow('请先登录')
    await expect(saveAiReminderPreferences(null, { enabled: true }, guest)).rejects.toThrow('请先登录')
    expect(guest.from).not.toHaveBeenCalled()
    const client = clientWith([{ data: null, error: { code: '42P01' } }])
    await expect(saveAiReminderPreferences(userId, { enabled: true }, client)).rejects.toThrow('尚未升级')
  })
})
