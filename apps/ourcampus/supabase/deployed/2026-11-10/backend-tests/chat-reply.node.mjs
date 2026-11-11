// Standalone bundle: verify the deployed handler. Legacy APP-reference comparisons remain in the original workspace.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createAuvHandler as deployedHandler } from '../backend/_shared/auv.js'

const env = { AUV_BASE_URL: 'https://model.example/v1', AUV_API_KEY: 'server-only-test-key', SUPABASE_URL: 'https://campus.example', SUPABASE_ANON_KEY: 'public-test-key' }
const greeting = { answer: '你好！有什么可以帮助你的吗？', options: ['想了解某个地点，请告诉我地点名称', '想查询餐饮服务时间，请告知具体食堂'] }
const weather = { answer: '尚未接入实时天气，无法确认今天天气。', options: ['可以查看手机天气应用。'] }
const metadata = { source: 'campus_sample', queried_at: '2026-11-08T06:57:50.681Z' }
const expectedGreeting = greeting.answer + '\n- ' + greeting.options.join('\n- ')
const request = (mode = 'chat', text = '想听听校园生活建议') => new Request('https://gateway.example/api', { method: 'POST', headers: { authorization: 'Bearer user-token' }, body: JSON.stringify({ mode, text }) })
function fixture(content) {
  const calls = []
  return { calls, fetcher: async (url, options) => {
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: 'test-user' })
    if (url.includes('/rest/v1/')) return Response.json([])
    calls.push(JSON.parse(options.body))
    return Response.json({ choices: [{ message: { content } }] })
  } }
}
const successful = [
  ['普通聊天', '你好，可以先聊聊你想了解的校园信息。', '你好，可以先聊聊你想了解的校园信息。'],
  ['单个聊天对象', JSON.stringify(greeting), expectedGreeting],
  ['截图中的聊天对象和元数据', JSON.stringify(greeting) + ',\n' + JSON.stringify(metadata), expectedGreeting],
  ['单个完整代码围栏', '```json\n' + JSON.stringify(greeting) + '\n```', expectedGreeting],
  ['对象内含元数据', JSON.stringify({ ...greeting, ...metadata }), expectedGreeting],
  ['完全重复对象', JSON.stringify(greeting) + ',' + JSON.stringify(greeting), expectedGreeting],
  ['选项和正文重复', JSON.stringify({ answer: '建议先休息。', options: ['建议先休息。', '再安排下一小节。', '再安排下一小节。'] }), '建议先休息。\n- 再安排下一小节。'],
  ['引号、逗号和花括号不误拆', JSON.stringify({ answer: '可以用“你好,同学”和 {地点} 作为示例。' }), '可以用“你好,同学”和 {地点} 作为示例。'],
  ['天气缺数据解释', JSON.stringify(weather), weather.answer + '\n- ' + weather.options[0]],
]
const invalid = [
  ['截断JSON', '{"answer":"你好"'],
  ['尾随未解析文字', JSON.stringify(greeting) + ' extra private source'],
  ['只有内部元数据', JSON.stringify(metadata)],
  ['不同的重复回复', JSON.stringify(greeting) + ',{"answer":"另外一个回答"}'],
  ['事件抽取误入聊天', '{"type":"congestion","description":"排队很长","advice":"稍后再来"}'],
  ['空回答', '{"answer":" ","options":["你好"]}'],
  ['错误选项类型', '{"answer":"你好","options":[{"source":"secret"}]}'],
  ['未知字段', '{"answer":"你好","private_diagnostic":"secret"}'],
  ['混入未知对象', JSON.stringify(greeting) + ',{"private_diagnostic":"secret"}'],
  ['空对象列表', '[]'],
  ['普通文字后混入内部字段', '你好。\n{"source":"campus_sample","queried_at":"2026-11-08"}'],

  ['正文内嵌元数据', JSON.stringify({ answer: '你好。\\n{"source":"campus_sample","queried_at":"2026-11-08"}' })],
  ['选项内嵌元数据', JSON.stringify({ answer: '你好。', options: ['{"source":"campus_sample","queried_at":"2026-11-08"}'] })],
]
for (const [name, makeHandler] of [['线上版', deployedHandler]]) {
  for (const [label, content, expected] of successful) test(name + '：' + label, async () => {
    const mock = fixture(content)
    const response = await makeHandler(env, mock.fetcher)(request())
    const result = await response.json()
    assert.equal(response.status, 200, JSON.stringify(result))
    assert.equal(result.text, expected)
    assert.ok(!/campus_sample|queried_at|2026-11-08T06:57:50/.test(result.text))
  })
  for (const [label, content] of invalid) test(name + '：拒绝' + label, async () => {
    const mock = fixture(content)
    const response = await makeHandler(env, mock.fetcher)(request())
    const result = await response.json()
    assert.equal(response.status, 502)
    assert.equal(result.error.code, 'invalid_output')
    assert.ok(!JSON.stringify(result).includes('private_diagnostic'))
  })
  test(name + '：提示词说明当前问题、普通文字输出和天气资料边界', async () => {
    const mock = fixture(weather.answer)
    const response = await makeHandler(env, mock.fetcher)(request('chat', '今天天气怎么样'))
    assert.equal(response.status, 200)
    const instructions = mock.calls[0].messages.map(m => m.content).join('\n')
    assert.match(instructions, /只输出.*自然语言/)
    assert.match(instructions, /question/)
    assert.match(instructions, /未接入实时天气/)
  })
  test(name + '：事件抽取仍保持JSON字段校验', async () => {
    const mock = fixture('{"type":"congestion","description":"谷园餐厅排队很长","advice":"稍后再来"}')
    const response = await makeHandler(env, mock.fetcher)(request('extract', '谷园餐厅排队很长'))
    const result = await response.json()
    assert.equal(response.status, 200)
    assert.equal(result.kind, 'event')
    assert.equal(result.event.building_id, 'canteen')
  })
}
test('线上版：结构化options仍受原有实时状态核验约束', async () => {
  const mock = fixture('{"answer":"可以考虑校医院。","options":["校医院现在已开放。"]}')
  const response = await deployedHandler(env, mock.fetcher)(request())
  const result = await response.json()
  assert.equal(response.status, 200)
  assert.equal(result.generated_by, 'grounding_rule')
  assert.ok(!result.text.includes('现在已开放'))
})
