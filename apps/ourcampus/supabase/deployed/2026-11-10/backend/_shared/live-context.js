import { campusLocations, campusServiceFacts } from './campus-catalog.js'
import { campusDisplayText } from './campus-presentation.js'

const byId = new Map(campusLocations.map((location) => [location.id, location]))
const DAY = 86_400_000
const validId = (id) => typeof id === 'string' && byId.has(id)
const text = (value, limit = 160) => typeof value === 'string' ? [...campusDisplayText(value)].slice(0, limit).join('') : null
const iso = (value) => typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null
const fresh = (value, now, age) => iso(value) && now - Date.parse(value) <= age && Date.parse(value) - now <= 60_000
const array = (value) => Array.isArray(value) ? value : []
const cleanIds = (value) => [...new Set(array(value).filter(validId))].slice(0, 30)
const numbers = (value, max) => [...new Set(array(value).filter((number) => Number.isInteger(number) && number >= 1 && number <= max))].slice(0, max)
const time = (value) => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : null
const activeReportStatuses = new Set(['submitted', 'analyzed', 'published'])
const uuid = (value) => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
const currentLostRecord = (row) => row.source_table === 'campus_reports'
  ? activeReportStatuses.has(row.status) : row.status === 'active'

// These are candidate clues, never an assertion that an item belongs to the caller.
export function lostFoundMatches(question, records = []) {
  const operation = /(?:怎么|如何).*(?:发布|撤回|删除|结束|标记)|(?:发布|撤回|删除|结束|标记).*(?:怎么|如何)/.test(question)
  const foundByCaller = /我.{0,12}(捡到|拾到|捡了)|^(捡到|拾到|捡了)/.test(question)
  const lostByCaller = /我.{0,16}(丢|遗失|找不到)|丢了|丢失|遗失|寻物|有没有.{0,12}(捡到|招领)|有人.{0,8}捡|谁.{0,8}捡/.test(question)
  const wantedType = foundByCaller ? 'lost' : lostByCaller || /招领/.test(question) && !/失物招领/.test(question) ? 'found' : null
  const items = [['耳机', /耳机|airpods/i], ['校园卡', /校园卡|饭卡|一卡通/], ['学生证', /学生证/], ['身份证', /身份证/], ['手机', /手机/], ['钱包', /钱包/], ['钥匙', /钥匙/], ['水杯', /水杯|保温杯|水壶/], ['眼镜', /眼镜/], ['雨伞', /雨伞|伞/], ['书包', /书包|背包/], ['电脑', /电脑|笔记本电脑/], ['手表', /手表/]]
  const item = items.find(([, expression]) => expression.test(question))
  const requested = !operation && (/失物|招领|寻物|丢了|丢失|遗失|捡到|捡了|拾到/.test(question) || Boolean(item) && /找不到/.test(question))
  const direct = requested && !/停电|停水|施工|封路|开放|排队|课表|上课|收藏|订阅|另外|顺便|以及/.test(question)
  const colors = [/白色|纯白|乳白|米白/, /黑色|纯黑/, /蓝色|深蓝|浅蓝/, /红色|粉红/, /绿色|浅绿/, /黄色|浅黄/, /粉色/, /紫色/, /灰色|银色/]
  const color = colors.findIndex((expression) => expression.test(question))
  const matches = requested ? records.filter((row) => {
    if (!currentLostRecord(row) || wantedType && (row.type ?? row.kind) !== wantedType) return false
    if (wantedType && !item) return false
    const description = `${row.title ?? ''} ${row.description ?? row.body ?? ''}`
    if (item && !item[1].test(description)) return false
    const describedColors = colors.flatMap((expression, index) => expression.test(description) ? [index] : [])
    return color < 0 || !describedColors.length || describedColors.includes(color)
  }) : []
  return { requested, direct, wantedType, item: item?.[0] ?? null, matches }
}

function cleanRoute(value) {
  return value && validId(value.originId) && validId(value.destinationId)
    ? { originId: value.originId, destinationId: value.destinationId, mode: ['shortest', 'accessible', 'avoid-construction', 'rain', 'night', 'walk', 'bike'].includes(value.mode) ? value.mode : 'shortest' } : null
}

export function sanitizeTimetable(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.courses)) return null
  const courses = value.courses.slice(0, 100).flatMap((course) => {
    if (!course || !text(course.name, 80)) return []
    const startTime = time(course.startTime); const endTime = time(course.endTime)
    if (!Number.isInteger(course.weekday) || course.weekday < 1 || course.weekday > 7 || !startTime || !endTime || startTime >= endTime) return []
    return [{ id: text(course.id, 80), name: text(course.name, 80), classroom: text(course.classroom, 80), weekday: course.weekday, weeks: numbers(course.weeks, 60), periods: numbers(course.periods, 20), startTime, endTime }]
  })
  return { dateConfirmed: value.dateConfirmed === true, termStart: typeof value.termStart === 'string' && /^\d{4}-\d\d-\d\d$/.test(value.termStart) ? value.termStart : null, semester: text(value.semester, 40), courses, unscheduled: array(value.unscheduled).slice(0, 8).map((course) => ({ name: text(course?.name, 80) })).filter((course) => course.name), truncated: value.truncated === true || value.courses.length > 100 }
}

