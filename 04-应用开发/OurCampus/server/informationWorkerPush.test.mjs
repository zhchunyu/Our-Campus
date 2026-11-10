import test from 'node:test'
import assert from 'node:assert/strict'
import { createInformationWorker } from '../supabase/functions/_shared/campus-information-worker.js'

const noticeId = '11111111-1111-4111-8111-111111111111'
const messageId = '22222222-2222-4222-8222-222222222222'
const notification = { id: noticeId, recipient_id: 'recipient-a', type: 'hall-message', related_type: 'message', related_id: messageId, dedupe_key: `hall-message:${messageId}`, read_at: null, title: '社区新消息', body: '不应直接放进系统通知的聊天正文', context: {} }
function fixture({ contexts = [{ deliverable: true, region_id: 'living', message_id: messageId }], notice = notification, rpcError = false, event = null, reports = [], subscriptions = [], rejectFirstPush = false, devices = [{ id: 'device-a', cid: 'cid-a' }] } = {}) {
  const calls = []
  let contextIndex = 0
  let sendCount = 0
  const env = { SUPABASE_URL: 'https://campus.example', SUPABASE_SERVICE_ROLE_KEY: 'service-test-only', CAMPUS_WORKER_TOKEN: 'test-worker-token-at-least-32-characters', GETUI_APP_ID: 'push-test-app', GETUI_APP_KEY: 'push-test-key', GETUI_MASTER_SECRET: 'push-test-secret' }
  const fetcher = async (url, options = {}) => {
    calls.push({ url, options })
    if (url.endsWith('/rpc/campus_claim_information_jobs')) return Response.json([{ id: 'push-job', kind: 'push', target_id: noticeId, claim_token: 'test-lease' }])
    if (url.includes('/notifications?id=')) return Response.json(notice ? [notice] : [])
    if (url.endsWith('/rpc/campus_hall_push_context')) {
      assert.deepEqual(JSON.parse(options.body), { p_notification_id: noticeId })
      if (rpcError) return Response.json({ error: 'not available' }, { status: 503 })
      return Response.json(contexts[Math.min(contextIndex++, contexts.length - 1)])
    }
    if (url.includes('/campus_events?')) return Response.json(event ? [event] : [])
    if (url.includes('/campus_reports?')) return Response.json(reports)
    if (url.includes('/campus_subscriptions?')) return Response.json(subscriptions)
    if (url.includes('/campus_push_devices?')) {
      assert.ok(url.includes('user_id=eq.recipient-a'))
      assert.ok(url.includes('enabled=eq.true'))
      return Response.json(devices)
    }
    if (url.includes('/campus_push_receipts?')) return options.method === 'POST' ? Response.json(null) : Response.json([])
    if (url.endsWith('/auth')) return Response.json({ code: 0, data: { token: 'provider-test-token', expire_time: Date.now() + 3600000 } })
    if (url.endsWith('/push/single/cid')) return Response.json(rejectFirstPush && sendCount++ === 0 ? { code: 10001 } : { code: 0, data: { task: { cid: 'successed_online' } } })
    return Response.json(null)
  }
  const run = () => createInformationWorker(env, fetcher)(new Request('https://worker.example', { method: 'POST', headers: { 'x-campus-worker-token': env.CAMPUS_WORKER_TOKEN } }))
  return { calls, run, providerCalls: () => calls.filter(({ url }) => url.startsWith('https://restapi.getui.com/')), sends: () => calls.filter(({ url }) => url.endsWith('/push/single/cid')) }
}

for (const reason of ['unsubscribed', 'message-deleted', 'self-authored']) {
  test(`hall push does not contact the provider when database authorization denies ${reason}`, async () => {
    const mock = fixture({ contexts: [{ deliverable: false }] })
    const reply = await mock.run()
    assert.equal(reply.status, 200)
    assert.deepEqual((await reply.json()).results, ['skipped'])
    assert.ok(mock.calls.some(({ url }) => url.endsWith('/rpc/campus_hall_push_context')))
    assert.equal(mock.providerCalls().length, 0)
    assert.ok(!mock.calls.some(({ url }) => url.includes('/campus_push_devices?')))
  })
}

test('hall push fails closed when its authorization RPC is unavailable', async () => {
  const mock = fixture({ rpcError: true })
  const reply = await mock.run()
  assert.deepEqual((await reply.json()).results, ['processing_failed'])
  assert.equal(mock.providerCalls().length, 0)
})

test('hall push rechecks subscription and message validity immediately before delivery', async () => {
  const mock = fixture({ contexts: [{ deliverable: true, region_id: 'living', message_id: messageId }, { deliverable: false }] })
  await mock.run()
  assert.ok(mock.calls.filter(({ url }) => url.endsWith('/rpc/campus_hall_push_context')).length >= 2)
  assert.equal(mock.sends().length, 0)
  assert.ok(!mock.calls.some(({ url, options }) => url.includes('/campus_push_receipts?') && options.method === 'POST'))
})

