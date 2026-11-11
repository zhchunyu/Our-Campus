import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PERSONA_INSTRUCTION } from '../backend/_shared/auv.js'
import { buildModelContext, INPUT_BUDGET, INPUT_BYTE_BUDGET, queryLiveContext, sanitizeClientContext, utf8Length } from '../backend/_shared/live-context.js'

const now = Date.parse('2026-11-10T08:00:00Z')
const userId = '11111111-1111-4111-8111-111111111111'
const sourceId = '22222222-2222-4222-8222-222222222222'
const noticeId = '33333333-3333-4333-8333-333333333333'
const oldEventId = '44444444-4444-4444-8444-444444444444'
const message = { id: sourceId, region_id: 'teaching', content: 'Synthetic older chat fixture', created_at: '2026-11-09T08:00:00Z', deleted_at: null }
const notice = { id: noticeId, recipient_id: userId, type: 'hall-message', title: '校园聊天有新消息', body: '你关注的地区有新聊天消息，打开查看。', related_type: 'message', related_id: sourceId, read_at: null, created_at: '2026-11-10T07:59:00Z' }
const auvSource = readFileSync(new URL('../backend/_shared/auv.js', import.meta.url), 'utf8')
const knowledge = /const KNOWLEDGE_INSTRUCTION = `([\s\S]*?)`/.exec(auvSource)[1]
const instruction = PERSONA_INSTRUCTION + '\n' + knowledge

function fixture({ notices = [], messages = [], hall = [], events = [], failMessages = false } = {}) {
  const calls = []
  return { calls, fetchData: async (url, options) => {
    const parsed = new URL(url); const table = parsed.pathname.split('/').at(-1); const params = parsed.searchParams
    calls.push({ table, params, headers: options.headers })
    let rows = []
    if (table === 'notifications') rows = notices.filter((row) => params.get('recipient_id') === 'eq.' + row.recipient_id)
    if (table === 'hall_messages') {
      if (params.has('id')) {
        if (failMessages) return { ok: false, text: '[]' }
        rows = messages.filter((row) => params.get('id').includes(row.id))
      } else rows = hall
      if (params.get('deleted_at') === 'is.null') rows = rows.filter((row) => !row.deleted_at)
      if (params.has('created_at')) rows = rows.filter((row) => Date.parse(row.created_at) >= Date.parse(params.get('created_at').slice(4)))
    }
    if (table === 'campus_events') rows = params.has('id') ? events.filter((row) => params.get('id').includes(row.id)) : []
    const limit = Number(params.get('limit') ?? 1000)
    return { ok: true, text: JSON.stringify(rows.slice(0, limit)) }
  } }
}
async function query(mock, text = '我有哪些新消息？') {
  const input = { text, history: [], locationId: null, clientContext: { status: 'not_provided' } }
  const context = await queryLiveContext({ supabaseUrl: 'https://campus.example', supabaseKey: 'public-fixture', authorization: 'Bearer user-fixture', userId, input, mentioned: [], fetchData: mock.fetchData, now })
  return { input, context }
}
function model(input, context) { return JSON.parse(buildModelContext(input, context, instruction, []).content) }

