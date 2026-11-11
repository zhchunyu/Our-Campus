import { CalendarDays, MapPin, Navigation, Flame, Users, Construction, Megaphone, Sparkles } from 'lucide-react'
import { PostImageGallery } from './PostImageGallery.jsx'
import { useState } from 'react'
import { HOTSPOT_TYPE_LABELS } from '../../domain/campus.js'
import { getCampusRegionId } from '../../data/campusCommunity.js'

const types = [{ id: 'all', label: '全部动态' }, { id: 'activity', label: '活动' }, { id: 'crowd', label: '人流' }, { id: 'construction', label: '施工' }, { id: 'notice', label: '通知' }, { id: 'closure', label: '临时关闭' }]
const icons = { activity: CalendarDays, crowd: Users, construction: Construction, notice: Megaphone, closure: Construction }
const demoIds = new Set(['event-library-lecture', 'event-canteen-crowd', 'event-sports-training'])
const formatTime = (value) => value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '未设置'

export function CampusHotspotsPanel({ events, locations, regionId, onSelectLocation, onPlanRouteToLocation, onPublishInformation, onAskAi, viewerId }) {
  const [type, setType] = useState('all')
  const byId = new Map(locations.map((location) => [location.id, location]))
  const visible = events.filter((event) => (type === 'all' || event.type === type)
    && (regionId === 'all' || getCampusRegionId(byId.get(event.locationId)) === regionId))
    .sort((a, b) => Date.parse(b.startAt ?? 0) - Date.parse(a.startAt ?? 0))
  return (
    <div className="community-content">
      <div className="community-banner community-banner--hotspot"><Flame size={25} /><div><strong>看看校园正在发生什么</strong><p>活动、人流和通行信息，连接到同一张地图。</p></div></div>
      <div className="community-action-line"><span>发现校园新情况？</span><button className="community-primary" type="button" onClick={onPublishInformation}>发布校园信息</button></div>
      <div className="community-chip-strip" aria-label="热点类型">{types.map((option) => <button key={option.id} type="button" className={type === option.id ? 'is-active' : ''} aria-pressed={type === option.id} onClick={() => setType(option.id)}>{option.label}</button>)}</div>
      <div className="community-list-heading"><h3>当前动态</h3><span>{visible.length} 条</span></div>
      {visible.length ? visible.map((event) => {
        const location = byId.get(event.locationId)
        const Icon = icons[event.type] ?? Megaphone
        return <article className={`community-card community-hotspot community-hotspot--${event.type}`} key={event.id}>
          <div className="community-card-top"><span className="community-icon"><Icon size={20} /></span><span className="community-tag">{HOTSPOT_TYPE_LABELS[event.type] ?? '校园动态'}</span><small>{event.isCloud ? (event.informationScope === 'all' ? '已审核 · 全员通知' : '已审核 · 云端') : demoIds.has(event.id) ? '示例' : '本机发布'}</small></div>
          <h3>{event.title}</h3><p className="community-description">{event.impact || '详细安排请以现场或校方通知为准。'}</p>
          <PostImageGallery paths={event.imagePaths} viewerId={viewerId} label="校园动态照片" />
          <div className="community-meta"><MapPin size={13} />{location?.name ?? '地点未收录'}</div>
          <div className="community-meta"><CalendarDays size={13} />{formatTime(event.startAt)}{event.endAt ? ` 至 ${formatTime(event.endAt)}` : ''}</div>
          {onAskAi && <button className="context-ai-entry" type="button" onClick={() => onAskAi(`请根据这条校园动态分析对我的影响：${event.title}。地点：${location?.name ?? '未指定'}。信息：${event.impact ?? ''}。请区分已知事实与建议。`)}><Sparkles size={14} />让 AI 帮我分析</button>}
          <div className="community-card-actions"><button type="button" disabled={!location} onClick={() => onSelectLocation(event.locationId)}><MapPin size={14} />在地图查看</button><button type="button" disabled={!location} onClick={() => onPlanRouteToLocation(event.locationId)}><Navigation size={14} />去这里</button></div>
        </article>
      }) : <div className="community-empty"><Megaphone size={30} /><strong>这个分类暂时没有动态</strong><p>可以切换地区或查看其他类型。</p></div>}
      <p className="community-footnote">云端动态经过管理员确认；示例人流不代表实时人数。动态到期后自动退出当前列表。</p>
    </div>
  )
}
