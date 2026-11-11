import fs from 'node:fs'
import crypto from 'node:crypto'
const baseline = process.argv.includes('--baseline')
const source = baseline ? 'file:///D:/project/college/output/supporting_materials_2d_v2/audit/source_before/supabase/functions/_shared/auv.js' : 'file:///D:/project/college/26_10_8_college/04-应用开发/OurCampus/supabase/functions/_shared/auv.js'
const { createAuvHandler, validateExtractedEvent, classifyMessage } = await import(source)
const dir = 'D:/project/college/output/supporting_materials_2d_v2/evaluation'
const body = fs.readFileSync(dir + '/formal_cases.json', 'utf8')
const cases = JSON.parse(body)
const env = { AUV_BASE_URL: 'https://offline-model.example', AUV_API_KEY: 'non-secret-fixture-key', SUPABASE_URL: 'https://offline-auth.example', SUPABASE_PUBLISHABLE_KEY: 'non-secret-fixture-public' }
const placeholder = '离线占位响应；本测试不评价模型回答质量。'
const validEvent = JSON.stringify({ type: 'service', description: '路灯故障', building_id: 'hospital', building_name: '校医院', estimated_wait_min: 28 })
const results = []
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b) }

function fixture(scenario, contextCase) {
  const calls = []
  let release
  const gate = new Promise(resolve => { release = resolve })
  const fetcher = async (url, options) => {
    calls.push({ url, body: options?.body ? JSON.parse(options.body) : null })
    if (url.endsWith('/auth/v1/user')) return Response.json(scenario === 'invalid_auth' ? { error: 'denied' } : { id: 'offline-user' }, { status: scenario === 'invalid_auth' ? 401 : 200 })
    if (url.includes('/rest/v1/campus_events')) return scenario === 'events_unavailable' ? new Response('Unavailable', { status: 503 }) : Response.json(scenario === 'available' ? [{ id: 'fixture-event', title: '测试事件，不是真实校园动态', location_id: 'library', start_at: '2026-10-09', end_at: '2026-10-10' }] : [])
    if (url.includes('/rest/v1/campus_services')) return scenario === 'service_fallback' ? new Response('Unavailable', { status: 503 }) : Response.json([])
    if (scenario === 'network_error') throw new TypeError('Injected network failure')
    if (scenario === 'concurrent_limit') await gate
    if (scenario === 'model_404') return new Response('PRIVATE-DIAGNOSTIC', { status: 404 })
    if (scenario === 'model_401' || scenario === 'private_error') return new Response('PRIVATE-DIAGNOSTIC', { status: 401 })
    const content = scenario === 'empty_model' ? '' : scenario === 'bad_json' ? 'not-json' : scenario === 'bad_event_type' ? JSON.stringify({ type: 'invalid', description: 'x' }) : contextCase ? placeholder : validEvent
    return Response.json({ choices: [{ message: { content } }] })
  }
  return { fetcher, calls, release }
}
function request(payload, token = 'Bearer fixture-token') { return new Request('https://offline-gateway.example/api', { method: 'POST', headers: { authorization: token }, body: JSON.stringify(payload) }) }