export function sanitizeClientContext(value, now = Date.now()) {
  if (!value || typeof value !== 'object' || !fresh(value.capturedAt, now, 10 * 60_000)) return { status: value ? 'stale_or_invalid' : 'not_provided' }
  const clean = { capturedAt: iso(value.capturedAt), status: 'client_provided' }
  clean.locationSource = ['user_selected', 'nearby_estimate', 'unknown'].includes(value.locationSource) ? value.locationSource : value.locationSource == null ? 'user_selected' : 'unknown'
  if (validId(value.currentLocationId) && clean.locationSource !== 'unknown') clean.currentLocationId = value.currentLocationId
  if (clean.locationSource === 'nearby_estimate') {
    if (fresh(value.locationCapturedAt, now, 120_000)) clean.locationCapturedAt = iso(value.locationCapturedAt)
    else { delete clean.currentLocationId; clean.locationSource = 'unknown' }
  }
  const route = cleanRoute(value.route)
  if (route) clean.route = route
  const timetable = sanitizeTimetable(value.timetable)
  if (timetable) clean.timetable = timetable
  if (Array.isArray(value.favoriteIds)) clean.favoriteIds = cleanIds(value.favoriteIds)
  const point = value.position
  if (point && fresh(point.capturedAt, now, 120_000) && Number.isFinite(point.latitude) && point.latitude >= -90 && point.latitude <= 90 && Number.isFinite(point.longitude) && point.longitude >= -180 && point.longitude <= 180 && Number.isFinite(point.accuracy) && point.accuracy >= 0 && point.accuracy <= 200) {
    clean.position = { latitude: point.latitude, longitude: point.longitude, accuracy: point.accuracy, capturedAt: iso(point.capturedAt) }
  }
  return clean
}

function requestedTeachingWeek(question) {
  const weeks = [...new Set([...String(question ?? '').matchAll(/第\s*(\d+)\s*(?:教学)?周/g)].map(match => Number(match[1])))]
  return weeks.length === 1 && Number.isInteger(weeks[0]) && weeks[0] >= 1 && weeks[0] <= 60 ? weeks[0] : null
}

export function timetableSituation(timetable, now = Date.now(), requestedWeek = null) {
  const anchor = timetable?.termStart ? new Date(timetable.termStart + 'T00:00:00Z') : null
  const calendarConfirmed = Boolean(timetable?.dateConfirmed && anchor && Number.isFinite(+anchor) && anchor.getUTCDay() === 1 && anchor.toISOString().slice(0, 10) === timetable.termStart)
  if (timetable && Number.isInteger(requestedWeek) && requestedWeek >= 1 && requestedWeek <= 60) {
    // Explicit week numbers come from the user's question, not from an inferred
    // current week. Keep all its bounded courses until the model budget pass;
    // retaining today's courses instead would silently discard the chosen week.
    const courses = timetable.courses.filter(course => course.weeks.includes(requestedWeek))
      .sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime) || String(a.id).localeCompare(String(b.id)))
      .map(({ weeks, ...course }) => {
        if (!calendarConfirmed) return course
        const date = new Date(+anchor + ((requestedWeek - 1) * 7 + course.weekday - 1) * DAY).toISOString().slice(0, 10)
        return { ...course, starts_at: `${date}T${course.startTime}:00+08:00`, ends_at: `${date}T${course.endTime}:00+08:00` }
      })
    return { calendar_status: calendarConfirmed ? 'timetable_calculated' : 'unconfirmed', schedule_scope: 'requested_teaching_week', requested_week: requestedWeek, semester: timetable.semester, courses, scheduled_course_count: courses.length, unscheduled: timetable.unscheduled, truncated: timetable.truncated }
  }
  if (!calendarConfirmed) return { calendar_status: 'unconfirmed', semester: timetable?.semester ?? null, courses: timetable?.courses.slice(0, 3) ?? [], unscheduled: timetable?.unscheduled ?? [], truncated: timetable?.truncated || (timetable?.courses.length ?? 0) > 3 }
  const local = new Date(now + 8 * 3600_000)
  const today = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate())
  const week = Math.floor((today - +anchor) / (DAY * 7)) + 1
  if (week < 1 || week > 60) return { calendar_status: 'out_of_term', courses: [], unscheduled: timetable.unscheduled }
  const upcoming = []
  for (let offset = 0; offset < 7; offset++) {
    const day = new Date(today + offset * DAY)
    const courseWeek = Math.floor((+day - +anchor) / (DAY * 7)) + 1
    const date = day.toISOString().slice(0, 10)
    for (const course of timetable.courses) {
      if (course.weekday !== (day.getUTCDay() || 7) || !course.weeks.includes(courseWeek)) continue
      const starts_at = `${date}T${course.startTime}:00+08:00`
      const ends_at = `${date}T${course.endTime}:00+08:00`
      if (Date.parse(ends_at) <= now) continue
      upcoming.push({ ...course, starts_at, ends_at, offset })
    }
  }
  upcoming.sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  return { calendar_status: 'timetable_calculated', semester: timetable.semester, date: local.toISOString().slice(0, 10), week, courses: upcoming.filter((course) => course.offset === 0).slice(0, 6), next_course: upcoming[0] ?? null, unscheduled: timetable.unscheduled, truncated: timetable.truncated || upcoming.filter((course) => course.offset === 0).length > 6 }
}

