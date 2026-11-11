import test from 'node:test'
import assert from 'node:assert/strict'
import { createAuvHandler } from '../backend/_shared/auv.js'

const env = { SUPABASE_URL: 'https://campus.example', SUPABASE_ANON_KEY: 'public-test-key' }
const request = (text = '我有哪些新消息？') => new Request('https://gateway.example/api', { method: 'POST', headers: { authorization: 'Bearer user-token' }, body: JSON.stringify({ mode: 'chat', text, userId: 'other-user' }) })
const notice = (patch = {}) => ({ id: 'notice-a', recipient_id: 'user-a', type: 'campus-event', title: '通知标题', created_at: '2026-10-01T03:00:00Z', read_at: null, ...patch })
function fixture(rows = []) {
  const calls = []
  return { calls, fetcher: async url => {
    calls.push(url)
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: 'user-a' })
    if (url.includes('/rest/v1/notifications?')) return Response.json(rows)
    throw new Error('Inbox should not invoke models or unrelated tables')
  } }
}
test('新消息直接读本人未读通知，历史记录明确区别于当前事件', async () => {
  const mock = fixture([notice()])
  const response = await createAuvHandler(env, mock.fetcher)(request())
  const result = await response.json()
  assert.equal(response.status, 200)
  assert.equal(result.generated_by, 'notification_rule')
  assert.match(result.text, /通知标题/)
  assert.match(result.text, /未读/)
  assert.match(result.text, /2026/)
  assert.match(result.text, /不代表.*当前|不代表.*现在/)
  assert.equal(mock.calls.length, 2)
  assert.match(mock.calls[1], /recipient_id=eq.user-a/)
  assert.match(mock.calls[1], /read_at=is.null/)
})
test('客户端伪造ID及上游混入他人通知不会变成当前用户的消息', async () => {
  const mock = fixture([notice(), notice({ id: 'other', recipient_id: 'other-user', title: '不应显示的标题' })])
  const result = await (await createAuvHandler(env, mock.fetcher)(request())).json()
  assert.match(result.text, /通知标题/)
  assert.ok(!result.text.includes('不应显示的标题'))
})
test('仅列最近六条，不把有界查询数量说成全部未读总数', async () => {
  const mock = fixture(Array.from({ length: 7 }, (_, i) => notice({ id: 'n' + i, title: '消息' + i })))
  const result = await (await createAuvHandler(env, mock.fetcher)(request())).json()
  assert.match(result.text, /消息5/)
  assert.ok(!result.text.includes('消息6'))
  assert.match(result.text, /最近.*6|仅.*6/)
})
test('成功的空通知查询明确没有未读，不用等待模型编造', async () => {
  const mock = fixture()
  const response = await createAuvHandler(env, mock.fetcher)(request())
  assert.equal(response.status, 200)
  assert.match((await response.json()).text, /没有查到.*未读/)
})
test('通知权限或读取失败不能假称没有消息', async () => {
  const response = await createAuvHandler(env, async url => url.includes('/auth/v1/') ? Response.json({ id: 'user-a' }) : new Response('private diagnostic', { status: 403 }))(request())
  assert.equal(response.status, 502)
  const body = await response.json()
  assert.equal(body.error.code, 'context_unavailable')
  assert.ok(!JSON.stringify(body).includes('private diagnostic'))
})
test('通知数据格式错误受控失败，不展示对象或假空结果', async () => {
  const mock = fixture({ error: 'wrong data shape' })
  const response = await createAuvHandler(env, mock.fetcher)(request())
  assert.equal(response.status, 502)
})
test('一般通知查询可以查看已读记录，不擅自全部当未读', async () => {
  const mock = fixture([notice({ read_at: '2026-10-02T03:00:00Z' })])
  const result = await (await createAuvHandler(env, mock.fetcher)(request('我有哪些通知？'))).json()
  assert.match(result.text, /已读/)
  assert.ok(!mock.calls[1].includes('read_at=is.null'))
})
test('带具体日期或额外事项的复合问题保留原模型处理', async () => {
  const calls = []
  const fetcher = async url => {
    calls.push(url)
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: 'user-a' })
    if (url.includes('/rest/v1/')) return Response.json([])
    return Response.json({ choices: [{ message: { content: '目前没有实时天气数据，无法确认。' } }] })
  }
  for (const text of ['我有哪些新消息，另外天气怎么样？', '我今天有哪些新消息？']) {
    const response = await createAuvHandler({ ...env, AUV_BASE_URL: 'https://model.example/v1', AUV_API_KEY: 'private-key' }, fetcher)(request(text))
    assert.equal(response.status, 200)
    assert.notEqual((await response.json()).generated_by, 'notification_rule')
  }
  assert.ok(calls.includes('https://model.example/v1/chat/completions'))
})
