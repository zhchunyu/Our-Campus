import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowRight, ArrowUp, Bell, Check, MapPin, Search } from 'lucide-react'
import { loadPersonalHome, DEFAULT_PERSONAL_ARTWORK } from '../../data/personalHome.js'
import { getAvatarUrl } from '../../data/memberProfiles.js'
import { teamCampusMap } from '../../data/campusMap.js'
import { PostImageGallery } from './PostImageGallery.jsx'
import { ProfileAvatar } from './ProfileAvatar.jsx'
import { canvasEvents, canvasWeek, restoreCanvasOrder } from './canvasHome.js'
import { CanvasEventSheet } from './CanvasEventSheet.jsx'

const SECTIONS = ['space', 'events', 'places']
const ORDER_PREFIX = 'ourcampus.canvas-order.v1.'
function readOrder(owner) {
  try { return restoreCanvasOrder(SECTIONS, JSON.parse(localStorage.getItem(ORDER_PREFIX + owner) || 'null')) } catch { return SECTIONS }
}

export function CanvasHome({ auth, locations, events, favoriteIds = [], unread = 0, onOpenMessages, onOpenMap, onSearch, onOpenServices, onOpenCommunity, onOpenMe, onSelectLocation }) {
  const owner = auth.user?.id ?? 'guest'
  const [order, setOrder] = useState(() => readOrder(owner))
  const [arranging, setArranging] = useState(false)
  const [orderNotice, setOrderNotice] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const [openedEvent, setOpenedEvent] = useState(null)
  const home = useMemo(() => loadPersonalHome(auth.user?.id), [owner])
  const week = canvasWeek(new Date(now))
  const currentEvents = useMemo(() => canvasEvents(events, now), [events, now])
  const selectedEvent = currentEvents.find((event) => event.id === openedEvent)
  const places = useMemo(() => {
    const saved = favoriteIds.map((id) => locations.find((location) => location.id === id)).filter(Boolean)
    return (saved.length ? saved : locations.filter((location) => ['library', 'canteen', 'gymnasium'].includes(location.id))).slice(0, 5)
  }, [locations, favoriteIds])
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer) }, [])
  const move = (id, direction) => {
    const index = order.indexOf(id)
    const target = index + direction
    if (target < 0 || target >= order.length) return
    const next = [...order]; [next[index], next[target]] = [next[target], next[index]]
    try { localStorage.setItem(ORDER_PREFIX + owner, JSON.stringify(next)); setOrder(next); setOrderNotice('') }
    catch { setOrderNotice('排列未能保存，请检查设备存储空间') }
  }
  const arrangeControls = (id, title) => arranging && <div className="canvas-arrange-controls"><span>{title}</span><button type="button" disabled={order.indexOf(id) === 0} aria-label={`上移${title}`} onClick={() => move(id, -1)}><ArrowUp size={17} /></button><button type="button" disabled={order.indexOf(id) === order.length - 1} aria-label={`下移${title}`} onClick={() => move(id, 1)}><ArrowDown size={17} /></button></div>
  return <section className={`canvas-home${arranging ? ' is-arranging' : ''}`} aria-label="校园画布">
    <header className="canvas-masthead"><span>OurCampus</span><div><button type="button" aria-label="打开消息中心" onClick={onOpenMessages}><Bell size={21} />{unread > 0 && <i />}</button><button className="canvas-avatar" type="button" aria-label="打开我的主页" onClick={onOpenMe}><ProfileAvatar src={getAvatarUrl(auth.profile?.avatar_path)} name={auth.profile?.nickname || '我'} /></button></div></header>
    <div className="canvas-week"><div><h1>本周</h1><span>{week.range}</span></div><small>{week.today} {week.weekday}</small></div>
    <nav className="canvas-tool-rail" aria-label="校园工具"><button type="button" onClick={onSearch}><Search size={17} />搜索</button><button type="button" onClick={onOpenMap}>地图 <ArrowRight size={16} /></button><button type="button" onClick={onOpenServices}>办事</button><button type="button" onClick={onOpenCommunity}>社区</button></nav>
    <div className="canvas-composition">
      {order.map((id) => <section className={`canvas-section canvas-section--${id}`} key={id}>
        {arrangeControls(id, { space: '个人空间', events: '校园动态', places: '地点收藏' }[id])}
        {id === 'space' && <div className="canvas-image-rail" aria-label="个人空间与校园地图">
          <article className="canvas-visual canvas-visual--personal"><button className="canvas-visual__image" type="button" onClick={onOpenMe}><img src={home.cover || DEFAULT_PERSONAL_ARTWORK} alt={home.cover ? '我的自设封面' : '可更换的静物插画封面示例'} style={{ objectPosition: `${home.coverX}% ${home.coverY}%` }} /></button><button className="canvas-caption" type="button" onClick={onOpenMe}><strong>{home.cover ? '我的空间' : '选择自己的封面'}</strong><small>{home.cover ? '仅自己可见' : '插画封面示例 · 可以更换'}</small><ArrowRight size={17} /></button></article>
          <article className="canvas-visual canvas-visual--map"><button className="canvas-visual__image" type="button" onClick={onOpenMap}><img src={teamCampusMap.scenes['2d'].imageUrl} alt="校园地点引导图" /></button><button className="canvas-caption" type="button" onClick={onOpenMap}><strong>校园图鉴</strong><small>{locations.length} 个地点</small><ArrowRight size={17} /></button></article>
        </div>}
        {id === 'events' && <><div className="canvas-section-heading"><h2>校园动态</h2><button type="button" onClick={onOpenCommunity}>查看全部 <ArrowRight size={15} /></button></div>
          {currentEvents.length ? <div className="canvas-event-grid">{currentEvents.map((event) => <article className={`canvas-event${event.imagePaths?.length ? ' canvas-event--image' : ''}`} key={event.id}>
            {event.imagePaths?.length > 0 && <PostImageGallery paths={event.imagePaths} viewerId={auth.user?.id} label={event.title} />}
            <small>{event.isCloud && !event.isDemo ? '校园发布' : '示例动态'}</small><button className="canvas-event__title" type="button" onClick={() => setOpenedEvent(event.id)}><h3>{event.title}</h3><ArrowRight size={17} /></button>
            <p>{event.impact}</p>{locations.some((location) => location.id === event.locationId) && <button className="canvas-place-link" type="button" onClick={() => onSelectLocation(event.locationId)}><MapPin size={14} />{locations.find((location) => location.id === event.locationId).name}</button>}
          </article>)}</div> : <div className="canvas-empty"><p>还没有可展示的校园动态</p><button type="button" onClick={onOpenCommunity}>去社区看看 <ArrowRight size={16} /></button></div>}
        </>}
        {id === 'places' && <><div className="canvas-section-heading"><h2>{favoriteIds.length ? '我的地点' : '找地点'}</h2><button type="button" onClick={onSearch}>全部地点 <ArrowRight size={15} /></button></div><div className="canvas-place-index">{places.map((place, index) => <button type="button" key={place.id} onClick={() => onSelectLocation(place.id)}><small>{String(index + 1).padStart(2, '0')}</small><span>{place.name}</span><ArrowRight size={18} /></button>)}</div></>}
      </section>)}
    </div>
    <footer className="canvas-home-footer"><small>{arranging ? '排列只保存在当前设备' : '我的校园画布'}</small><button type="button" aria-pressed={arranging} onClick={() => setArranging((value) => !value)}>{arranging && <Check size={15} />}{arranging ? '完成' : '整理'}</button></footer>
    {orderNotice && <p className="canvas-order-notice" role="status">{orderNotice}</p>}
    {selectedEvent && <CanvasEventSheet event={selectedEvent} location={locations.find((location) => location.id === selectedEvent.locationId)} viewerId={auth.user?.id} onClose={() => setOpenedEvent(null)} onSelectLocation={(id) => { setOpenedEvent(null); onSelectLocation(id) }} />}
  </section>
}