test('personal message notices resolve their live source independently of the two-hour hall sample', async () => {
  const mock = fixture({ notices: [notice], messages: [message] })
  const { input, context } = await query(mock)
  assert.equal(context.hall.length, 0)
  assert.equal(context.notifications.length, 1)
  assert.equal(context.notifications[0].body, message.content)
  assert.equal(context.notifications[0].verification, 'unverified')
  assert.equal(context.notifications[0].source_message_id, sourceId)
  const fact = model(input, context).facts.find((row) => row.id === noticeId)
  assert.equal(fact.verification, 'unverified')
  assert.equal(fact.related_type, 'message')
  assert.equal(fact.related_id, sourceId)
  const lookup = mock.calls.find((call) => call.table === 'hall_messages' && call.params.has('id'))
  assert.equal(lookup.params.get('deleted_at'), 'is.null')
  assert.ok(lookup.params.get('id').includes(sourceId))
  assert.ok(mock.calls.every((call) => call.headers.authorization === 'Bearer user-fixture' && call.headers.apikey === 'public-fixture'))
})
test('filters ended notices before keeping six current notices from a bounded candidate window', async () => {
  const expired = Array.from({ length: 8 }, (_, i) => ({ ...notice, id: 'expired-' + i, type: 'campus-event', related_type: 'event', related_id: oldEventId }))
  const mock = fixture({ notices: [...expired, notice], messages: [message], events: [{ id: oldEventId, status: 'closed', start_at: '2026-11-08T00:00:00Z', end_at: '2026-11-09T00:00:00Z' }] })
  const { context } = await query(mock)
  assert.deepEqual(context.notifications.map((row) => row.id), [noticeId])
  const queryLimit = Number(mock.calls.find((call) => call.table === 'notifications').params.get('limit'))
  assert.ok(queryLimit > 7 && queryLimit <= 25)
})
test('retracted, deleted or RLS-invisible source messages never enter notification facts', async () => {
  for (const messages of [[], [{ ...message, deleted_at: '2026-11-10T07:00:00Z' }]]) {
    const { input, context } = await query(fixture({ notices: [notice], messages }))
    assert.equal(context.notifications.length, 0)
    assert.ok(!model(input, context).facts.some((row) => row.id === noticeId))
  }
})
test('a failed source lookup remains visibly incomplete, with no invented chat fact', async () => {
  const { input, context } = await query(fixture({ notices: [notice], failMessages: true }))
  assert.equal(context.notifications.length, 0)
  assert.equal(context.status.sources.notifications.read_ok, false)
  assert.ok(/notifications:(?:partial|failed)/.test(model(input, context).source_status))
})
test('failure of a chat lookup preserves independently readable current event notices', async () => {
  const eventNotice = { ...notice, id: 'event-notice', related_type: 'event', related_id: oldEventId, type: 'campus-event' }
  const event = { id: oldEventId, status: 'active', title: 'Synthetic active event', impact: 'Synthetic current event', location_id: 'library', start_at: '2026-11-10T06:00:00Z', end_at: '2026-11-11T06:00:00Z', updated_at: '2026-11-10T07:00:00Z' }
  const { context } = await query(fixture({ notices: [notice, eventNotice], events: [event], failMessages: true }))
  assert.deepEqual(context.notifications.map((row) => row.id), ['event-notice'])
  assert.equal(context.status.sources.notifications.partial_read_ok, true)
})
test('recipient filtering cannot turn another account notice into a fact', async () => {
  const { context } = await query(fixture({ notices: [{ ...notice, recipient_id: sourceId }], messages: [message] }))
  assert.equal(context.notifications.length, 0)
})
for (const question of ['我有哪些新消息？', '我的动态有哪些？', '有给我的新提醒吗？']) {
  test('personal update phrasing can use recent unverified hall clues: ' + question, async () => {
    const { input, context } = await query(fixture({ hall: [{ ...message, created_at: '2026-11-10T07:50:00Z' }] }), question)
    const facts = model(input, context).facts
    assert.ok(facts.some((row) => row.source === 'hall' && row.id === sourceId && row.verification === 'unverified'))
  })
}
test('a personal message fact is prioritized ahead of incidental place records', async () => {
  const { input, context } = await query(fixture({ notices: [notice], messages: [message] }))
  context.locations = [{ id: 'library', name: '图书馆', open_status: 'unknown' }]
  context.status.sources.locations.count = 1
  assert.equal(model(input, context).facts[0].id, noticeId)
})
test('the real system instruction can retain multiple recent event facts instead of one', async () => {
  const { input, context } = await query(fixture(), '最近学校有什么新动态？')
  context.events = Array.from({ length: 12 }, (_, i) => ({ id: 'event-' + i, title: '校园活动记录' + i, location_id: 'library', impact: '这是一条虚构的校园活动摘要，提供时间地点及参与信息。', start_at: '2026-11-10T09:00:00Z', end_at: '2026-11-10T12:00:00Z', updated_at: '2026-11-10T08:00:00Z' }))
  context.status.sources.events.count = 12
  const payload = model(input, context)
  assert.ok(payload.facts.length >= 3, 'expected multiple useful event facts, got ' + payload.facts.length)
  assert.ok(payload.facts.length <= 4, 'per-source candidate limit must stay bounded')
  assert.equal(payload.context_truncated, true)
  assert.equal(context.status.sources.events.included_count, payload.facts.length)
  assert.equal(context.status.sources.events.context_truncated, true)
})
test('long ordinary questions stay complete while model input remains inside both configured budgets', async () => {
  const question = '背景说明。'.repeat(150) + '最后请回答我有哪些新消息？'
  const { input, context } = await query(fixture({ notices: [notice], messages: [message] }), question)
  const payload = model(input, context)
  assert.equal(payload.question, question)
  assert.ok(payload.facts.some((row) => row.id === noticeId))
  assert.ok(context.status.input_utf8_bytes <= INPUT_BYTE_BUDGET)
  assert.ok(context.status.input_equivalent_characters <= INPUT_BUDGET)
  assert.equal(utf8Length(instruction) + utf8Length(JSON.stringify(payload)), context.status.input_utf8_bytes)
})
test('truly oversized questions are rejected instead of silently trimmed', async () => {
  const { input, context } = await query(fixture(), '这是完整用户问题。'.repeat(1000))
  assert.throws(() => model(input, context), (error) => error.code === 'question_too_large')
})