function courseLocations(courses) {
  return cleanIds(courses.flatMap((course) => {
    const classroom = course.classroom ?? ''
    const matches = campusLocations.flatMap((location) => [location.name, ...location.aliases.filter((alias) => alias.length > 2)]
      .filter((alias) => {
        const at = classroom.indexOf(alias)
        return at >= 0 && (!/^\d/.test(alias) || !/\d/.test(classroom[at - 1] ?? ''))
      }).map((alias) => ({ id: location.id, length: alias.length })))
    const longest = Math.max(0, ...matches.map((match) => match.length))
    return matches.filter((match) => match.length === longest).map((match) => match.id)
  }))
}

// These selects are a second privacy boundary in addition to the caller's JWT/RLS.
const specs = [
  ['events', 'campus_events', 'id,title,location_id,type,impact,source_url,status,is_demo,start_at,end_at,updated_at', 12, 'verified_record'],
  ['upcoming_events', 'campus_events', 'id,title,location_id,type,impact,source_url,status,is_demo,start_at,end_at,updated_at', 10, 'scheduled_record'],
  ['ended_events', 'campus_events', 'id,title,location_id,type,impact,status,is_demo,start_at,end_at,updated_at', 8, 'ended_record'],
  ['services', 'campus_services', 'id,title,location_id,summary,hours,phone,phone_note,website,source_url,updated_at', 20, 'database_record'],
  ['locations', 'campus_locations', 'id,name,open_status,crowd_status,updated_at', 100, 'registered_state'],
  ['reports', 'campus_reports', 'id,kind,title,body,location_id,status,repair_status,event_id,related_event_id,source_message_id,created_at,updated_at', 12, 'unverified'],
  ['facilities', 'facility_contributions', 'id,type,name,location_id,detail,status,updated_at', 12, 'verified_record'],
  ['lost_found', 'lost_found_posts', 'id,type,title,description,location_id,occurred_at,status,created_at,updated_at', 10, 'unverified'],
  ['restaurant_windows', 'restaurant_windows', 'id,restaurant_id,number,name,category,dish,description,created_at', 12, 'database_record'],
  ['restaurant_reviews', 'restaurant_reviews', 'id,window_id,restaurant_id,rating,content,tags,price,status,created_at', 8, 'opinion'],
  ['notifications', 'notifications', 'id,type,title,body,related_type,related_id,dedupe_key,read_at,created_at', 6, 'personal_notification'],
  ['timetable', 'campus_timetables', 'timetable,updated_at', 1, 'personal_schedule'],
  ['preferences', 'campus_user_preferences', 'favorite_ids,favorite_routes,updated_at', 1, 'personal_preference'],
  ['hall', 'hall_messages', 'id,region_id,content,created_at', 5, 'unverified'],
]

function scope(params, field, ids, includeNull = false) {
  if (!ids.length) return
  if (includeNull) params.set('or', `(${field}.in.(${ids.join(',')}),${field}.is.null)`)
  else params.set(field, ids.length === 1 ? `eq.${ids[0]}` : `in.(${ids.join(',')})`)
}

function project(row, columns) {
  return Object.fromEntries(columns.split(',').filter((key) => row[key] !== undefined).map((key) => [key, typeof row[key] === 'string' ? text(row[key], ['body', 'impact', 'summary', 'description', 'content'].includes(key) ? 260 : 160) : row[key]]))
}

function projectionTruncated(row, columns) {
  return columns.split(',').some((key) => typeof row[key] === 'string'
    && [...campusDisplayText(row[key])].length > (['body', 'impact', 'summary', 'description', 'content'].includes(key) ? 260 : 160))
}

