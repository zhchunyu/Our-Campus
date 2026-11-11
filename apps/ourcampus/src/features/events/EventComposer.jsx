import { useMemo, useState } from 'react'
import { Check, Pencil, Send, Square, X } from 'lucide-react'
import { HOTSPOT_TYPE_LABELS, HOTSPOT_TYPES } from '../../domain/campus.js'
import { getDefaultAffectedEdgeIds } from '../../data/events.js'
import { getRoadEdgeOptions } from '../../data/routeGraph.js'

const typeOptions = Object.values(HOTSPOT_TYPES)
const EVENT_DURATION_MS = 2 * 60 * 60 * 1000

function toLocalDateTime(value) {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return ''
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 16)
}

function createDraft(locations) {
  const now = new Date()
  return {
    title: '',
    type: HOTSPOT_TYPES.ACTIVITY,
    activityCategory: '讲座',
    locationId: locations[0]?.id ?? '',
    heatLevel: 'medium',
    impact: '',
    startAt: toLocalDateTime(now),
    endAt: toLocalDateTime(new Date(now.getTime() + EVENT_DURATION_MS)),
    affectedEdgeIds: [],
  }
}

export function EventComposer({ locations, events, onPublish, onUpdate, onClose }) {
  const [draft, setDraft] = useState(() => createDraft(locations))
  const [editingId, setEditingId] = useState(null)
  const [formError, setFormError] = useState('')
  const [roadFilter, setRoadFilter] = useState('')
  const roadOptions = useMemo(() => getRoadEdgeOptions(draft.locationId), [draft.locationId])
  const matchingRoadOptions = roadOptions.filter((option) => (
    `${option.label} ${option.detail} ${option.id}`.toLowerCase().includes(roadFilter.trim().toLowerCase())
  ))
  const selectedRoadOptions = roadOptions.filter((option) => draft.affectedEdgeIds.includes(option.id))
  const visibleRoadOptions = [
    ...selectedRoadOptions,
    ...matchingRoadOptions.filter((option) => !draft.affectedEdgeIds.includes(option.id)).slice(0, 12),
  ]

  const resetDraft = () => {
    setDraft(createDraft(locations))
    setEditingId(null)
    setFormError('')
    setRoadFilter('')
  }

  const updateDraft = (field, value) => {
    setDraft((current) => {
      const next = { ...current, [field]: value }
      if (field === 'type' || field === 'locationId') {
        next.affectedEdgeIds = getDefaultAffectedEdgeIds({
          type: next.type,
          locationId: next.locationId,
        })
      }
      return next
    })
    setFormError('')
  }

  const beginEditing = (event) => {
    setDraft({
      title: event.title,
      type: event.type,
      activityCategory: event.activityCategory ?? '其他',
      locationId: event.locationId,
      heatLevel: event.heatLevel ?? 'medium',
      impact: event.impact ?? '',
      startAt: toLocalDateTime(event.startAt),
      endAt: toLocalDateTime(event.endAt),
      affectedEdgeIds: [...(event.affectedEdgeIds ?? [])],
    })
    setEditingId(event.id)
    setFormError('')
    setRoadFilter('')
  }

  const submit = (event) => {
    event.preventDefault()
    if (!draft.title.trim() || !draft.locationId) {
      setFormError('请填写标题并选择地点。')
      return
    }
    if (draft.type === HOTSPOT_TYPES.CONSTRUCTION && draft.affectedEdgeIds.length === 0) {
      setFormError('施工热点至少选择一条受影响路段。')
      return
    }

    const startTimestamp = new Date(draft.startAt).getTime()
    const endTimestamp = new Date(draft.endAt).getTime()
    if (!Number.isFinite(startTimestamp) || !Number.isFinite(endTimestamp) || endTimestamp <= startTimestamp) {
      setFormError('结束时间必须晚于开始时间。')
      return
    }
    if (!editingId && endTimestamp <= Date.now()) {
      setFormError('结束时间已过去，请选择未来时间。')
      return
    }

    const payload = {
      title: draft.title.trim(),
      type: draft.type,
      activityCategory: draft.type === HOTSPOT_TYPES.ACTIVITY ? draft.activityCategory : undefined,
      locationId: draft.locationId,
      status: 'active',
      startAt: new Date(startTimestamp).toISOString(),
      endAt: new Date(endTimestamp).toISOString(),
      heatLevel: draft.heatLevel,
      impact: draft.impact.trim() || '暂无额外影响说明。',
      affectedEdgeIds: draft.affectedEdgeIds,
      source: 'manager',
      visibleTo: ['visitor', 'student', 'manager'],
    }

    if (editingId) onUpdate?.(editingId, payload)
    else onPublish({ ...payload, id: `event-${Date.now()}` })
    resetDraft()
  }

  const hasNoConstructionRoads = draft.type === HOTSPOT_TYPES.CONSTRUCTION && draft.affectedEdgeIds.length === 0

  return (
    <div className="event-composer">
      <div className="event-composer__heading">
        <span><Send size={14} /> {editingId ? '编辑校园热点' : '发布校园热点'}</span>
        {editingId && <button type="button" onClick={resetDraft} aria-label="取消热点编辑"><X size={14} /></button>}
      </div>
      <form onSubmit={submit}>
        <label>热点标题<input value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} placeholder="例如：图书馆讲座开始" required /></label>
        <div className="event-composer__grid">
          <label>类型<select value={draft.type} onChange={(event) => updateDraft('type', event.target.value)}>{typeOptions.map((option) => <option value={option} key={option}>{HOTSPOT_TYPE_LABELS[option]}</option>)}</select></label>
          <label>地点<select value={draft.locationId} onChange={(event) => updateDraft('locationId', event.target.value)}>{locations.map((location) => <option value={location.id} key={location.id}>{location.name}</option>)}</select></label>
        </div>
        {draft.type === HOTSPOT_TYPES.ACTIVITY && (
          <label>活动类别<select value={draft.activityCategory} onChange={(event) => updateDraft('activityCategory', event.target.value)}><option>讲座</option><option>比赛</option><option>社团活动</option><option>其他</option></select></label>
        )}
        <div className="event-composer__grid">
          <label>开始时间<input type="datetime-local" value={draft.startAt} onChange={(event) => updateDraft('startAt', event.target.value)} required /></label>
          <label>结束时间<input type="datetime-local" value={draft.endAt} onChange={(event) => updateDraft('endAt', event.target.value)} required /></label>
        </div>
        {draft.type === HOTSPOT_TYPES.CONSTRUCTION && (
          <div className="event-composer__road-picker">
            <label>影响道路（共享路网）<input value={roadFilter} onChange={(event) => setRoadFilter(event.target.value)} placeholder="搜索附近位置或道路节点编号" /></label>
            <div className="event-composer__roads" role="group" aria-label="施工影响道路">
              {visibleRoadOptions.map((option) => (
                <label className={`event-composer__road-option${draft.affectedEdgeIds.includes(option.id) ? ' is-selected' : ''}`} key={option.id}>
                  <input
                    type="checkbox"
                    checked={draft.affectedEdgeIds.includes(option.id)}
                    onChange={(event) => {
                      setDraft((current) => ({
                        ...current,
                        affectedEdgeIds: event.target.checked
                          ? [...new Set([...current.affectedEdgeIds, option.id])]
                          : current.affectedEdgeIds.filter((edgeId) => edgeId !== option.id),
                      }))
                      setFormError('')
                    }}
                  />
                  <span><strong>{option.label}</strong><small>{option.detail}</small></span>
                </label>
              ))}
              {visibleRoadOptions.length === 0 && <span className="event-composer__road-empty">没有匹配的路段，请换节点编号或地点关键词搜索。</span>}
            </div>
            <small className="event-composer__road-count">已选 {draft.affectedEdgeIds.length} 段 · 结果按距当前地点排序</small>
          </div>
        )}
        {hasNoConstructionRoads && <p className="event-composer__notice">请从共享道路网络中选择受影响路段，发布后路线会自动避开。</p>}
        <label>影响说明<input value={draft.impact} onChange={(event) => updateDraft('impact', event.target.value)} placeholder="描述对校园的影响" /></label>
        <label>热度<select value={draft.heatLevel} onChange={(event) => updateDraft('heatLevel', event.target.value)}><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select></label>
        {formError && <p className="event-composer__error" role="alert">{formError}</p>}
        <div className="event-composer__form-actions">
          {editingId && <button type="button" onClick={resetDraft}>取消</button>}
          <button className="event-composer__submit" type="submit"><Check size={13} />{editingId ? '保存修改' : '发布到地图'}</button>
        </div>
      </form>
      <div className="event-composer__active">
        <small>当前有效热点</small>
        {events.length === 0 && <span>暂无进行中的热点</span>}
        {events.map((event) => (
          <div className="event-composer__event" key={event.id}>
            <span title={event.title}>{event.title}</span>
            <button className="event-composer__edit" type="button" onClick={() => beginEditing(event)} aria-label={`编辑${event.title}`} title="编辑"><Pencil size={12} /></button>
            <button className="event-composer__end" type="button" onClick={() => onClose(event.id)} aria-label={`结束${event.title}`} title="结束"><Square size={12} /></button>
          </div>
        ))}
      </div>
    </div>
  )
}
