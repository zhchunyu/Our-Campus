import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MapPin, Send, ShieldCheck, X } from 'lucide-react'
import { informationError, newReportId } from '../../data/campusInformation.js'
import {
  PLACE_FEEDBACK_DESCRIPTION_MAX_LENGTH,
  PLACE_FEEDBACK_TYPE_LABELS,
  PLACE_FEEDBACK_TYPES,
  REPAIR_CATEGORY_LABELS,
  validatePlaceFeedbackInput,
} from '../../domain/placeFeedback.js'

function toLocalDateTime(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 16)
}

const FEEDBACK_OPTIONS = Object.values(PLACE_FEEDBACK_TYPES)

export function PlaceFeedbackSheet({ location, onClose, onSubmitFeedback, initialType = PLACE_FEEDBACK_TYPES.CROWD }) {
  const [type, setType] = useState(initialType)
  const [description, setDescription] = useState('')
  const [suggestedDescription, setSuggestedDescription] = useState('')
  const [crowdStatus, setCrowdStatus] = useState(location.crowdStatus ?? 'normal')
  const [openStatus, setOpenStatus] = useState(location.openStatus ?? 'open')
  const [repairCategory, setRepairCategory] = useState('lighting')
  const [reportedEndAt, setReportedEndAt] = useState(() => toLocalDateTime(Date.now() + 4 * 60 * 60 * 1000))
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [syncToCloud, setSyncToCloud] = useState(true)
  const [submittedCloud, setSubmittedCloud] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const clientId = useRef(newReportId())
  const dialogRef = useRef(null)
  useBackLayer(true, () => { if (!submitting) onClose() }, 90)

  useEffect(() => {
    const previouslyFocused = document.activeElement
    dialogRef.current?.querySelector('select, textarea, input, button')?.focus()
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [onClose])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (submitting) return
    const input = {
      locationId: location.id,
      type,
      description,
      suggestedDescription,
      crowdStatus,
      openStatus,
      repairCategory,
      reportedEndAt,
      syncToCloud,
      clientId: clientId.current,
    }
    const validationError = validatePlaceFeedbackInput(input)
    if (validationError) {
      setError(validationError)
      return
    }

    setSubmitting(true)
    try {
      const result = await onSubmitFeedback(input)
      setSubmittedCloud(Boolean(result?.cloud)); setError(''); setSubmitted(true)
    } catch (e) { setError(informationError(e)) }
    finally { setSubmitting(false) }
  }

  return createPortal(
    <div
      className="place-feedback-backdrop"
      onMouseDown={(event) => {
        if (!submitting && event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="place-feedback-sheet"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="place-feedback-title"
      >
        <div className="place-feedback-sheet__handle" aria-hidden="true" />
        <header className="place-feedback-sheet__header">
          <div>
            <span><MapPin size={13} /> 校园 · 地点反馈</span>
            <h2 id="place-feedback-title">{submitted ? '反馈已收下' : type === PLACE_FEEDBACK_TYPES.REPAIR ? '提交设施报修' : '报告地点情况'}</h2>
            <p>{location.name}</p>
          </div>
          <button type="button" onClick={onClose} disabled={submitting} aria-label="关闭反馈窗口"><X size={18} /></button>
        </header>

        {submitted ? (
          <div className="place-feedback-success" role="status">
            <span><ShieldCheck size={23} /></span>
            <strong>{type === PLACE_FEEDBACK_TYPES.REPAIR ? '报修已提交，等待处理' : '已提交，等待管理员审核'}</strong>
            <p>{submittedCloud ? '已保存到云端，可在“消息中心 → 我的上报”查看分析与审核状态。施工等公共提醒由管理员核实后全员通知。' : '仅保存在当前设备，可在“我的”查看本机模拟审核状态。'}</p>
            <button type="button" onClick={onClose}>返回地点</button>
          </div>
        ) : (
          <form className="place-feedback-form" onSubmit={handleSubmit}>
            <label className="place-feedback-field">
              <span>反馈类型</span>
              <select value={type} onChange={(event) => { setType(event.target.value); setError('') }}>
                {FEEDBACK_OPTIONS.map((option) => <option key={option} value={option}>{PLACE_FEEDBACK_TYPE_LABELS[option]}</option>)}
              </select>
            </label>

            {type === PLACE_FEEDBACK_TYPES.CROWD && (
              <label className="place-feedback-field">
                <span>当前人流</span>
                <select value={crowdStatus} onChange={(event) => setCrowdStatus(event.target.value)}>
                  <option value="low">人流较少</option>
                  <option value="normal">人流一般</option>
                  <option value="busy">当前拥挤</option>
                </select>
              </label>
            )}

            {type === PLACE_FEEDBACK_TYPES.OPEN_STATUS && (
              <label className="place-feedback-field">
                <span>开放情况</span>
                <select value={openStatus} onChange={(event) => setOpenStatus(event.target.value)}>
                  <option value="open">开放</option>
                  <option value="limited">部分开放</option>
                  <option value="closed">暂时关闭</option>
                </select>
              </label>
            )}

            {type === PLACE_FEEDBACK_TYPES.REPAIR && (
              <label className="place-feedback-field">
                <span>报修设施</span>
                <select value={repairCategory} onChange={(event) => setRepairCategory(event.target.value)}>
                  {Object.entries(REPAIR_CATEGORY_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                </select>
              </label>
            )}

            {[PLACE_FEEDBACK_TYPES.CLOSURE, PLACE_FEEDBACK_TYPES.CONSTRUCTION].includes(type) && (
              <label className="place-feedback-field">
                <span>预计结束时间</span>
                <input
                  type="datetime-local"
                  min={toLocalDateTime(new Date())}
                  value={reportedEndAt}
                  onChange={(event) => setReportedEndAt(event.target.value)}
                  required
                />
              </label>
            )}

            <label className="place-feedback-field">
              <span>情况说明 <small>{description.length}/{PLACE_FEEDBACK_DESCRIPTION_MAX_LENGTH}</small></span>
              <textarea
                value={description}
                onChange={(event) => { setDescription(event.target.value); setError('') }}
                maxLength={PLACE_FEEDBACK_DESCRIPTION_MAX_LENGTH}
                rows={3}
                placeholder={`简要说明${PLACE_FEEDBACK_TYPE_LABELS[type]}情况`}
                required
              />
            </label>

            {type === PLACE_FEEDBACK_TYPES.LOCATION_INFO && (
              <label className="place-feedback-field">
                <span>建议修正内容 <small>{suggestedDescription.length}/{PLACE_FEEDBACK_DESCRIPTION_MAX_LENGTH}</small></span>
                <textarea
                  value={suggestedDescription}
                  onChange={(event) => { setSuggestedDescription(event.target.value); setError('') }}
                  maxLength={PLACE_FEEDBACK_DESCRIPTION_MAX_LENGTH}
                  rows={2}
                  placeholder="填写核实后的地点介绍"
                  required
                />
              </label>
            )}

            {error && <p className="place-feedback-error" role="alert">{error}</p>}
            <label className="information-consent"><input type="checkbox" checked={syncToCloud} disabled={submitting} onChange={(e) => setSyncToCloud(e.target.checked)} />同步到云端，由 AI 分析并交给管理员确认</label>
            <p className="place-feedback-local-note">关闭云端同步后，仅保存在本机供模拟审核。</p>
            <button className="place-feedback-submit" type="submit" disabled={submitting}><Send size={15} /> {submitting ? '提交中…' : '提交审核'}</button>
          </form>
        )}
      </section>
    </div>,
    document.body,
  )
}
import { useBackLayer } from '../../app/useBackLayer.js'