test('valid hall push targets only the recipient devices and keeps message text out of system notifications', async () => {
  const mock = fixture({ devices: [{ id: 'device-a', cid: 'cid-a' }, { id: 'device-b', cid: 'cid-b' }] })
  const reply = await mock.run()
  assert.deepEqual((await reply.json()).results, ['processed'])
  assert.deepEqual(mock.sends().map(({ options }) => JSON.parse(options.body).audience.cid), [['cid-a'], ['cid-b']])
  for (const { options } of mock.sends()) {
    assert.ok(!options.body.includes(notification.body))
    assert.ok(JSON.parse(options.body).push_message.notification.intent.includes(`S.campusNoticeId=${noticeId}`))
  }
  const receipts = mock.calls.filter(({ url, options }) => url.includes('/campus_push_receipts?') && options.method === 'POST').map(({ options }) => JSON.parse(options.body))
  assert.deepEqual(receipts.map(({ notification_id, device_id }) => [notification_id, device_id]), [[noticeId, 'device-a'], [noticeId, 'device-b']])
})

test('already-read hall notifications never request authorization or contact the provider', async () => {
  const mock = fixture({ notice: { ...notification, read_at: new Date().toISOString() } })
  await mock.run()
  assert.equal(mock.providerCalls().length, 0)
  assert.ok(!mock.calls.some(({ url }) => url.endsWith('/rpc/campus_hall_push_context')))
})

const eventId = '33333333-3333-4333-8333-333333333333'
const otherReportId = '44444444-4444-4444-8444-444444444444'
const eventNotice = { ...notification, type: 'campus-event', related_type: 'event', related_id: eventId, dedupe_key: `information-event:${eventId}:2` }
const activeEvent = { status: 'active', end_at: new Date(Date.now() + 3600000).toISOString(), information_revision: 2, information_scope: 'all', location_id: 'library', information_kind: 'construction' }
for (const [reason, event, notice] of [
  ['missing', null, eventNotice],
  ['inactive', { ...activeEvent, status: 'draft' }, eventNotice],
  ['expired', { ...activeEvent, end_at: '2020-01-01T00:00:00Z' }, eventNotice],
  ['stale-revision', activeEvent, { ...eventNotice, dedupe_key: `information-event:${eventId}:1` }],
  ['unsubscribed', { ...activeEvent, information_scope: 'subscribed' }, eventNotice],
]) {
  test(`existing event delivery guard still denies ${reason} notifications`, async () => {
    const mock = fixture({ notice, event })
    const reply = await mock.run()
    assert.deepEqual((await reply.json()).results, ['skipped'])
    assert.equal(mock.providerCalls().length, 0)
  })
}

test('valid public event notification retains its recipient filter and remaining-time TTL', async () => {
  const mock = fixture({ notice: eventNotice, event: activeEvent })
  const reply = await mock.run()
  assert.deepEqual((await reply.json()).results, ['processed'])
  assert.equal(mock.sends().length, 1)
  const ttl = JSON.parse(mock.sends()[0].options.body).settings.ttl
  assert.ok(ttl >= 1000 && ttl <= 3600000)
  assert.ok(mock.calls.filter(({ url }) => url.includes('/campus_events?')).length >= 2)
})

test('existing lost-match guard denies a pair if either original report is no longer active', async () => {
  const notice = { ...notification, type: 'lost-match', related_type: 'lost-found', related_id: messageId, dedupe_key: `lost-match:${messageId}:${otherReportId}` }
  const mock = fixture({ notice, reports: [{ id: messageId, status: 'analyzed' }, { id: otherReportId, status: 'resolved' }] })
  const reply = await mock.run()
  assert.deepEqual((await reply.json()).results, ['skipped'])
  assert.equal(mock.providerCalls().length, 0)
})

test('existing lost-subscription guard denies notifications after the recipient unsubscribes', async () => {
  const notice = { ...notification, type: 'lost-subscription', related_type: 'lost-found', related_id: messageId, dedupe_key: `lost-subscription:${messageId}` }
  const mock = fixture({ notice, reports: [{ id: messageId, status: 'submitted', kind: 'found', location_id: 'library' }] })
  const reply = await mock.run()
  assert.deepEqual((await reply.json()).results, ['skipped'])
  assert.equal(mock.providerCalls().length, 0)
})

test('hall authorization is checked again after provider authentication expires before retry', async () => {
  const allowed = { deliverable: true, region_id: 'living', message_id: messageId }
  const mock = fixture({ contexts: [allowed, allowed, { deliverable: false }], rejectFirstPush: true })
  const reply = await mock.run()
  assert.deepEqual((await reply.json()).results, ['skipped'])
  assert.equal(mock.sends().length, 1)
  assert.equal(mock.calls.filter(({ url }) => url.endsWith('/auth')).length, 2)
  assert.ok(!mock.calls.some(({ url, options }) => url.includes('/campus_push_receipts?') && options.method === 'POST'))
})
