import { useMemo, useState } from 'react'
import { CalendarDays, MapPin, Navigation } from 'lucide-react'

function localDateKey(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatTime(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '时间待补充'
    : new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(date)
}

export function CampusEventCalendar({ events, locations, onSelectLocation, onPlanRouteToLocation }) {
  const [selectedDate, setSelectedDate] = useState(() => localDateKey(new Date()))
  const locationById = useMemo(() => new Map(locations.map((location) => [location.id, location])), [locations])
  const dayEvents = useMemo(() => events
    .filter((event) => event.type === 'activity' && event.status !== 'closed')
    .filter((event) => localDateKey(event.startAt) === selectedDate)
    .filter((event) => !event.endAt || new Date(event.endAt).getTime() >= Date.now())
    .sort((left, right) => new Date(left.startAt).getTime() - new Date(right.startAt).getTime()), [events, selectedDate])

  return (
    <section className="mobile-panel-section mobile-event-calendar" aria-label="校园活动日历">
      <div className="mobile-panel-section__heading">
        <h3>校园活动</h3>
        <span>按日期查看</span>
      </div>
      <label className="mobile-event-calendar__date">
        <CalendarDays size={15} aria-hidden="true" />
        <span>选择日期</span>
        <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
      </label>
      <small className="mobile-event-calendar__note">活动信息沿用校园动态演示数据，以校方正式通知为准。</small>
      {dayEvents.length ? (
        <div className="mobile-event-calendar__list">
          {dayEvents.map((event) => {
            const location = locationById.get(event.locationId)
            return (
              <article className="mobile-event-card" key={event.id}>
                <div className="mobile-event-card__time"><strong>{formatTime(event.startAt)}</strong><span>{event.endAt ? formatTime(event.endAt) : '时间待定'}</span></div>
                <div className="mobile-event-card__content">
                  <span className="mobile-event-card__tag">{event.activityCategory || '校园活动'}</span>
                  <strong>{event.title}</strong>
                  <p>{event.impact || '活动详情请查看校园通知。'}</p>
                  <small><MapPin size={12} />{location?.name ?? '地点待确认'}</small>
                  {location && (
                    <div className="mobile-event-card__actions">
                      <button type="button" onClick={() => onSelectLocation(location.id)}><MapPin size={13} />查看地点</button>
                      <button type="button" onClick={() => onPlanRouteToLocation(location.id)}><Navigation size={13} />规划路线</button>
                    </div>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      ) : <p className="mobile-event-calendar__empty">这一天还没有已发布的活动。</p>}
    </section>
  )
}
