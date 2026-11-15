import './inner-canvas.css'
import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, MapPin, Navigation } from 'lucide-react'
import { getShanghaiCalendar } from '../../data/timetable.js'
import { selectCampusEvents } from './campusConnections.js'

function formatDateTime(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '时间待补充' : new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date)
}

export function CampusEventCalendar({ events = [], locations = [], onSelectLocation, onPlanRouteToLocation }) {
  const [now, setNow] = useState(() => new Date())
  const [intent, setIntent] = useState('today')
  const [selectedDate, setSelectedDate] = useState(() => getShanghaiCalendar(new Date()).date)
  const locationById = useMemo(() => new Map(locations.map(location => [location.id, location])), [locations])
  useEffect(() => {
    const update = () => setNow(new Date())
    const timer = setInterval(update, 30000)
    window.addEventListener('focus', update)
    return () => { clearInterval(timer); window.removeEventListener('focus', update) }
  }, [])
  const dayEvents = useMemo(() => selectCampusEvents(events, { intent: intent === 'today' ? 'date' : intent, date: intent === 'today' ? getShanghaiCalendar(now).date : selectedDate, now }), [events, intent, selectedDate, now])

  return <section className="mobile-panel-section mobile-event-calendar" aria-label="校园活动日历">
    <div className="mobile-panel-section__heading"><h3>校园活动</h3><span>{dayEvents.length} 项</span></div>
    <nav className="along-event-intents" aria-label="活动时间">{[{ id: 'today', label: '今天' }, { id: 'upcoming', label: '接下来' }, { id: 'past', label: '已结束' }, { id: 'date', label: '选日期' }].map(item => <button type="button" key={item.id} aria-pressed={intent === item.id} onClick={() => setIntent(item.id)}>{item.label}</button>)}</nav>
    {intent === 'date' && <label className="mobile-event-calendar__date"><CalendarDays size={16} aria-hidden="true" /><span>日期</span><input type="date" value={selectedDate} onChange={event => setSelectedDate(event.target.value)} /></label>}
    <small className="mobile-event-calendar__note">活动含校园动态演示数据，请以校方正式通知为准。</small>
    {dayEvents.length ? <div className="mobile-event-calendar__list">{dayEvents.map(event => {
      const location = locationById.get(event.locationId)
      const start = Date.parse(event.startAt), end = Date.parse(event.endAt)
      const hasEnd = Number.isFinite(end) && end >= start
      const ended = event.status === 'closed' || (hasEnd && end <= now.getTime())
      const state = ended ? '已结束' : start > now.getTime() ? '未开始' : hasEnd ? '进行中' : '结束时间待确认'
      return <article className="mobile-event-card" key={event.id}>
        <div className="mobile-event-card__content"><div className="along-event-meta"><span className="mobile-event-card__tag">{event.activityCategory || '校园活动'}</span><small>{state}</small></div><strong>{event.title}</strong><p className="along-event-time">{formatDateTime(event.startAt)} — {hasEnd ? formatDateTime(event.endAt) : '结束时间待确认'}</p><p>{event.impact || '详情请核对学校活动通知。'}</p><small><MapPin size={13} />{location?.name ?? '地点待确认'}</small>
          {location && <div className="mobile-event-card__actions">{onSelectLocation && <button type="button" onClick={() => onSelectLocation(location.id)}><MapPin size={14} />查看地点</button>}{onPlanRouteToLocation && <button type="button" onClick={() => onPlanRouteToLocation(location.id)}><Navigation size={14} />去这里</button>}</div>}
        </div>
      </article>
    })}</div> : <p className="mobile-event-calendar__empty">{intent === 'past' ? '暂无已结束的活动记录。' : intent === 'upcoming' ? '暂无接下来的已排活动。' : '这一天暂无已排活动。'}</p>}
  </section>
}
