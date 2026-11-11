import test from 'node:test'
import assert from 'node:assert/strict'
import { createAuvHandler, validateExtractedEvent, EXTRACT_INSTRUCTION } from '../supabase/functions/_shared/auv.js'

const env = { AUV_BASE_URL: 'https://model.example', AUV_API_KEY: 'server-only-test-key', SUPABASE_URL: 'https://campus.example', SUPABASE_PUBLISHABLE_KEY: 'public-test-key' }
const sample = { type: 'congestion', description: '排队很长', advice: '可以稍后再来', building_name: '校医院', building_id: 'hospital', estimated_wait_min: 30, time_window: 'noon' }
const request = (body, token = 'Bearer user-token') => new Request('https://gateway.example/api', { method: 'POST', headers: { authorization: token }, body: JSON.stringify(body) })

function fixture({ authenticated = true, output = JSON.stringify(sample), modelStatus = 200 } = {}) {
  const calls = []
  return { calls, fetcher: async (url, options) => {
    calls.push({ url, options })
    if (url.endsWith('/auth/v1/user')) return Response.json(authenticated ? { id: 'user-a' } : { error: 'bad token' }, { status: authenticated ? 200 : 401 })
    if (url.includes('/rest/v1/')) return Response.json([])
    return modelStatus === 200 ? Response.json({ choices: [{ message: { content: output } }] }) : new Response('private upstream diagnostic', { status: modelStatus })
  } }
}

test('未登录和伪造会话均不能使用共享模型密钥', async () => {
  const mock = fixture({ authenticated: false }); const handle = createAuvHandler(env, mock.fetcher)
  assert.equal((await handle(request({ mode: 'chat', text: '图书馆' }, ''))).status, 401)
  assert.equal(mock.calls.length, 0)
  assert.equal((await handle(request({ mode: 'chat', text: '图书馆' }))).status, 401)
  assert.ok(mock.calls.every(({ url }) => !url.includes('model.example')))
})

test('模型给出的真实建筑也不能替代原文中缺失的地点', () => {
  const result = validateExtractedEvent(JSON.stringify(sample), '现在排队很长')
  assert.equal(result.building_id, null)
  assert.equal(result.building_name, null)
  assert.equal(result.estimated_wait_min, null)
  assert.equal('severity' in result, false)
})

test('别名、相邻公寓编号、歧义和手动选点不发生误定位', () => {
  assert.equal(validateExtractedEvent(JSON.stringify(sample), '谷园排队很长').building_id, 'canteen')
  assert.equal(validateExtractedEvent(JSON.stringify(sample), '11号公寓楼路灯坏了').building_id, 'apartment-11')
  assert.equal(validateExtractedEvent(JSON.stringify(sample), '谷园和教工餐厅都排队').location_status, 'ambiguous')
  assert.equal(validateExtractedEvent(JSON.stringify(sample), '谷园排队', 'employee-canteen').building_id, 'employee-canteen')
  assert.equal(validateExtractedEvent(JSON.stringify(sample), '西车间二号停电了').building_id, 'workshop-west-2')
  assert.equal(validateExtractedEvent(JSON.stringify(sample), '车间停电了').location_status, 'ambiguous')
})

test('格式容错接受 JSON 代码块，错误输出产生受控失败', () => {
  assert.equal(validateExtractedEvent('```json\n' + JSON.stringify(sample) + '\n```', '谷园排队').type, 'congestion')
  assert.throws(() => validateExtractedEvent('我是一个回复', '谷园排队'), /有效的事件分析/)
})

test('应急和互助分流不会排队调用模型，也不会假称已通知学校', async () => {
  const mock = fixture(); const handle = createAuvHandler(env, mock.fetcher)
  const emergency = await (await handle(request({ mode: 'extract', text: '有人晕倒了' }))).json()
  assert.equal(emergency.kind, 'emergency'); assert.equal(emergency.generated_by, 'safety_rule')
  const community = await (await handle(request({ mode: 'extract', text: '谷园捡到一张校园卡' }))).json()
  assert.equal(community.kind, 'redirect')
  assert.ok(mock.calls.every(({ url }) => !url.includes('model.example')))
})

test('提取按队友约定拼接提示词，模型密钥仅进入上游请求头', async () => {
  const mock = fixture(); const handle = createAuvHandler(env, mock.fetcher)
  const response = await handle(request({ mode: 'extract', text: '谷园餐厅排队很长', apiKey: 'client-injected' }))
  const result = await response.json()
  assert.equal(result.event.building_id, 'canteen')
  const call = mock.calls.find(({ url }) => url.includes('model.example'))
  const body = JSON.parse(call.options.body)
  assert.equal(body.messages[0].content, 'You are a helpful assistant.')
  assert.equal(body.messages[1].content, EXTRACT_INSTRUCTION + '\n谷园餐厅排队很长')
  assert.equal(call.options.headers.Authorization, 'Bearer server-only-test-key')
  assert.ok(!JSON.stringify(result).includes('server-only-test-key'))
})

test('校园建议查有效且非演示事件，包含未来活动，并明确标注取数失败', async () => {
  const mock = fixture({ output: '暂无开放时间，请查看官网。' })
  const result = await (await createAuvHandler(env, mock.fetcher)(request({ mode: 'chat', text: '图书馆几点开门' }))).json()
  assert.equal(result.generated_by, 'auv')
  assert.ok(mock.calls.some(({ url }) => url.includes('is_demo=eq.false') && url.includes('end_at=gt.') && !url.includes('start_at=lte.')))
  assert.equal(result.locations[0].id, 'library')
  const offline = async (url, options) => url.includes('/rest/v1/') ? new Response('missing', { status: 404 }) : mock.fetcher(url, options)
  const unavailable = await (await createAuvHandler(env, offline)(request({ mode: 'chat', text: '图书馆' }))).json()
  assert.equal(unavailable.live_context_available, false)
})

test('旧服务地址返回 404 时只显示可操作错误，不泄露上游正文', async () => {
  const mock = fixture({ modelStatus: 404 })
  const response = await createAuvHandler(env, mock.fetcher)(request({ mode: 'extract', text: '谷园排队' }))
  assert.equal(response.status, 502)
  const result = await response.text()
  assert.ok(result.includes('更新服务地址'))
  assert.ok(!result.includes('private upstream diagnostic'))
})
