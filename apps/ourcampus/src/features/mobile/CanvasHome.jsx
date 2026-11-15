import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Bell, BookOpen, CalendarDays, MapPin, Search, UtensilsCrossed } from 'lucide-react'
import { getNextClassState, loadTimetable } from '../../data/timetable.js'
import { canvasEvents, canvasWeek } from './canvasHome.js'
import { resolveCourseLocation } from './campusConnections.js'
import { HomeMapPreview } from './HomeMapPreview.jsx'
import { loadRecentPlaces } from './dailyHome.js'
import { CanvasEventSheet } from './CanvasEventSheet.jsx'

export function CanvasHome({ auth, locations, events, favoriteIds = [], unread = 0, livePosition, timetableRevision = 0,
  onOpenMessages, onOpenMap, onSearch, onOpenServices, onOpenCommunity, onOpenTimetable, onSelectLocation }) {
  const owner = auth.user?.id ?? null
  const [now, setNow] = useState(() => Date.now())
  const [query, setQuery] = useState('')
  const [openedEvent, setOpenedEvent] = useState(null)
  const week = canvasWeek(new Date(now))
  const timetable = useMemo(() => loadTimetable(owner), [owner, timetableRevision])
  const next = timetable ? getNextClassState(timetable, new Date(now)) : null
  const course = next?.courses?.[0]
  const recent = loadRecentPlaces(owner, locations)
  const places = (recent.length ? recent : favoriteIds.map(id => locations.find(place => place.id === id)).filter(Boolean)).slice(0, 4)
  if (!places.length) places.push(...locations.filter(place => ['canteen', 'library', 'east-gate', 'teaching-a'].includes(place.id)).slice(0, 4))
  const activity = canvasEvents(events.filter(event => event.isCloud && !event.isDemo), now).slice(0, 2)
  const opened = activity.find(event => event.id === openedEvent)
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer) }, [])
  const findClassroom = () => {
    const match = resolveCourseLocation(course?.classroom, locations)
    if (match.status === 'matched') onSelectLocation?.(match.locationId)
    else onOpenTimetable?.()
  }
  return <section className="canvas-home along-home" aria-label="今天">
    <header className="along-home__heading"><div><h1>今天</h1><span>{week.today} {week.weekday}</span></div><button type="button" aria-label="打开消息中心" onClick={onOpenMessages}><Bell size={23} />{unread > 0 && <i />}</button></header>
    <form className="along-home__search" role="search" onSubmit={event => { event.preventDefault(); onSearch?.(query.trim()) }}><Search size={21} aria-hidden="true" /><input aria-label="搜地点、餐厅或办事" placeholder="搜地点、餐厅或办事" value={query} onChange={event => setQuery(event.target.value)} /><button type="submit" aria-label="搜索校园"><ArrowRight size={20} /></button></form>
    <HomeMapPreview locations={locations} livePosition={livePosition} onSelectLocation={onSelectLocation} onOpenMap={onOpenMap} />
    <section className="along-home__course" aria-label="接下来的课程">
      {!timetable ? <><CalendarDays size={19} /><div><strong>把课表放在手边</strong><small>导入后查看下一节和上课地点</small></div><button type="button" onClick={onOpenTimetable}>导入课表 <ArrowRight size={15} /></button></>
        : next.status === 'unconfirmed' ? <><CalendarDays size={19} /><div><strong>先校准教学周</strong><small>日期未确认，暂不推算下一节</small></div><button type="button" onClick={onOpenTimetable}>校准教学周 <ArrowRight size={15} /></button></>
          : !course ? <><CalendarDays size={19} /><div><strong>暂无后续课表安排</strong><small>{timetable.unscheduled?.length ? '还有未排时间的课程，打开课表查看' : '查看课表或更新本学期安排'}</small></div><button type="button" onClick={onOpenTimetable}>查看课表 <ArrowRight size={15} /></button></>
            : <><button className="along-home__course-time" type="button" onClick={onOpenTimetable}><small>{next.status === 'active' ? '进行中' : `${Number(next.date.slice(5, 7))}/${Number(next.date.slice(8))}`}</small><strong>{course.startTime}</strong></button><div><strong>{course.name}{next.courses.length > 1 && <small> · 同时 {next.courses.length} 门</small>}</strong><small>{course.classroom || '教室待确认'}</small></div><button type="button" onClick={next.courses.length > 1 ? onOpenTimetable : findClassroom}>{next.courses.length > 1 ? '查看冲突' : '找教室'} <ArrowRight size={15} /></button></>}
    </section>
    <section className="along-home__places" aria-label={recent.length ? '最近查看' : '常用地点'}><div className="canvas-section-heading"><h2>{recent.length ? '最近查看' : '常用地点'}</h2><button type="button" onClick={() => onSearch?.('')}>全部地点 <ArrowRight size={15} /></button></div><div className="along-home__place-grid">{places.map(place => <button type="button" key={place.id} onClick={() => onSelectLocation?.(place.id)}>{/餐厅|食堂/.test(place.name) ? <UtensilsCrossed size={22} /> : /图书/.test(place.name) ? <BookOpen size={22} /> : <MapPin size={22} />}<span>{place.name}</span></button>)}</div></section>
    <nav className="along-home__quick" aria-label="常用校园工具"><button type="button" onClick={onOpenTimetable}><CalendarDays size={18} />课表</button><button type="button" onClick={() => onOpenServices?.('food')}><UtensilsCrossed size={18} />吃饭</button><button type="button" onClick={() => onOpenServices?.('directory')}><BookOpen size={18} />办事</button></nav>
    <section className="along-home__activity"><div className="canvas-section-heading"><h2>校园动态</h2><button type="button" onClick={onOpenCommunity}>查看全部 <ArrowRight size={15} /></button></div>{activity.length ? activity.map(event => <button className="along-home__event" key={event.id} type="button" onClick={() => setOpenedEvent(event.id)}><span><strong>{event.title}</strong><small>{locations.find(place => place.id === event.locationId)?.name || '校园发布'}</small></span><ArrowRight size={17} /></button>) : <button className="along-home__quiet" type="button" onClick={onOpenCommunity}>还没有新的校园动态，去社区看看 <ArrowRight size={16} /></button>}</section>
    {opened && <CanvasEventSheet event={opened} location={locations.find(place => place.id === opened.locationId)} viewerId={owner} onClose={() => setOpenedEvent(null)} onSelectLocation={id => { setOpenedEvent(null); onSelectLocation?.(id) }} />}
  </section>
}
