import { test } from 'vitest'
import assert from 'node:assert/strict'
import { createInformationWorker } from '../supabase/functions/_shared/campus-information-worker.js'

function fixture({ content = '图书馆刚捡到蓝色雨伞，请失主联系13812345678', result = { kind: 'found', keywords: ['蓝色', '雨伞'] }, deny = false, failModel = false, envOverrides = {} } = {}) {
  const calls = []; let reserved = false
  const job = { id: 'chat-job', target_id: 'message-id', kind: 'chat-analysis', claim_token: 'lease' }
  const env = { SUPABASE_URL: 'https://campus.example', SUPABASE_SERVICE_ROLE_KEY: 'test-service',
    CAMPUS_WORKER_TOKEN: 'test-worker-token-at-least-32-characters', AUV_BASE_URL: 'https://ai.example/v1', AUV_API_KEY: 'test-key', AUV_EXTRACT_MODEL: 'extract-test', ...envOverrides }
  const fetcher = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : null
    calls.push({ url, body })
    if (url.endsWith('/rpc/campus_claim_information_jobs')) return Response.json([job])
    if (url.includes('/hall_messages?')) return Response.json([{ content, deleted_at: null }])
    if (url.endsWith('/rpc/campus_begin_hall_analysis')) {
      if (deny || reserved) return Response.json({ allowed: false })
      reserved = true; return Response.json({ allowed: true, content })
    }
    if (url.startsWith('https://ai.example/')) {
      if (failModel) throw new Error('simulated upstream timeout')
      return Response.json({ choices: [{ message: { content: JSON.stringify(result) } }], usage: { prompt_tokens: 123, completion_tokens: 25 } })
    }
    if (url.endsWith('/rpc/campus_complete_hall_analysis')) return Response.json(true)
    return Response.json(null)
  }
  const run = async () => {
    const response = await createInformationWorker(env, fetcher)(new Request('https://worker.example', { method: 'POST', headers: { 'x-campus-worker-token': env.CAMPUS_WORKER_TOKEN } }))
    return response.json()
  }
  return { run, calls, modelCalls: () => calls.filter(c => c.url.startsWith('https://ai.example/')),
    complete: () => calls.filter(c => c.url.endsWith('/rpc/campus_complete_hall_analysis')) }
}

test('chat analysis reserves one call before using a small redacted single-message model request', async () => {
  const f = fixture(); const response = await f.run()
  assert.deepEqual(response.results, ['chat-analyzed'])
  assert.equal(f.modelCalls().length, 1)
  const request = f.modelCalls()[0].body
  assert.equal(request.max_tokens, 160)
  assert.equal(request.messages.length, 2)
  assert.ok(new TextEncoder().encode(JSON.stringify(request.messages)).length <= 2400)
  assert.ok(!JSON.stringify(request).includes('13812345678'))
  assert.ok(!JSON.stringify(request).includes('message-id'))
  assert.ok(f.calls.findIndex(c => c.url.endsWith('/rpc/campus_begin_hall_analysis')) < f.calls.findIndex(c => c.url.startsWith('https://ai.example/')))
  const completed = f.complete()[0].body
  assert.deepEqual(completed.p_analysis, { kind: 'found', location_id: 'library', keywords: ['蓝色', '雨伞'], verified: false })
  assert.equal(completed.p_model_used, true)
  assert.deepEqual(completed.p_usage, { input_tokens: 123, output_tokens: 25 })
  assert.ok(!('recipient_ids' in completed))
})

for (const content of ['你好呀！', '谢谢', '', 'hi', '大家晚上好']) {
  test(`small talk ${JSON.stringify(content)} is recorded as none without a model reservation`, async () => {
    const f = fixture({ content }); const response = await f.run()
    assert.deepEqual(response.results, ['chat-skipped'])
    assert.equal(f.modelCalls().length, 0)
    assert.ok(!f.calls.some(c => c.url.endsWith('/rpc/campus_begin_hall_analysis')))
    assert.equal(f.complete()[0].body.p_analysis.kind, 'none')
    assert.equal(f.complete()[0].body.p_model_used, false)
  })
}

test('denied reservation does not call a model or fabricate a successful result', async () => {
  const f = fixture({ deny: true }); const response = await f.run()
  assert.deepEqual(response.results, ['chat-skipped'])
  assert.equal(f.modelCalls().length, 0)
  assert.equal(f.complete().length, 0)
})