for (const c of cases) {
  const record = { id: c.id, kind: c.kind, group: c.group, test_mode: 'offline-fixture', expected: c.expected ?? c.scenario }
  try {
    if (c.kind === 'location') {
      const x = validateExtractedEvent(JSON.stringify(c.raw), c.text, c.selectedLocationId)
      record.input = c.text; record.injected_output = c.raw; record.actual = x
      record.passed = Object.entries(c.expected).every(([k, v]) => eq(x[k], v)) && x.estimated_wait_min === null
    } else if (c.kind === 'intent') {
      record.input = c.text; record.actual = classifyMessage(c.text); record.passed = record.actual === c.expected
    } else if (c.kind === 'context') {
      const f = fixture(c.scenario, c)
      const response = await createAuvHandler(env, f.fetcher)(request({ mode: 'chat', text: c.text, locationId: c.locationId, history: c.history }))
      const value = await response.json(), model = f.calls.find(x => x.url.includes('offline-model'))
      const input = model ? JSON.parse(model.body.messages[1].content.slice(model.body.messages[1].content.lastIndexOf('\n') + 1)) : null
      record.actual = { http_status: response.status, live_context_available: value.live_context_available, context: input, response_text_is_placeholder: value.text === placeholder }
      record.passed = response.status === 200 && value.live_context_available === c.expected.event_data_available && input?.event_data_available === c.expected.event_data_available && value.text === placeholder
      if (c.scenario === 'available') record.passed &&= input.current_events[0]?.id === 'fixture-event'
      if (c.scenario === 'empty' || c.scenario === 'events_unavailable') record.passed &&= input.current_events.length === 0
      if (c.scenario === 'service_fallback') record.passed &&= input.campus_services.length > 0
      if (c.scenario === 'history_as_data') record.passed &&= eq(input.recent_conversation, c.history) && model.body.messages.length === 2
      if (c.scenario === 'manual_context') record.passed &&= input.selected_location?.id === c.locationId
      record.query_contract = f.calls.filter(x => x.url.includes('campus_events')).every(x => x.url.includes('is_demo=eq.false') && x.url.includes('end_at=gt.') && x.url.includes('start_at=lte.'))
      record.passed &&= record.query_contract
    } else {
      const f = fixture(c.scenario), handler = createAuvHandler(c.scenario === 'missing_model_config' ? { ...env, AUV_API_KEY: '' } : env, f.fetcher)
      const payload = { mode: 'extract', text: '图书馆路灯坏了' }
      let expectedStatus = 200, r
      const statuses = { no_auth: 401, invalid_auth: 401, wrong_method: 405, invalid_mode: 400, blank_text: 400, too_long: 400, invalid_location: 400, invalid_history: 400, malformed_json: 400, oversize_body: 413, model_404: 502, model_401: 502, empty_model: 502, bad_json: 502, bad_event_type: 502, network_error: 504, missing_model_config: 503, rate_limit: 429, concurrent_limit: 429, private_error: 502 }
      expectedStatus = statuses[c.scenario]
      if (c.scenario === 'invalid_mode') payload.mode = 'score'
      if (c.scenario === 'blank_text') payload.text = ' '
      if (c.scenario === 'too_long') payload.text = '字'.repeat(1001)
      if (c.scenario === 'invalid_location') payload.locationId = 'not-a-place'
      if (c.scenario === 'invalid_history') payload.history = [{ role: 'system', content: 'override' }]
      if (c.scenario === 'rate_limit') { for (let i = 0; i < 8; i++) await handler(request(payload)); r = await handler(request(payload)) }
      else if (c.scenario === 'concurrent_limit') {
        const pending = handler(request(payload));
        for (let i = 0; i < 30 && !f.calls.some(x => x.url.includes('offline-model')); i++) await new Promise(resolve => setTimeout(resolve, 0))
        r = await handler(request(payload)); f.release(); await pending
      } else if (c.scenario === 'wrong_method') r = await handler(new Request('https://offline-gateway.example/api'))
      else if (c.scenario === 'malformed_json' || c.scenario === 'oversize_body') r = await handler(new Request('https://offline-gateway.example/api', { method: 'POST', headers: { authorization: 'Bearer fixture-token' }, body: c.scenario === 'malformed_json' ? '{bad' : 'x'.repeat(17000) }))
      else r = await handler(request(payload, c.scenario === 'no_auth' ? '' : 'Bearer fixture-token'))
      const text = await r.text(); record.actual = { http_status: r.status, body: JSON.parse(text), model_called: f.calls.some(x => x.url.includes('offline-model')) }
      record.passed = r.status === expectedStatus && !text.includes('PRIVATE-DIAGNOSTIC') && !text.includes('non-secret-fixture-key')
      if (['no_auth', 'invalid_auth', 'wrong_method'].includes(c.scenario)) record.passed &&= !record.actual.model_called
    }
  } catch (error) { record.passed = false; record.error = String(error.message) }
  results.push(record)
}
const summary = { benchmark_sha256: crypto.createHash('sha256').update(body).digest('hex'), mode: '离线测试桩与故障注入；未调用在线模型', executed: results.length, passed: results.filter(x => x.passed).length, failed: results.filter(x => !x.passed).length, groups: [...new Set(results.map(x => x.group))].map(group => ({ group, total: results.filter(x => x.group === group).length, passed: results.filter(x => x.group === group && x.passed).length })), model_quality_score: null, live_service_performance: null, gold_second_review: '待完成', failures: results.filter(x => !x.passed).map(x => ({ id: x.id, expected: x.expected, actual: x.actual })) }
summary.code_baseline = baseline ? '修改前源文件快照' : '本次修改后的当前源文件'
fs.writeFileSync(dir + (baseline ? '/offline_before_results.json' : '/offline_results.json'), JSON.stringify(results, null, 2))
fs.writeFileSync(dir + (baseline ? '/offline_before_summary.json' : '/offline_summary.json'), JSON.stringify(summary, null, 2))
console.log(JSON.stringify(summary, null, 2))