export async function queryLiveContext({ supabaseUrl, supabaseKey, authorization, userId, input, mentioned, fetchData, signal, now = Date.now() }) {
  const queriedAt = new Date(now).toISOString()
  const client = input.clientContext
  const requestedWeek = requestedTeachingWeek(input.text)
  const clientSituation = timetableSituation(client.timetable, now, requestedWeek)
  const classroomIds = courseLocations([...clientSituation.courses, ...(clientSituation.next_course ? [clientSituation.next_course] : [])])
  const ids = cleanIds([input.locationId, ...mentioned.map((location) => location.id), client.currentLocationId, client.route?.destinationId, client.route?.originId, ...classroomIds, ...array(client.favoriteIds)]).slice(0, 12)
  const headers = { authorization, apikey: supabaseKey }
  const lostQuestion = lostFoundMatches(input.text).requested
  async function rowsAt(table, params) {
    const response = await fetchData(`${supabaseUrl}/rest/v1/${table}?${params}`, { headers }, signal)
    if (!response.ok) throw new Error('source_unavailable')
    const rows = JSON.parse(response.text)
    if (!Array.isArray(rows)) throw new Error('source_invalid')
    return rows
  }
  const eventIsCurrent = (event) => event && event.status === 'active' && !event.is_demo
    && Date.parse(event.start_at) <= now && Date.parse(event.end_at) > now
  async function reportsWithCurrentTargets(reports) {
    const targetIds = cleanTargetIds(reports.flatMap((row) => [row.event_id, row.related_event_id]))
    if (!targetIds.length) return reports.filter((row) => !row.event_id && !row.related_event_id)
    const targets = await rowsAt('campus_events', new URLSearchParams({ select: 'id,status,is_demo,start_at,end_at', id: `in.(${targetIds.join(',')})` }))
    const targetMap = new Map(targets.map((row) => [row.id, row]))
    return reports.filter((row) => [row.event_id, row.related_event_id].filter(Boolean).every((id) => eventIsCurrent(targetMap.get(id))))
  }
  async function currentNotices(notices) {
    const eventIds = cleanTargetIds(notices.filter((row) => row.related_type === 'event').map((row) => row.related_id))
    const reportIds = cleanTargetIds(notices.filter((row) => ['lost-found', 'feedback'].includes(row.related_type)).flatMap((row) => [row.related_id, ...lostPair(row)]))
    const messageIds = cleanTargetIds(notices.filter((row) => row.related_type === 'message').map((row) => row.related_id))
    // Resolve owned notifications directly. Their source may be older than the
    // two-hour public hall sample; the same caller JWT/RLS still applies here.
    const targets = await Promise.allSettled([
      eventIds.length ? rowsAt('campus_events', new URLSearchParams({ select: 'id,title,impact,location_id,status,is_demo,start_at,end_at,updated_at', id: `in.(${eventIds.join(',')})` })) : [],
      reportIds.length ? rowsAt('campus_reports', new URLSearchParams({ select: 'id,kind,title,body,location_id,status,event_id,related_event_id,created_at,updated_at', id: `in.(${reportIds.join(',')})` })) : [],
      messageIds.length ? rowsAt('hall_messages', new URLSearchParams({ select: 'id,region_id,content,created_at,deleted_at', id: `in.(${messageIds.join(',')})`, deleted_at: 'is.null' })) : [],
    ])
    const rows = (index) => targets[index].status === 'fulfilled' ? targets[index].value : []
    let partial = targets.some((target) => target.status === 'rejected')
    const events = new Map(rows(0).map((row) => [row.id, row]))
    let currentReports = []
    try { currentReports = await reportsWithCurrentTargets(rows(1)) }
    catch { partial = true }
    const reports = new Map(currentReports.map((row) => [row.id, row]))
    const messages = new Map(rows(2).filter((row) => !row.deleted_at).map((row) => [row.id, row]))
    const records = notices.flatMap((notice) => {
      const event = notice.related_type === 'event' ? events.get(notice.related_id) : null
      const report = ['lost-found', 'feedback'].includes(notice.related_type) ? reports.get(notice.related_id) : null
      const message = notice.related_type === 'message' ? messages.get(notice.related_id) : null
      if (eventIsCurrent(event)) {
        return [{ ...notice, title: event.title, body: event.impact, location_id: event.location_id, status: event.status, start_at: event.start_at, end_at: event.end_at, updated_at: event.updated_at }]
      }
      if (report && activeReportStatuses.has(report.status) && lostPair(notice).every((id) => activeReportStatuses.has(reports.get(id)?.status))) {
        return [{ ...notice, title: report.title, body: report.body, location_id: report.location_id, status: report.status, updated_at: report.updated_at }]
      }
      if (message) {
        return [{ ...notice, body: message.content || '图片聊天消息（未核实）', region_id: message.region_id,
          source_message_id: message.id, updated_at: message.created_at, verification: 'unverified' }]
      }
      return []
    })
    return { records, partial }
  }
  function cleanTargetIds(values) { return [...new Set(values.filter(uuid))].slice(0, 24) }
  function lostPair(notice) {
    const match = /^lost-match:([^:]+):([^:]+)$/.exec(notice.dedupe_key ?? '')
    return match && match.slice(1).every(uuid) ? match.slice(1) : []
  }
  async function readSource([key, table, columns, limit, verification], queryIds) {
    if (key === 'lost_found' && lostQuestion) {
      const lossPart = input.text.split(/另外|顺便|以及|同时|还有/)[0]
      const lossPlaces = mentioned.filter((place) => {
        const location = byId.get(place.id)
        return location && [location.name, ...location.aliases].some((name) => name.length > 1 && lossPart.includes(name))
      })
      queryIds = cleanIds([input.locationId, ...lossPlaces.map((location) => location.id)])
    }
    const regions = [...new Set(queryIds.map((id) => byId.get(id)?.region).filter(Boolean))]
    // A bounded lookback avoids allowing a few ended/deleted notices to hide
    // every current message. Apply the six-record result cap AFTER validation.
    const queryLimit = key === 'notifications' ? Math.min(24, limit * 4) : limit
    const params = new URLSearchParams({ select: columns, order: key === 'locations' || key === 'services' ? 'id.asc' : key === 'events' || key === 'upcoming_events' ? 'start_at.desc,id.asc' : key === 'facilities' || key === 'timetable' || key === 'preferences' ? 'updated_at.desc' : 'created_at.desc,id.asc', limit: String(queryLimit + 1) })
    if (key === 'ended_events') {
      params.set('is_demo', 'eq.false')
      params.set('or', `(status.eq.closed,end_at.lte.${queriedAt})`)
      params.set('updated_at', `gte.${new Date(now - 14 * DAY).toISOString()}`)
      params.set('order', 'updated_at.desc,id.asc')
      scope(params, 'location_id', queryIds)
    } else if (['events', 'upcoming_events'].includes(key)) {
      params.set('is_demo', 'eq.false')
      params.set('status', key === 'events' ? 'eq.active' : 'in.(active,scheduled)')
      params.set('end_at', `gt.${queriedAt}`)
      params.set('start_at', `${key === 'events' ? 'lte' : 'gt'}.${queriedAt}`)
      if (key === 'upcoming_events') params.append('start_at', `lte.${new Date(now + 7 * DAY).toISOString()}`)
      scope(params, 'location_id', queryIds)
    } else if (key === 'services') scope(params, 'location_id', queryIds, true)
    else if (key === 'locations') scope(params, 'id', queryIds)
    else if (key === 'reports') { params.set('author_id', `eq.${userId}`); params.set('status', 'in.(submitted,analyzed,published)') }
    else if (key === 'facilities') { params.set('status', 'eq.verified'); scope(params, 'location_id', queryIds) }
    else if (key === 'lost_found') { params.set('status', 'eq.active'); scope(params, 'location_id', queryIds) }
    else if (['restaurant_windows', 'restaurant_reviews'].includes(key)) {
      scope(params, 'restaurant_id', queryIds.filter((id) => byId.get(id)?.category === 'dining'))
      if (key === 'restaurant_reviews') params.set('status', 'eq.visible')
    } else if (key === 'notifications') params.set('recipient_id', `eq.${userId}`)
    else if (['timetable', 'preferences'].includes(key)) params.set('user_id', `eq.${userId}`)
    else if (key === 'hall') { params.set('deleted_at', 'is.null'); params.set('created_at', `gte.${new Date(now - 2 * 3600_000).toISOString()}`); scope(params, 'region_id', regions) }
    if (key === 'lost_found') {
      const reportColumns = 'id,kind,title,body,location_id,status,event_id,related_event_id,created_at,updated_at'
      const reportParams = new URLSearchParams({ select: reportColumns, kind: 'in.(lost,found)', status: 'in.(submitted,analyzed,published)', order: 'created_at.desc,id.asc', limit: String(limit + 1) })
      scope(reportParams, 'location_id', queryIds)
      const parts = await Promise.allSettled([rowsAt(table, params), rowsAt('campus_reports', reportParams)])
      if (parts.every((part) => part.status === 'rejected')) throw new Error('source_unavailable')
      const legacy = parts[0].status === 'fulfilled' ? parts[0].value.filter((row) => row.status === 'active').map((row) => ({ ...project(row, columns), source_table: 'lost_found_posts' })) : []
      let currentReports = []
      let lineageFailed = false
      if (parts[1].status === 'fulfilled') {
        try { currentReports = await reportsWithCurrentTargets(parts[1].value) }
        catch { lineageFailed = true }
      }
      if (parts[0].status === 'rejected' && (parts[1].status === 'rejected' || lineageFailed)) throw new Error('source_unavailable')
      const reports = currentReports.filter((row) => ['lost', 'found'].includes(row.kind) && activeReportStatuses.has(row.status)).map((row) => ({ ...project(row, reportColumns), type: row.kind, description: text(row.body, 260), source_table: 'campus_reports' }))
      const rows = [...legacy, ...reports].sort((a, b) => Date.parse(b.created_at ?? 0) - Date.parse(a.created_at ?? 0))
      return { key, records: rows.slice(0, limit), truncated: rows.length > limit || parts.some((part) => part.status === 'fulfilled' && part.value.length > limit), contentTruncated: parts.some((part, index) => part.status === 'fulfilled' && part.value.some((row) => projectionTruncated(row, index ? reportColumns : columns))), partial: lineageFailed || parts.some((part) => part.status === 'rejected'), verification, readIds: queryIds }
    }
    const rows = await rowsAt(table, params)
    let selected = rows.slice(0, queryLimit)
    let partial = false
    let truncated = rows.length > queryLimit
    if (key === 'reports') selected = await reportsWithCurrentTargets(selected.filter((row) => activeReportStatuses.has(row.status)))
    if (['events', 'upcoming_events'].includes(key)) selected = selected.filter((row) => !row.is_demo && (!row.status || (key === 'events' ? row.status === 'active' : ['active', 'scheduled'].includes(row.status))) && (!row.end_at || Date.parse(row.end_at) > now))
    if (key === 'ended_events') selected = selected.filter((row) => !row.is_demo && (row.status === 'closed' || Date.parse(row.end_at) <= now))
    if (key === 'notifications') {
      const current = await currentNotices(selected)
      partial = current.partial
      truncated ||= current.records.length > limit
      selected = current.records.slice(0, limit)
    }
    if (key === 'hall') {
      const messageIds = cleanTargetIds(selected.map((row) => row.id))
      if (messageIds.length) {
        const linked = await rowsAt('campus_reports', new URLSearchParams({ select: 'id,status,source_message_id,event_id,related_event_id', source_message_id: `in.(${messageIds.join(',')})` }))
        const eligible = await reportsWithCurrentTargets(linked.filter((row) => activeReportStatuses.has(row.status)))
        const eligibleIds = new Set(eligible.map((row) => row.id))
        const endedMessages = new Set(linked.filter((row) => !eligibleIds.has(row.id)).map((row) => row.source_message_id))
        selected = selected.filter((row) => !endedMessages.has(row.id))
      }
    }
    const projectedColumns = key === 'notifications' ? `${columns},location_id,status,start_at,end_at,updated_at,region_id,source_message_id,verification` : columns
    return { key, records: selected.map((row) => project(row, projectedColumns)), truncated, partial, contentTruncated: selected.some((row) => projectionTruncated(row, projectedColumns)), verification, readIds: queryIds }
  }
  const result = await Promise.allSettled(specs.map((spec) => readSource(spec, ids)))
  const records = {}; const sources = {}
  specs.forEach(([key, , , , verification], index) => {
    const source = result[index]
    const value = source.status === 'fulfilled' ? source.value : null
    records[key] = value?.records ?? []
    const readIds = value?.readIds ?? ids
    sources[key] = { read_ok: Boolean(value) && !value.partial, partial_read_ok: Boolean(value?.partial), count: records[key].length, truncated: value?.truncated ?? false, content_truncated: value?.contentTruncated ?? false, verification, queried_at: queriedAt, read_location_ids: value ? [...readIds] : [], failed_location_ids: value && !value.partial ? [] : [...readIds], unscoped_read_ok: Boolean(value) && !value.partial && !readIds.length }
  })
  records.timetable = records.timetable.map((row) => ({ timetable: sanitizeTimetable(row.timetable), updated_at: row.updated_at ?? null }))
  records.preferences = records.preferences.map((row) => ({ favorite_ids: cleanIds(row.favorite_ids), favorite_routes: array(row.favorite_routes).slice(0, 8).map(cleanRoute).filter(Boolean), updated_at: row.updated_at ?? null }))
  const timetable = client.timetable ?? records.timetable[0]?.timetable
  const personal = { ...client, timetable: timetableSituation(timetable, now, requestedWeek), timetable_source: client.timetable ? 'client_provided' : timetable ? 'database' : 'unavailable', favoriteIds: client.favoriteIds ?? records.preferences[0]?.favorite_ids ?? [], favorite_routes: records.preferences[0]?.favorite_routes ?? [] }
  if (!timetable) personal.timetable.calendar_status = 'not_provided'
  const newIds = cleanIds([...courseLocations([...personal.timetable.courses, ...(personal.timetable.next_course ? [personal.timetable.next_course] : [])]), ...personal.favoriteIds, ...personal.favorite_routes.flatMap((route) => [route.originId, route.destinationId])]).filter((id) => !ids.includes(id)).slice(0, 8)
  if (newIds.length && !signal?.aborted) {
    const supplementalSpecs = specs.filter(([key]) => (['events', 'upcoming_events', 'ended_events', 'locations', 'services', 'facilities', 'hall'].includes(key) || key === 'lost_found' && !lostQuestion) || ['restaurant_windows', 'restaurant_reviews'].includes(key) && newIds.some((id) => byId.get(id)?.category === 'dining'))
    const supplemental = await Promise.allSettled(supplementalSpecs.map((spec) => readSource(spec, newIds)))
    supplementalSpecs.forEach(([key], index) => {
      const extra = supplemental[index].status === 'fulfilled' ? supplemental[index].value : null
      const originalOk = sources[key].read_ok
      const hadSuccess = originalOk || sources[key].partial_read_ok
      const extraComplete = Boolean(extra) && !extra.partial
      if (extra) records[key] = [...new Map([...records[key], ...extra.records].map((record) => [record.id, record])).values()]
      sources[key].read_ok = originalOk && extraComplete
      sources[key].partial_read_ok = !sources[key].read_ok && (hadSuccess || Boolean(extra))
      sources[key].read_location_ids = cleanIds([...sources[key].read_location_ids, ...(extra ? newIds : [])])
      sources[key].failed_location_ids = cleanIds([...sources[key].failed_location_ids, ...(extraComplete ? [] : newIds)])
      sources[key].count = records[key].length
      sources[key].truncated ||= extra?.truncated ?? false
      sources[key].content_truncated ||= extra?.contentTruncated ?? false
    })
    ids.push(...newIds)
  }
  const serviceSource = sources.services.read_ok || sources.services.partial_read_ok ? 'database' : 'static_catalog'
  if (serviceSource === 'static_catalog') records.services = campusServiceFacts.filter((service) => !ids.length || !service.locationId || ids.includes(service.locationId)).map((service) => ({ id: service.id, title: service.title, location_id: service.locationId ?? null, summary: service.summary, hours: service.hours, phone: service.phone, phone_note: service.phoneNote, website: service.website, source_url: service.sourceUrl, updated_at: null }))
  records.services = records.services.map((service) => ({ ...service, source_kind: serviceSource }))
  const status = { queried_at: queriedAt, scope: ids.length ? 'relevant_locations' : 'campus_sample', target_location_id: input.locationId ?? (mentioned.length === 1 ? mentioned[0].id : null), location_ids: ids, events_read_ok: sources.events.read_ok, services_read_ok: sources.services.read_ok, locations_read_ok: sources.locations.read_ok, services_source: serviceSource, event_count: records.events.length, service_count: records.services.length, events_truncated: sources.events.truncated, services_truncated: sources.services.truncated, locations_truncated: sources.locations.truncated, sources, client_context_status: client.status, timetable_source: personal.timetable_source, timetable_truncated: Boolean(personal.timetable.truncated) }
  return { ...records, personal, status, events: records.events, services: records.services, location_states: records.locations, event_data_available: sources.events.read_ok || Boolean(sources.events.partial_read_ok) }
}