test('a model timeout followed by job retry cannot make a second model call', async () => {
  const f = fixture({ failModel: true })
  await f.run(); await f.run()
  assert.equal(f.modelCalls().length, 1)
  assert.equal(f.complete().length, 0)
  assert.ok(f.calls.some(c => c.url.endsWith('/rpc/campus_finish_information_job') && c.body.p_error))
})

for (const result of [
  { kind: 'found', keywords: ['不在原文的词'] },
  { kind: 'found', keywords: ['雨伞'], recipient_ids: ['injected-user'] },
  { kind: 'unknown', keywords: [] },
]) {
  test('invalid or recipient-bearing model output never produces a notification completion', async () => {
    const f = fixture({ result }); const response = await f.run()
    assert.deepEqual(response.results, ['invalid_ai_result'])
    assert.equal(f.complete().length, 0)
  })
}

test('the model cannot turn the hall region or its own guessed place into an explicit location', async () => {
  const f = fixture({ content: '捡到蓝色雨伞', result: { kind: 'found', keywords: ['蓝色', '雨伞'] } })
  await f.run(); assert.equal(f.complete()[0].body.p_analysis.location_id, null)
})

test('a sport mentioned as an interest is not treated as an exact sports-ground location', async () => {
  const f = fixture({ content: '周末有人一起打篮球吗', result: { kind: 'notice', keywords: ['篮球'] } })
  await f.run(); assert.equal(f.complete()[0].body.p_analysis.location_id, null)
})

test('email, account identifiers and contact handles stay out of the single-message model input', async () => {
  const content = '图书馆捡到蓝色雨伞，a@example.invalid，微信abc123456，12345678-1234-4234-8234-123456789012'
  const f = fixture({ content }); await f.run()
  const input = JSON.stringify(f.modelCalls()[0].body.messages)
  for (const secret of ['a@example.invalid', 'abc123456', '12345678-1234-4234-8234-123456789012']) assert.ok(!input.includes(secret))
})

test('a message longer than the database text limit is rejected before reserving or calling AI', async () => {
  const f = fixture({ content: '文'.repeat(201) }); const response = await f.run()
  assert.deepEqual(response.results, ['invalid_ai_input'])
  assert.equal(f.modelCalls().length, 0)
  assert.ok(!f.calls.some(c => c.url.endsWith('/rpc/campus_begin_hall_analysis')))
})


test('hall understanding defaults to the general flash model independently of extract and persona', async () => {
  const f = fixture({ envOverrides: { AUV_EXTRACT_MODEL: 'v10-extract', AUV_PERSONA_MODEL: 'v10-extract' } })
  await f.run()
  assert.equal(f.modelCalls()[0].body.model, 'qwen3.7-flash')
  assert.equal(f.modelCalls()[0].body.enable_thinking, false)
})

for (const model of ['qwen3.7-flash', 'qwen3.7-flash-2026-07-15']) {
  test(`the explicit hall model ${model} uses the non-thinking compact-output mode`, async () => {
    const f = fixture({ envOverrides: { AUV_HALL_MODEL: `  ${model}  ` } })
    await f.run()
    assert.equal(f.modelCalls()[0].body.model, model)
    assert.equal(f.modelCalls()[0].body.enable_thinking, false)
    assert.equal(f.modelCalls()[0].body.max_tokens, 160)
  })
}

for (const model of ['custom-compact-hall-model', 'qwen3.7-flash-preview']) {
  test(`a separately configured hall model ${model} does not receive unsupported thinking parameters`, async () => {
    const f = fixture({ envOverrides: { AUV_HALL_MODEL: model } })
    await f.run()
    assert.equal(f.modelCalls()[0].body.model, model)
    assert.ok(!('enable_thinking' in f.modelCalls()[0].body))
  })
}

test('a blank optional hall model uses the safe general-model default', async () => {
  const f = fixture({ envOverrides: { AUV_HALL_MODEL: '  ' } })
  await f.run()
  assert.equal(f.modelCalls()[0].body.model, 'qwen3.7-flash')
})

test('legacy event-extraction JSON is rejected rather than treated as a compact hall interpretation', async () => {
  const f = fixture({ result: { event_type: 'found', building_id: 'library', description: '蓝色雨伞', advice: '联系失主' } })
  const response = await f.run()
  assert.deepEqual(response.results, ['invalid_ai_result'])
  assert.equal(f.complete().length, 0)
  assert.equal(f.modelCalls().length, 1)
})
