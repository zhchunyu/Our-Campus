import { useEffect, useId, useRef, useState } from 'react'
import { Activity, CalendarClock, Check, ChevronRight, ExternalLink, Flag, LockKeyhole, MapPinned, Navigation, RotateCcw, Sparkles, Star, UsersRound, UtensilsCrossed, X } from 'lucide-react'
import { canManage, CATEGORY_LABELS, CROWD_STATUS_LABELS, OPEN_STATUS_LABELS, ROLE_LABELS } from '../../domain/campus.js'
import { StatusBadge } from '../../components/StatusBadge.jsx'
import { PlaceFeedbackSheet } from './PlaceFeedbackSheet.jsx'
import { isRestaurantLocation } from '../../data/restaurantReviews.js'
import { canShowCampusLink } from '../../data/campusPresentation.js'
import { IndoorNavigationNotice } from '../mobile/IndoorNavigationNotice.jsx'

function openTone(status) {
  return status === 'open' ? 'open' : status === 'limited' ? 'limited' : 'closed'
}

function crowdTone(status) {
  return status === 'busy' ? 'busy' : status === 'normal' ? 'normal' : 'low'
}

function editableValues(location) {
  return {
    openStatus: location?.openStatus ?? 'open',
    crowdStatus: location?.crowdStatus ?? 'normal',
    activity: location?.activity ?? '',
  }
}

