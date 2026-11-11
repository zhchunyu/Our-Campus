import test from 'node:test'
import assert from 'node:assert/strict'
import { createAuvHandler } from '../backend/_shared/auv.js'

const env = { SUPABASE_URL: 'https://campus.example', SUPABASE_ANON_KEY: 'public-test-key' }
const request = (text, mode = 'chat', token = 'Bearer test-token') => new Request('https://gateway.example/api', { method: 'POST', headers: { authorization: token }, body: JSON.stringify({ text, mode }) })

for (const text of ['你好', '你好！', '您好。', 'hello', 'Hi']) {
  test(`简单问候 ${text} 首次就回应，不依赖模型或全库查询`, async () => {
    const calls = []
    const handler = createAuvHandler(env, async url => {
      calls.push(url)
      assert.equal(url, 'https://campus.example/auth/v1/user')
      return Response.json({ id: 'user-a' })
    })
    const response = await handler(request(text))
    const body = await response.json()
    assert.equal(response.status, 200, JSON.stringify(body))
    assert.equal(body.kind, 'answer')
    assert.equal(body.generated_by, 'greeting_rule')
    assert.match(body.text, /你好/)
    assert.equal(calls.length, 1)
  })
}
test('连续两次问候都可直接回应，不假称已经调用模型', async () => {
  const handler = createAuvHandler(env, async () => Response.json({ id: 'user-a' }))
  for (let i = 0; i < 2; i++) {
    const response = await handler(request('你好'))
    assert.equal(response.status, 200)
    assert.equal((await response.json()).generated_by, 'greeting_rule')
  }
})
test('问候后带具体问题仍走模型和实时资料，而不是只回复你好', async () => {
  const calls = []
  const handler = createAuvHandler({ ...env, AUV_BASE_URL: 'https://model.example/v1', AUV_API_KEY: 'private-test-key' }, async (url, options) => {
    calls.push(url)
    if (url.includes('/auth/v1/user')) return Response.json({ id: 'user-a' })
    if (url.includes('/rest/v1/')) return Response.json([])
    return Response.json({ choices: [{ message: { content: '没有实时天气数据，暂时无法确认。' } }] })
  })
  const response = await handler(request('你好，今天天气怎么样？'))
  assert.equal(response.status, 200)
  assert.ok(calls.includes('https://model.example/v1/chat/completions'))
  assert.notEqual((await response.json()).generated_by, 'greeting_rule')
})
test('登录失效仍提示重新登录，不能通过问候绕过身份校验', async () => {
  const handler = createAuvHandler(env, async () => Response.json({ error: 'expired' }, { status: 401 }))
  const response = await handler(request('你好'))
  assert.equal(response.status, 401)
  assert.equal((await response.json()).error.code, 'login_required')
})
test('事件抽取中的你好仍说明适用范围', async () => {
  const handler = createAuvHandler(env, async () => Response.json({ id: 'user-a' }))
  const response = await handler(request('你好', 'extract'))
  assert.equal(response.status, 200)
  assert.equal((await response.json()).kind, 'redirect')
})
