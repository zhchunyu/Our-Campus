const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' })

export function canvasWeek(now = new Date()) {
  const parts = Object.fromEntries(formatter.formatToParts(now).map((part) => [part.type, part.value]))
  const day = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), 12))
  const weekday = (day.getUTCDay() + 6) % 7
  const monday = new Date(day); monday.setUTCDate(day.getUTCDate() - weekday)
  const sunday = new Date(monday); sunday.setUTCDate(monday.getUTCDate() + 6)
  const short = (value) => `${String(value.getUTCMonth() + 1).padStart(2, '0')}.${String(value.getUTCDate()).padStart(2, '0')}`
  return { range: `${short(monday)}—${short(sunday)}`, today: `${Number(parts.month)}月${Number(parts.day)}日`, weekday: `周${'一二三四五六日'[weekday]}` }
}

export function canvasEvents(events, now = Date.now()) {
  return events.filter((event) => event.status === 'active' && Number.isFinite(Date.parse(event.endAt)) && Date.parse(event.endAt) > now)
    .sort((a, b) => Number(Boolean(b.isCloud)) - Number(Boolean(a.isCloud)) || Date.parse(a.startAt) - Date.parse(b.startAt))
    .slice(0, 6)
}

export function restoreCanvasOrder(ids, saved) {
  return [...new Set([...(Array.isArray(saved) ? saved.filter((id) => ids.includes(id)) : []), ...ids])]
}
