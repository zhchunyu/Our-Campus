import test from 'node:test'
import assert from 'node:assert/strict'
import { createInformationWorker } from '../supabase/functions/_shared/campus-information-worker.js'
import { EXTRACT_INSTRUCTION } from '../supabase/functions/_shared/auv.js'

async function analyzeReport({ kind = 'construction', baseUrl = 'https://model.example', extractModel, personaModel } = {}) {
  const calls = []
  let saved
  const lostFound = ['lost', 'found'].includes(kind)
  const report = { id: 'report-id', author_id: 'member-a', kind, status: 'submitted', title: lostFound ? '白色耳机' : '图书馆施工', body: lostFound ? '图书馆发现白色耳机' : '图书馆施工，请绕行', location_id: 'library', details: {} }
  const env = { AUV_BASE_URL: baseUrl, AUV_API_KEY: 'provider-test-only', AUV_EXTRACT_MODEL: extractModel, AUV_PERSONA_MODEL: personaModel, SUPABASE_URL: 'https://campus.example', SUPABASE_SERVICE_ROLE_KEY: 'service-test-only', CAMPUS_WORKER_TOKEN: 'test-worker-token-at-least-32-characters' }
  const fetcher = async (url, options = {}) => {
    calls.push({ url, options })
    if (url.endsWith('/rpc/campus_claim_information_jobs')) return Response.json([{ id: 'job', kind: 'analysis', target_id: report.id, claim_token: 'test-lease' }])
    if (url.includes('campus_reports?id=eq.report-id')) return Response.json([report])
    if (url.startsWith('https://model.example')) {
      const content = lostFound ? { summary: '白色耳机线索', keywords: ['白色', '耳机'] } : { type: 'notice', description: '图书馆施工', advice: '请绕行', building_id: 'library', building_name: '图书馆', floor: null, estimated_wait_min: null, time_window: 'unknown' }
      return Response.json({ choices: [{ message: { content: JSON.stringify(content) } }] })
    }
    if (url.endsWith('/rpc/campus_complete_information_analysis')) { saved = JSON.parse(options.body); return Response.json(true) }
    if (url.includes('/campus_reports?') || url.includes('/campus_events?')) return Response.json([])
    return Response.json(null)
  }
  const reply = await createInformationWorker(env, fetcher)(new Request('https://worker.example', { method: 'POST', headers: { 'x-campus-worker-token': env.CAMPUS_WORKER_TOKEN } }))
  assert.equal(reply.status, 200)
  assert.deepEqual((await reply.json()).results, ['analyzed'])
  assert.equal(saved.p_analysis.generated_by, 'auv')
  assert.equal(saved.p_analysis.summary, lostFound ? '白色耳机线索' : '图书馆施工')
  const modelCalls = calls.filter(({ url }) => url.startsWith('https://model.example'))
  assert.equal(modelCalls.length, 1)
  return { call: modelCalls[0], payload: JSON.parse(modelCalls[0].options.body), saved }
}

for (const kind of ['construction', 'lost', 'found']) {
  test(`information worker preserves legacy ${kind} model alias and analysis branch`, async () => {
    const { call, payload, saved } = await analyzeReport({ kind })
    assert.equal(call.url, 'https://model.example/v1/chat/completions')
    assert.equal(payload.model, kind === 'construction' ? 'extract' : 'persona')
    if (kind === 'construction') {
      assert.equal(payload.messages[0].content, EXTRACT_INSTRUCTION)
      assert.equal(saved.p_analysis.public_notice_candidate, true)
    } else {
      assert.ok(payload.messages[0].content.includes('summary'))
      assert.deepEqual(saved.p_analysis.keywords, ['白色', '耳机'])
    }
  })
}
for (const [baseUrl, endpoint] of [
  ['https://model.example///', 'https://model.example/v1/chat/completions'],
  ['https://model.example/compatible-mode', 'https://model.example/compatible-mode/v1/chat/completions'],
  ['https://model.example/compatible-mode/v1', 'https://model.example/compatible-mode/v1/chat/completions'],
  ['  https://model.example/compatible-mode/v1///  ', 'https://model.example/compatible-mode/v1/chat/completions'],
]) {
  test(`information worker normalizes the configured API base ${baseUrl}`, async () => {
    const { call } = await analyzeReport({ baseUrl })
    assert.equal(call.url, endpoint)
  })
}
for (const kind of ['construction', 'lost', 'found']) {
  test(`information worker maps ${kind} to its configured provider model without changing prompts`, async () => {
    const { payload } = await analyzeReport({ kind, extractModel: ' provider-extract ', personaModel: ' provider-persona ' })
    assert.equal(payload.model, kind === 'construction' ? 'provider-extract' : 'provider-persona')
    assert.equal(payload.messages[0].content === EXTRACT_INSTRUCTION, kind === 'construction')
  })
}
for (const kind of ['construction', 'lost']) {
  test(`information worker can use a single deployed model for ${kind}`, async () => {
    const { payload } = await analyzeReport({ kind, extractModel: 'provider-shared', personaModel: 'provider-shared' })
    assert.equal(payload.model, 'provider-shared')
    assert.equal(payload.messages[0].content === EXTRACT_INSTRUCTION, kind === 'construction')
  })
  test(`information worker falls back from empty model settings for ${kind}`, async () => {
    const { payload } = await analyzeReport({ kind, extractModel: '  ', personaModel: '' })
    assert.equal(payload.model, kind === 'construction' ? 'extract' : 'persona')
  })
}
