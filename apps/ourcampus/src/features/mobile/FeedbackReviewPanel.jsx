import { campusDisplayText } from '../../data/campusPresentation.js'
import { useMemo, useState } from 'react'
import { Check, Clock3, MapPin, ShieldAlert, ThumbsDown, ThumbsUp } from 'lucide-react'
import { getRoadEdgeOptions } from '../../data/routeGraph.js'
import { CROWD_STATUS_LABELS, OPEN_STATUS_LABELS } from '../../domain/campus.js'
import {
  PLACE_FEEDBACK_STATUS_LABELS,
  PLACE_FEEDBACK_STATUSES,
  PLACE_FEEDBACK_TYPES,
  PLACE_FEEDBACK_TYPE_LABELS,
} from '../../domain/placeFeedback.js'

const REVIEW_STATUSES = [
  PLACE_FEEDBACK_STATUSES.PENDING,
  PLACE_FEEDBACK_STATUSES.APPROVED,
  PLACE_FEEDBACK_STATUSES.REJECTED,
]

function toLocalDateTime(value) {
  const date = value ? new Date(value) : new Date(Date.now() + 4 * 60 * 60 * 1000)
  if (Number.isNaN(date.getTime())) return ''
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 16)
}

function formatDateTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '时间未知'
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date)
}