export const INPUT_BUDGET = 2500
// Conservative transport bounds, not a claim about the custom model's token
// window. Keep 600 output tokens and framing separate; do not starve live facts
// behind the roughly 2.2 KB system instruction. Verify deployment token usage
// before increasing these limits further.
export const INPUT_BYTE_BUDGET = 8000
const utf8 = new TextEncoder()
export const utf8Length = (value) => utf8.encode(value).length
export function equivalentLength(value) {
  return [...value].reduce((size, character) => size + (character.codePointAt(0) <= 0x7f ? 0.28 : 1), 0)
}
function shorten(value, budget, byteBudget = Infinity) {
  if (equivalentLength(value) <= budget && utf8Length(value) <= byteBudget) return value
  let size = 0; let bytes = 0; let output = ''
  for (const character of value) {
    const weight = character.codePointAt(0) <= 0x7f ? 0.28 : 1
    const byteLength = utf8Length(character)
    if (size + weight + 1 > budget || bytes + byteLength + 3 > byteBudget) return output + '…'
    output += character
    size += weight
    bytes += byteLength
  }
  return output
}

function brief(record, source, verification) {
  const result = { source, id: record.id, location_id: record.location_id ?? record.restaurant_id ?? (source === 'locations' ? record.id : undefined), title: record.title ?? record.name, verification: record.source_kind === 'static_catalog' ? 'static_reference' : record.verification ?? verification }
  if (source === 'ended_events') result.title = `已结束：${result.title ?? '事件'}`
  for (const key of ['summary', 'impact', 'body', 'detail', 'description', 'content', 'hours', 'phone', 'phone_note', 'type', 'kind', 'status', 'repair_status', 'open_status', 'crowd_status', 'start_at', 'end_at', 'updated_at', 'created_at', 'rating', 'number', 'dish', 'price', 'region_id', 'related_type', 'related_id', 'source_message_id', 'read_at']) {
    if (source === 'ended_events' && key === 'impact') continue
    if (record[key] != null) {
      result[key] = typeof record[key] === 'string' ? shorten(record[key], ['body', 'impact', 'summary', 'description', 'content', 'detail'].includes(key) ? 100 : 65) : record[key]
      if (result[key] !== record[key]) result.content_truncated = true
    }
  }
  return result
}