function scheduleCourse(id, weekday, weeks, overrides = {}) {
  return { id, name: '合成课程' + id, classroom: '教室' + id, weekday, weeks, periods: [1, 2], startTime: '08:00', endTime: '09:40', ...overrides }
}
async function timetableQuery(timetable, question, fromCloud = false) {
  const mock = fixture()
  const input = { text: question, history: [], locationId: null, clientContext: sanitizeClientContext(fromCloud ? undefined : { capturedAt: new Date(now).toISOString(), timetable }, now) }
  const context = await queryLiveContext({ supabaseUrl: 'https://campus.example', supabaseKey: 'public-fixture', authorization: 'Bearer user-fixture', userId, input, mentioned: [], fetchData: async (url, options) => {
    if (fromCloud && new URL(url).pathname.endsWith('/campus_timetables')) return { ok: true, text: JSON.stringify([{ timetable }]) }
    return mock.fetchData(url, options)
  }, now })
  return { input, context }
}

for (const fromCloud of [false, true]) {
  test('explicit teaching-week planning retains that week rather than today or the first three courses (' + (fromCloud ? 'cloud' : 'client') + ')', async () => {
    const courses = [scheduleCourse('old1', 1, [1]), scheduleCourse('old2', 2, [2]), scheduleCourse('old3', 3, [3]), scheduleCourse('wed', 3, [8]), scheduleCourse('mon', 1, [8]), scheduleCourse('sun', 7, [8])]
    const { input, context } = await timetableQuery({ dateConfirmed: false, termStart: '2026-09-07', semester: '合成学期', courses, unscheduled: [{ name: '待排课程' }] }, '请根据我已关联的课表，规划第8教学周的学习和休息。按周一至周日安排；日期未校准时不要推算实际日期或当前教学周。', fromCloud)
    const timetable = model(input, context).personal_context.timetable
    assert.equal(timetable.requested_week, 8)
    assert.equal(timetable.calendar_status, 'unconfirmed')
    assert.deepEqual(timetable.courses.map(course => course.id), ['mon', 'wed', 'sun'])
    assert.ok(timetable.courses.every(course => course.classroom && course.startTime === '08:00' && course.endTime === '09:40'))
    assert.equal(timetable.date, undefined)
    assert.equal(timetable.next_course, undefined)
    assert.ok(timetable.courses.every(course => !course.starts_at && !course.ends_at))
    assert.deepEqual(timetable.unscheduled, [{ name: '待排课程' }])
  })
}

test('a calibrated requested week can use its dates even when the current date is outside the semester', async () => {
  const { input, context } = await timetableQuery({ dateConfirmed: true, termStart: '2024-09-02', courses: [scheduleCourse('selected', 2, [8]), scheduleCourse('unrelated', 2, [9])] }, '请规划第 8 教学周的学习和休息。')
  const timetable = model(input, context).personal_context.timetable
  assert.equal(timetable.requested_week, 8)
  assert.deepEqual(timetable.courses.map(course => course.id), ['selected'])
  assert.equal(timetable.courses[0].starts_at, '2024-10-22T08:00:00+08:00')
  assert.equal(timetable.courses[0].ends_at, '2024-10-22T09:40:00+08:00')
})

test('multiple requested weeks do not silently select one week', async () => {
  const { input, context } = await timetableQuery({ dateConfirmed: false, courses: [scheduleCourse('week8', 1, [8]), scheduleCourse('week9', 2, [9])] }, '比较第8教学周和第9教学周的安排。')
  const timetable = model(input, context).personal_context.timetable
  assert.equal(timetable.requested_week, undefined)
})

test('a requested-week schedule exceeding the model budget is marked incomplete while keeping its week identity', async () => {
  const courses = Array.from({ length: 50 }, (_, index) => scheduleCourse(String(index), index % 7 + 1, [8], { name: '合成课程名称'.repeat(10), classroom: '合成教室'.repeat(10) }))
  const { input, context } = await timetableQuery({ dateConfirmed: false, courses }, '请规划第8教学周的学习和休息。')
  const payload = model(input, context)
  assert.equal(payload.personal_context.timetable.requested_week, 8)
  assert.equal(payload.personal_context.timetable.scheduled_course_count, courses.length)
  assert.ok(payload.personal_context.timetable.courses.length < courses.length)
  assert.equal(payload.personal_context.timetable.truncated, true)
  assert.equal(context.status.timetable_truncated, true)
  assert.ok(context.status.input_utf8_bytes <= INPUT_BYTE_BUDGET)
  assert.ok(context.status.input_equivalent_characters <= INPUT_BUDGET)
})
