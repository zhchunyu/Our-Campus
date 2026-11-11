// Standalone bundle: verify the deployed handler. Legacy APP-reference comparisons remain in the original workspace.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createAuvHandler as deployedHandler } from '../backend/_shared/auv.js'

const env = { AUV_BASE_URL: 'https://model.example', AUV_API_KEY: 'server-only-test-key', SUPABASE_URL: 'https://campus.example', SUPABASE_ANON_KEY: 'public-test-key' }
const event = { type: 'congestion', description: '谷园餐厅排队很长', advice: '可以稍后再来', time_window: 'noon' }
const payload = (mode) => ({ mode, text: mode === 'extract' ? '谷园餐厅排队很长' : '期末复习压力大，想休息一会儿，有什么建议？', model: 'client-injected-model' })
const request = (mode, token = 'Bearer user-token') => new Request('https://gateway.example/api', { method: 'POST', headers: { authorization: token }, body: JSON.stringify(payload(mode)) })

function fixture() {
  const calls = []
  return { calls, fetcher: async (url, options) => {
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: 'user-a' })
    if (url.includes('/rest/v1/')) return Response.json([])
    calls.push({ url, options, body: JSON.parse(options.body) })
    const extraction = JSON.parse(options.body).messages.some(({ content }) => content.includes('type(事件类型'))
    return Response.json({ choices: [{ message: { content: extraction ? JSON.stringify(event) : '可以先休息十分钟，再决定接下来复习哪一小节。' } }] })
  } }
}

for (const [name, createAuvHandler] of [['当前线上函数', deployedHandler]]) {
  for (const mode of ['extract', 'chat']) {
    test(`${name}：${mode} 使用对应百炼 Code，客户端不能覆盖模型与密钥`, async () => {
      const mock = fixture()
      const handle = createAuvHandler({ ...env, AUV_EXTRACT_MODEL: '  deployed-extract  ', AUV_PERSONA_MODEL: '  deployed-persona  ' }, mock.fetcher)
      const response = await handle(request(mode))
      assert.equal(response.status, 200, await response.clone().text())
      assert.equal(mock.calls.length, 1)
      assert.equal(mock.calls[0].body.model, mode === 'extract' ? 'deployed-extract' : 'deployed-persona')
      assert.equal(mock.calls[0].options.headers.Authorization, 'Bearer server-only-test-key')
      assert.ok(!(await response.text()).includes('server-only-test-key'))
    })
    for (const setting of [undefined, '   ']) {
      test(`${name}：${mode} 未配置或空白 Code 保持旧服务别名（${JSON.stringify(setting)}）`, async () => {
        const mock = fixture()
        const response = await createAuvHandler({ ...env, AUV_EXTRACT_MODEL: setting, AUV_PERSONA_MODEL: setting }, mock.fetcher)(request(mode))
        assert.equal(response.status, 200, await response.clone().text())
        assert.equal(mock.calls[0].body.model, mode === 'extract' ? 'extract' : 'persona')
      })
    }
  }
  test(`${name}：两个入口可以使用同一个百炼 Code，并保留各自提示词与结果`, async () => {
    const mock = fixture()
    const handle = createAuvHandler({ ...env, AUV_EXTRACT_MODEL: 'same-deployed-code', AUV_PERSONA_MODEL: 'same-deployed-code' }, mock.fetcher)
    const extraction = await (await handle(request('extract'))).json()
    const chat = await (await handle(request('chat'))).json()
    assert.equal(extraction.kind, 'event')
    assert.equal(extraction.event.building_id, 'canteen')
    assert.equal(chat.kind, 'answer')
    assert.equal(mock.calls.length, 2)
    assert.deepEqual(mock.calls.map(({ body }) => body.model), ['same-deployed-code', 'same-deployed-code'])
    assert.notDeepEqual(mock.calls[0].body.messages, mock.calls[1].body.messages)
  })
  for (const base of ['https://model.example', 'https://model.example/v1', 'https://model.example/v1/', ' https://dashscope.aliyuncs.com/compatible-mode/v1/ ']) {
    test(`${name}：规范化服务地址 ${base}`, async () => {
      const mock = fixture()
      const response = await createAuvHandler({ ...env, AUV_BASE_URL: base }, mock.fetcher)(request('extract'))
      assert.equal(response.status, 200, await response.clone().text())
      const expected = base.includes('dashscope') ? 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions' : 'https://model.example/v1/chat/completions'
      assert.equal(mock.calls[0].url, expected)
    })
  }
  test(`${name}：未登录不能调用百炼`, async () => {
    const mock = fixture()
    const response = await createAuvHandler(env, mock.fetcher)(request('extract', ''))
    assert.equal(response.status, 401)
    assert.equal(mock.calls.length, 0)
  })
}