function formatUpdatedAt(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value || '暂无记录'

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function LocationDetail({ location, events = [], lostFoundPosts = [], onOpenLostFound, onOpenReviews, role, isFavorite = false, onToggleFavorite, onUpdate, onClose, onPlanRoute, onSubmitFeedback, onAskAi }) {
  const [draft, setDraft] = useState(() => editableValues(location))
  const [showFeedbackSheet, setShowFeedbackSheet] = useState(false)
  const titleId = useId()
  const bodyRef = useRef(null)

  useEffect(() => {
    setDraft(editableValues(location))
    setShowFeedbackSheet(false)
  }, [location?.id, location?.openStatus, location?.crowdStatus, location?.activity])

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 })
  }, [location?.id])

  useEffect(() => {
    if (!location || showFeedbackSheet) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !event.defaultPrevented) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [location, onClose, showFeedbackSheet])

  if (!location) {
    return (
      <aside className="detail-panel detail-panel--empty">
        <div className="detail-panel__empty-icon"><MapPinned size={22} /></div>
        <strong>选择一个地点</strong>
        <p>从左侧列表选择地点，这里会展示它的校园状态。</p>
      </aside>
    )
  }

  const managerMode = canManage(role)
  const hasChanges = draft.openStatus !== location.openStatus
    || draft.crowdStatus !== location.crowdStatus
    || draft.activity !== (location.activity ?? '')

  return (
    <>
    <section className="detail-panel location-sheet" role="dialog" aria-modal="false" aria-labelledby={titleId}>
      <div className="location-sheet__handle" aria-hidden="true" />
      <div className="detail-panel__header">
        <div className="location-sheet__identity">
          <span className="location-sheet__icon"><MapPinned size={22} strokeWidth={1.7} /></span>
          <div>
            <div className="eyebrow">{CATEGORY_LABELS[location.category] ?? '校园地点'}</div>
            <h2 id={titleId}>{location.name}</h2>
          </div>
        </div>
        <button className="detail-close" type="button" onClick={onClose} aria-label="关闭地点详情"><X size={19} /></button>
      </div>
      <div className="location-sheet__body" ref={bodyRef}>
      <p className="detail-panel__description">{location.description}</p>
      {onAskAi && <button className="context-ai-entry" type="button" onClick={() => onAskAi(`我想了解${location.name}，请结合已有校园信息给出建议。当前记录：${OPEN_STATUS_LABELS[location.openStatus]}，${CROWD_STATUS_LABELS[location.crowdStatus]}。动态：${location.activity || '暂无'}。请说明信息缺口，不推测实时情况。`)}><Sparkles size={14} />问 AI 关于这里</button>}

      {isRestaurantLocation(location) && onOpenReviews && (
        <button className="restaurant-review-entry" type="button" onClick={onOpenReviews}>
          <span className="restaurant-review-entry__icon"><UtensilsCrossed size={20} /></span>
          <span><strong>窗口评价</strong><small>按窗口看口碑，分享用餐体验</small></span>
          <ChevronRight size={17} />
        </button>
      )}

      <div className="detail-status-grid">
        <div className="detail-status-card">
          <span className="detail-status-card__label">开放状态</span>
          {managerMode ? (
            <select
              value={draft.openStatus}
              onChange={(event) => setDraft((current) => ({ ...current, openStatus: event.target.value }))}
            >
              {Object.entries(OPEN_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          ) : <StatusBadge label={OPEN_STATUS_LABELS[location.openStatus]} tone={openTone(location.openStatus)} />}
        </div>
        <div className="detail-status-card">
          <span className="detail-status-card__label">当前人流</span>
          {managerMode ? (
            <select
              value={draft.crowdStatus}
              onChange={(event) => setDraft((current) => ({ ...current, crowdStatus: event.target.value }))}
            >
              {Object.entries(CROWD_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          ) : <StatusBadge label={CROWD_STATUS_LABELS[location.crowdStatus]} tone={crowdTone(location.crowdStatus)} />}
        </div>
      </div>

      <div className="detail-section">
        <div className="detail-section__heading"><Activity size={15} /> 当前动态</div>
        {managerMode ? (
          <input
            className="detail-input"
            value={draft.activity}
            onChange={(event) => setDraft((current) => ({ ...current, activity: event.target.value }))}
            aria-label="当前动态"
          />
        ) : <p className="activity-copy">{location.activity || '暂无活动信息'}</p>}
      </div>

      {events.length > 0 && (
        <div className="detail-section detail-events">
          <div className="detail-section__heading"><Activity size={15} /> 现场热点</div>
          {events.map((event) => <div className="detail-event" key={event.id}><strong>{event.title}</strong><span>{event.impact}</span></div>)}
        </div>
      )}

      {lostFoundPosts.length > 0 && <button className="community-location-posts" type="button" onClick={onOpenLostFound}><strong>这里有 {lostFoundPosts.length} 条失物信息</strong><span>{lostFoundPosts.map((post) => post.title).join('、')} · 打开社区查看</span></button>}
      <details className="location-sheet__more">
        <summary>地点信息记录 <ChevronRight size={15} /></summary>
        <div className="detail-meta-list">
        <div><CalendarClock size={15} /><span>数据更新时间</span><strong>{formatUpdatedAt(location.updatedAt)}</strong></div>
        {location.updatedBy && <div><UsersRound size={15} /><span>最近修改人</span><strong>{location.updatedBy}</strong></div>}
        <div><UsersRound size={15} /><span>当前视角</span><strong>{ROLE_LABELS[role]}</strong></div>
        <div><LockKeyhole size={15} /><span>数据范围</span><strong>本地演示</strong></div>
        </div>
        {location.category === 'learning' && <IndoorNavigationNotice />}
      </details>

      {managerMode && hasChanges && (
        <div className="detail-edit-actions">
          <button type="button" onClick={() => setDraft(editableValues(location))}><RotateCcw size={13} />取消修改</button>
          <button type="button" onClick={() => onUpdate(draft)}><Check size={13} />保存修改</button>
        </div>
      )}
      <div className="location-sheet__links">
      {canShowCampusLink(location.externalUrl) && (
        <a className="detail-external-link" href={location.externalUrl} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={14} /> 访问官网
        </a>
      )}
      <button className="detail-feedback-action" type="button" onClick={() => setShowFeedbackSheet(true)}>
        <Flag size={14} /> 反馈地点
      </button>
      </div>
      </div>
      <footer className="location-sheet__footer">
        <button className={`detail-favorite-action${isFavorite ? ' is-active' : ''}`} type="button" aria-pressed={isFavorite} onClick={onToggleFavorite}>
          <Star size={18} fill={isFavorite ? 'currentColor' : 'none'} /> {isFavorite ? '已收藏' : '收藏'}
        </button>
        <button className="detail-action" type="button" onClick={onPlanRoute}><Navigation size={18} /> 去这里</button>
      </footer>
    </section>
    {showFeedbackSheet && onSubmitFeedback && (
      <PlaceFeedbackSheet
        location={location}
        onClose={() => setShowFeedbackSheet(false)}
        onSubmitFeedback={onSubmitFeedback}
      />
    )}
    </>
  )
}