function FeedbackReviewItem({ feedback, location, onReview }) {
  const [crowdStatus, setCrowdStatus] = useState(feedback.crowdStatus ?? 'normal')
  const [openStatus, setOpenStatus] = useState(feedback.openStatus ?? 'open')
  const [approvedDescription, setApprovedDescription] = useState(feedback.suggestedDescription ?? '')
  const [endAt, setEndAt] = useState(() => toLocalDateTime(feedback.reportedEndAt))
  const [affectedEdgeIds, setAffectedEdgeIds] = useState([])
  const [edgeFilter, setEdgeFilter] = useState('')
  const [reviewNote, setReviewNote] = useState('')
  const [error, setError] = useState('')
  const roadOptions = useMemo(() => getRoadEdgeOptions(location?.id), [location?.id])
  const visibleRoadOptions = roadOptions.filter((option) => (
    affectedEdgeIds.includes(option.id)
    || `${option.label} ${option.detail} ${option.id}`.toLowerCase().includes(edgeFilter.trim().toLowerCase())
  )).slice(0, 16)

  const submitReview = (decision) => {
    const note = reviewNote.trim()
    if (note.length > 120) {
      setError('审核说明不能超过 120 字。')
      return
    }

    const changes = { feedbackId: feedback.id, decision, reviewNote: note }
    if (decision === PLACE_FEEDBACK_STATUSES.APPROVED) {
      if (feedback.type === PLACE_FEEDBACK_TYPES.CROWD) changes.crowdStatus = crowdStatus
      if (feedback.type === PLACE_FEEDBACK_TYPES.OPEN_STATUS) changes.openStatus = openStatus
      if (feedback.type === PLACE_FEEDBACK_TYPES.LOCATION_INFO) {
        if (!approvedDescription.trim()) {
          setError('请填写确认后的地点介绍。')
          return
        }
        changes.approvedDescription = approvedDescription.trim()
      }
      if ([PLACE_FEEDBACK_TYPES.CLOSURE, PLACE_FEEDBACK_TYPES.CONSTRUCTION].includes(feedback.type)) {
        const endTimestamp = new Date(endAt).getTime()
        if (!Number.isFinite(endTimestamp) || endTimestamp <= Date.now()) {
          setError('动态结束时间必须晚于当前时间。')
          return
        }
        changes.endAt = new Date(endTimestamp).toISOString()
        changes.affectedEdgeIds = affectedEdgeIds
        if (feedback.type === PLACE_FEEDBACK_TYPES.CONSTRUCTION && affectedEdgeIds.length === 0) {
          setError('施工提醒至少选择一条受影响路段。')
          return
        }
      }
    }

    setError('')
    onReview(changes)
  }

  const isPending = feedback.status === PLACE_FEEDBACK_STATUSES.PENDING
  const isRoadFeedback = [PLACE_FEEDBACK_TYPES.CLOSURE, PLACE_FEEDBACK_TYPES.CONSTRUCTION].includes(feedback.type)

  return (
    <article className={`feedback-review-item${isPending ? '' : ' is-processed'}`}>
      <header className="feedback-review-item__header">
        <span className="feedback-review-item__type">{PLACE_FEEDBACK_TYPE_LABELS[feedback.type]}</span>
        <span className={`feedback-review-item__status feedback-review-item__status--${feedback.status}`}>
          {PLACE_FEEDBACK_STATUS_LABELS[feedback.status]}
        </span>
      </header>
      <div className="feedback-review-item__location"><MapPin size={13} />{location?.name ?? '地点已不存在'}</div>
      <p className="feedback-review-item__description">{campusDisplayText(feedback.description)}</p>
      <div className="feedback-review-item__time"><Clock3 size={12} />提交于 {formatDateTime(feedback.submittedAt)} · {feedback.reporterLabel}</div>

      {isPending && (
        <div className="feedback-review-item__decision">
          {feedback.type === PLACE_FEEDBACK_TYPES.CROWD && (
            <label className="feedback-review-field">
              <span>确认人流</span>
              <select value={crowdStatus} onChange={(event) => setCrowdStatus(event.target.value)}>
                {Object.entries(CROWD_STATUS_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>
          )}
          {feedback.type === PLACE_FEEDBACK_TYPES.OPEN_STATUS && (
            <label className="feedback-review-field">
              <span>确认开放状态</span>
              <select value={openStatus} onChange={(event) => setOpenStatus(event.target.value)}>
                {Object.entries(OPEN_STATUS_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>
          )}
          {feedback.type === PLACE_FEEDBACK_TYPES.LOCATION_INFO && (
            <div className="feedback-review-field">
              <span>地点介绍修正</span>
              <p className="feedback-review-item__original">当前：{location?.description || '暂无介绍'}</p>
              <textarea value={approvedDescription} maxLength={240} rows={3} onChange={(event) => setApprovedDescription(event.target.value)} aria-label="确认后的地点介绍" />
            </div>
          )}
          {isRoadFeedback && (
            <div className="feedback-review-field">
              <span>确认结束时间</span>
              <input type="datetime-local" min={toLocalDateTime(new Date())} value={endAt} onChange={(event) => setEndAt(event.target.value)} />
              <label className="feedback-review-road-search">
                <span>筛选附近路段</span>
                <input value={edgeFilter} onChange={(event) => setEdgeFilter(event.target.value)} placeholder="搜索地点或道路编号" />
              </label>
              <div className="feedback-review-roads" role="group" aria-label="受影响道路">
                {visibleRoadOptions.map((option) => (
                  <label className={`feedback-review-road${affectedEdgeIds.includes(option.id) ? ' is-selected' : ''}`} key={option.id}>
                    <input
                      type="checkbox"
                      checked={affectedEdgeIds.includes(option.id)}
                      onChange={(event) => setAffectedEdgeIds((current) => event.target.checked
                        ? [...new Set([...current, option.id])]
                        : current.filter((edgeId) => edgeId !== option.id))}
                    />
                    <span><strong>{option.label}</strong><small>{option.detail}</small></span>
                  </label>
                ))}
                {visibleRoadOptions.length === 0 && <small className="feedback-review-roads__empty">没有匹配的道路。</small>}
              </div>
              <small className="feedback-review-field__hint">已选 {affectedEdgeIds.length} 段{feedback.type === PLACE_FEEDBACK_TYPES.CONSTRUCTION ? ' · 施工至少选择一段' : ' · 可选'}</small>
            </div>
          )}

          <label className="feedback-review-field">
            <span>审核备注 <small>可选，最多 120 字</small></span>
            <textarea value={reviewNote} maxLength={120} rows={2} onChange={(event) => setReviewNote(event.target.value)} placeholder="驳回时可填写原因" />
          </label>
          {error && <p className="feedback-review-error" role="alert">{error}</p>}
          <div className="feedback-review-item__actions">
            <button type="button" className="feedback-review-reject" onClick={() => submitReview(PLACE_FEEDBACK_STATUSES.REJECTED)}><ThumbsDown size={13} />驳回</button>
            <button type="button" className="feedback-review-approve" onClick={() => submitReview(PLACE_FEEDBACK_STATUSES.APPROVED)}><ThumbsUp size={13} />通过并生效</button>
          </div>
        </div>
      )}

      {!isPending && (
        <div className="feedback-review-item__result">
          <Check size={13} />{PLACE_FEEDBACK_STATUS_LABELS[feedback.status]} · {formatDateTime(feedback.reviewedAt)}
          {feedback.reviewNote && <p>{campusDisplayText(feedback.reviewNote)}</p>}
        </div>
      )}
    </article>
  )
}

export function FeedbackReviewPanel({ feedbacks = [], locations = [], onReview }) {
  const [activeStatus, setActiveStatus] = useState(PLACE_FEEDBACK_STATUSES.PENDING)
  const counts = useMemo(() => Object.fromEntries(
    REVIEW_STATUSES.map((status) => [status, feedbacks.filter((entry) => entry.status === status).length]),
  ), [feedbacks])
  const visibleFeedbacks = useMemo(() => feedbacks
    .filter((entry) => entry.status === activeStatus)
    .sort((left, right) => new Date(right.submittedAt).getTime() - new Date(left.submittedAt).getTime()), [feedbacks, activeStatus])
  const handleReview = (decision) => {
    onReview(decision)
    setActiveStatus(decision.decision)
  }

  return (
    <section className="feedback-review-panel" aria-label="地点反馈审核">
      <div className="feedback-review-panel__intro">
        <span><ShieldAlert size={16} /></span>
        <p>在本机审核反馈。通过后，地点状态或校园动态会立即生效。</p>
      </div>
      <div className="feedback-review-tabs" role="tablist" aria-label="反馈审核状态">
        {REVIEW_STATUSES.map((status) => (
          <button
            type="button"
            role="tab"
            aria-selected={activeStatus === status}
            className={activeStatus === status ? 'is-active' : ''}
            key={status}
            onClick={() => setActiveStatus(status)}
          >
            {PLACE_FEEDBACK_STATUS_LABELS[status]} <span>{counts[status] ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="feedback-review-list">
        {visibleFeedbacks.map((feedback) => (
          <FeedbackReviewItem
            key={feedback.id}
            feedback={feedback}
            location={locations.find((entry) => entry.id === feedback.locationId)}
            onReview={handleReview}
          />
        ))}
        {visibleFeedbacks.length === 0 && (
          <p className="feedback-review-empty">{activeStatus === PLACE_FEEDBACK_STATUSES.PENDING ? '暂无待审核反馈。' : '还没有这类审核记录。'}</p>
        )}
      </div>
    </section>
  )
}
