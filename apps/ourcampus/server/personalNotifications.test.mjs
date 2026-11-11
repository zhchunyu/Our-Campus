import test from 'node:test'
import assert from 'node:assert/strict'
import { createAuvHandler } from '../supabase/functions/_shared/auv.js'
import { createInformationWorker } from '../supabase/functions/_shared/campus-information-worker.js'
import { rankLostFoundMatches } from '../supabase/functions/_shared/lost-found-matching.js'
import { personalAiContext } from '../supabase/functions/_shared/ai-context.js'

const env = { AUV_BASE_URL: 'https://model.example', AUV_API_KEY: 'model-test-only', SUPABASE_URL: 'https://campus.example', SUPABASE_PUBLISHABLE_KEY: 'public-test-only' }
const now = new Date().toISOString()
const lost = { id: 'lost-id', author_id: 'user-a', kind: 'lost', status: 'analyzed', title: '白色耳机', body: '白色耳机，电话13900001111', location_id: 'library', created_at: now, details: { item_name: '白色耳机', occurred_at: now, contact: 'private-contact' }, analysis: { keywords: ['13900001111'] } }
const found = { ...lost, id: 'found-id', author_id: 'private-other-user', kind: 'found', location_id: 'canteen', title: '捡到白色耳机' }

test('个人上下文不发送作者、联系字段，匹配理由也不能绕过脱敏', () => {
  const matches = rankLostFoundMatches(lost, [found])
  const context = personalAiContext({ reports: [lost], candidates: [found], matches: [...matches, { report_id: found.id, reasons: ['号码13900001111'], warnings: ['微信abc123xyz'] }] })
  const text = JSON.stringify(context)
  assert.ok(!text.includes('13900001111'))
  assert.ok(!text.includes('abc123xyz'))
  assert.ok(!text.includes('private-contact'))
  assert.ok(!text.includes('private-other-user'))
  assert.ok(context.possible_matches[0].reasons.includes('描述均有白色'))
})

test('AUV 每次查当前账号发布、实时活动及偏好，忽略客户端伪造的其他用户 ID', async () => {
  const calls = []
  const fetcher = async (url, options = {}) => {
    calls.push({ url, options })
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: 'user-a' })
    if (url.includes('/campus_notification_preferences?')) return Response.json([{ favorite_location_ids: ['library'], interest_keywords: ['阅读'] }])
    if (url.includes('/campus_reports?')) return Response.json(url.includes('author_id=eq.') ? [lost] : [found])
    if (url.includes('/campus_events?')) return Response.json([{ id: 'event', title: '图书馆阅读活动', location_id: 'library', start_at: now, end_at: new Date(Date.now() + 86400000).toISOString() }])
    if (url.includes('/rest/v1/')) return Response.json([])
    return Response.json({ choices: [{ message: { content: '图书馆有阅读活动，也发现一条白色耳机线索，请核对特征。' } }] })
  }
  const response = await createAuvHandler(env, fetcher)(new Request('https://gateway.example', { method: 'POST', headers: { authorization: 'Bearer test-user-token' }, body: JSON.stringify({ text: '有什么与我相关的校园信息', mode: 'chat', userId: 'victim-user' }) }))
  assert.equal(response.status, 200)
  const result = await response.json()
  assert.equal(result.personal_context_available, true)
  const modelPayload = JSON.parse(calls.find((c) => c.url.includes('model.example')).options.body)
  const content = modelPayload.messages[1].content
  assert.ok(content.includes('图书馆阅读活动') && content.includes('favorite_location_ids') && content.includes('白色耳机'))
  assert.ok(!content.includes('13900001111') && !content.includes('private-contact') && !content.includes('private-other-user'))
  assert.ok(calls.some((c) => c.url.includes('author_id=eq.user-a')))
  assert.ok(calls.every((c) => !c.url.includes('victim-user')))
})

function workerFixture({ model = true } = {}) {
  const calls = []; let saved = null
  const workerEnv = { ...env, SUPABASE_SERVICE_ROLE_KEY: 'service-test-only', CAMPUS_WORKER_TOKEN: 'test-worker-token-at-least-32-characters' }
  if (!model) delete workerEnv.AUV_API_KEY
  const fetcher = async (url, options = {}) => {
    calls.push({ url, options })
    if (url.endsWith('/rpc/campus_claim_information_jobs')) return Response.json([{ id: 'job', target_id: found.id, claim_token: 'lease-token', kind: 'analysis' }])
    if (url.includes(`campus_reports?id=eq.${found.id}`)) return Response.json([found])
    if (url.includes('campus_reports?select=')) return Response.json([lost])
    if (url.endsWith('/rpc/campus_complete_information_analysis')) { saved = JSON.parse(options.body); return Response.json(true) }
    if (url.includes('model.example')) return Response.json({ choices: [{ message: { content: JSON.stringify({ summary: '白色耳机招领', keywords: ['白色', '耳机'] }) } }] })
    return Response.json(null)
  }
  const run = () => createInformationWorker(workerEnv, fetcher)(new Request('https://worker.example', { method: 'POST', headers: { 'x-campus-worker-token': workerEnv.CAMPUS_WORKER_TOKEN } }))
  return { calls, run, saved: () => saved }
}

test('Worker 提取特征后跨地点匹配，证据随结果原子交给数据库', async () => {
  const mock = workerFixture(); const response = await mock.run()
  assert.equal(response.status, 200)
  assert.equal(mock.saved().p_related_report_id, lost.id)
  assert.ok(mock.saved().p_analysis.matches[0].reasons.includes('描述均有白色'))
  const model = mock.calls.find((c) => c.url.includes('model.example'))
  assert.ok(!model.options.body.includes('13900001111') && !model.options.body.includes('private-contact'))
  assert.ok(mock.calls.filter((c) => c.url.includes('campus_reports?select=')).every((c) => !c.url.includes('location_id=eq.')))
})

test('模型不可用时使用明确标记的特征匹配，不伪称 AI 成功', async () => {
  const mock = workerFixture({ model: false }); await mock.run()
  assert.equal(mock.saved().p_analysis.generated_by, 'feature-rules')
  assert.equal(mock.saved().p_analysis.ai_available, false)
  assert.equal(mock.saved().p_related_report_id, lost.id)
  assert.ok(mock.calls.every((c) => !c.url.includes('model.example')))
})