export function buildModelContext(input, context, instruction, mentioned, knowledgeGaps = []) {
  const ids = cleanIds([input.locationId, ...mentioned.map((location) => location.id), context.personal.currentLocationId, context.personal.route?.destinationId, context.personal.route?.originId])
  ids.push(...courseLocations([...context.personal.timetable.courses, ...(context.personal.timetable.next_course ? [context.personal.timetable.next_course] : [])]))
  // Never silently cut away the actual question at the end of a long message.
  const question = input.text
  const personal = { capturedAt: context.personal.capturedAt, currentLocationId: context.personal.currentLocationId, locationSource: context.personal.locationSource, locationCapturedAt: context.personal.locationCapturedAt, route: context.personal.route, timetable: { ...context.personal.timetable, courses: [...context.personal.timetable.courses] }, timetable_source: context.personal.timetable_source, favoriteIds: context.personal.favoriteIds.slice(0, 8), favorite_routes: context.personal.favorite_routes.slice(0, 2) }
  // Exact GPS is unnecessary after the user supplies a campus location ID.
  if (!personal.currentLocationId && context.personal.position) personal.position = context.personal.position
  const sourceStatus = Object.entries(context.status.sources).filter(([, source]) => source.count || !source.read_ok || source.truncated || source.content_truncated).map(([key, source]) => `${key}:${source.read_ok ? 'ok' : source.partial_read_ok ? 'partial' : 'failed'},${source.count}${source.truncated || source.content_truncated ? ',truncated' : ''}${source.partial_read_ok && !source.read_ok && source.failed_location_ids.length ? ',unread=' + source.failed_location_ids.join('|') : ''}`).join(';')
  const payload = { question, queried_at: context.status.queried_at, scope: context.status.scope, source_status: sourceStatus || 'all_queried_sources_ok_and_empty', campus_locations: cleanIds(ids).slice(0, 8).map((id) => ({ id, name: byId.get(id).name })), personal_context: personal, knowledge_gaps: knowledgeGaps.map((gap) => shorten(gap, 180, 360)).slice(0, 3), facts: [], recent_conversation: [], context_truncated: true }
  const available = INPUT_BUDGET - equivalentLength(instruction) - 20
  const availableBytes = INPUT_BYTE_BUDGET - utf8Length(instruction) - 20
  const fits = (reserve = 0) => { const serialized = JSON.stringify(payload); return equivalentLength(serialized) <= available && utf8Length(serialized) <= availableBytes - reserve }
  const reserveForFact = Object.entries(context.status.sources).some(([source, status]) => !['timetable', 'preferences'].includes(source) && status.count) ? 500 : 0
  let truncated = input.history.length > 2 || context.personal.favoriteIds.length > 8 || context.personal.favorite_routes.length > 2 || knowledgeGaps.length > 3 || knowledgeGaps.some((gap) => shorten(gap, 180, 360) !== gap)
  while (!fits(reserveForFact) && personal.timetable.courses.length) { personal.timetable.courses = personal.timetable.courses.slice(0, -1); personal.timetable.truncated = true; context.status.timetable_truncated = true; truncated = true }
  if (!fits(reserveForFact)) { personal.timetable = { calendar_status: personal.timetable.calendar_status, truncated: true }; context.status.timetable_truncated = true; delete personal.favorite_routes; delete personal.favoriteIds; truncated = true }
  while (!fits(reserveForFact) && payload.knowledge_gaps.length > 1) { payload.knowledge_gaps.pop(); truncated = true }
  while (!fits(reserveForFact) && payload.campus_locations.length > 1) { payload.campus_locations.pop(); truncated = true }
  if (!fits(reserveForFact)) { delete personal.timetable.unscheduled; truncated = true }
  const candidates = []
  const lost = lostFoundMatches(input.text, context.lost_found)
  const personalUpdates = /(?:我的?|给我|与我|跟我).{0,12}(?:消息|动态|提醒|通知)|(?:新|未读)(?:消息|提醒|通知)/.test(input.text)
  const preferenceQuestion = !lost.requested && /收藏|订阅/.test(input.text) && !/动态|影响|事件|附近|路线|接下来|行程/.test(input.text)
  for (const [source, status] of Object.entries(context.status.sources)) {
    if (['timetable', 'preferences'].includes(source)) continue
    if (lost.direct && source !== 'lost_found' || preferenceQuestion && source !== 'locations') continue
    if (source === 'hall' && !personalUpdates && !/大厅|同学|大家|听说|聊天|传言/.test(input.text)) continue
    if (source === 'ended_events' && !/停电|供电|停水|供水|施工|封路|故障|维修|结束|恢复|通知|事件|动态/.test(input.text)) continue
    const priority = ({ events: 45, ended_events: 46, upcoming_events: /活动|讲座|比赛|七天|本周|未来/.test(input.text) ? 45 : 10, services: 25, locations: 30, reports: /报修|反馈|我的|修好/.test(input.text) ? 50 : 5, facilities: /附近|设施|打印|饮水|厕所|快递/.test(input.text) ? 45 : 5, lost_found: /失物|招领|丢|捡/.test(input.text) ? 50 : 0, restaurant_windows: /吃|餐|菜|窗口/.test(input.text) ? 45 : 0, restaurant_reviews: /吃|餐|菜|评价|推荐/.test(input.text) ? 40 : 0, notifications: personalUpdates ? 70 : /通知|我的|消息/.test(input.text) ? 40 : 5, hall: personalUpdates ? 25 : /大厅|同学|大家|听说|聊天/.test(input.text) ? 15 : 0 })[source] ?? 0
    const ranked = (source === 'lost_found' && lost.requested ? lost.matches : context[source]).map((record) => {
      const locationId = record.location_id ?? record.restaurant_id ?? (source === 'locations' ? record.id : null)
      const relevant = ids.includes(locationId)
      const title = record.title ?? record.name ?? ''
      const score = priority + (relevant ? 50 : context.personal.favoriteIds.includes(locationId) ? 20 : 0) + (title && input.text.includes(title) ? 35 : 0)
      return { record: brief(record, source, status.verification), score }
    }).sort((a, b) => b.score - a.score)
    candidates.push(...ranked.slice(0, 4).map((item, index) => ({ ...item, score: item.score - index * 25 })))
  }
  for (const candidate of candidates.sort((a, b) => b.score - a.score)) {
    payload.facts.push(candidate.record)
    if (!fits()) { payload.facts.pop(); truncated = true }
  }
  // Old assistant prose can contain stale facts or hallucinations. Re-query facts
  // instead of feeding those statements back as evidence in the next response.
  for (const turn of (lost.requested ? [] : input.history.filter((turn) => turn.role === 'user').slice(-2))) {
    const content = shorten(turn.content, 100)
    truncated ||= content !== turn.content
    payload.recent_conversation.push({ role: turn.role, content })
    if (!fits()) { payload.recent_conversation.pop(); truncated = true }
  }
  // Keep the final guard independent of record shapes and future schema additions.
  if (!fits()) { payload.recent_conversation = []; payload.knowledge_gaps = payload.knowledge_gaps.slice(0, 1); payload.campus_locations = payload.campus_locations.slice(0, 3); truncated = true }
  // Never silently exceed the configured character estimate if a future schema
  // or instruction grows beyond the current bounds.
  while (!fits() && payload.knowledge_gaps.length) { payload.knowledge_gaps.pop(); truncated = true }
  while (!fits() && payload.campus_locations.length) { payload.campus_locations.pop(); truncated = true }
  if (!fits()) { payload.personal_context = { context_truncated: true }; payload.source_status = 'source_details_omitted_see_response_metadata'; truncated = true }
  if (!fits()) {
    const error = new RangeError('完整问题超出当前模型输入容量，请缩短问题后重试。')
    error.code = 'question_too_large'
    throw error
  }
  for (const [key, source] of Object.entries(context.status.sources)) {
    const included = payload.facts.filter((record) => record.source === key)
    source.content_truncated ||= included.some((record) => record.content_truncated)
    source.included_count = key === 'timetable' ? (personal.timetable_source === 'database' ? source.count : 0) : key === 'preferences' ? source.count : included.length
    source.context_truncated = source.content_truncated || (key === 'timetable' ? context.status.timetable_truncated : key === 'preferences' ? context.personal.favoriteIds.length > 8 || context.personal.favorite_routes.length > 2 || !personal.favoriteIds : source.included_count < source.count)
    truncated ||= source.truncated || source.context_truncated
  }
  truncated ||= context.status.timetable_truncated
  payload.context_truncated = Boolean(truncated)
  context.status.input_truncated = Boolean(truncated)
  context.status.input_equivalent_characters = Math.ceil(equivalentLength(instruction) + equivalentLength(JSON.stringify(payload)))
  context.status.input_utf8_bytes = utf8Length(instruction) + utf8Length(JSON.stringify(payload))
  context.status.input_byte_budget = INPUT_BYTE_BUDGET
  const sources = payload.facts.filter((record) => record.id).map((record) => ({ source: record.source, id: record.id, title: record.title ?? record.content?.slice(0, 35) ?? record.kind ?? record.type ?? record.id, location_id: record.location_id ?? null, updated_at: record.updated_at ?? record.created_at ?? null, verification: record.verification }))
  return { content: JSON.stringify(payload), sources, groundingFacts: payload.facts, locationIds: cleanIds(sources.map((record) => record.location_id)).slice(0, 6) }
}
