export const PLACE_FEEDBACK_TYPES = Object.freeze({
  CROWD: 'crowd',
  OPEN_STATUS: 'open-status',
  CLOSURE: 'closure',
  CONSTRUCTION: 'construction',
  LOCATION_INFO: 'location-info',
  REPAIR: 'facility-repair',
})

export const PLACE_FEEDBACK_STATUSES = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
})

export const PLACE_FEEDBACK_TYPE_LABELS = Object.freeze({
  crowd: '人流拥挤',
  'open-status': '开放状态',
  closure: '临时关闭',
  construction: '施工提醒',
  'location-info': '地点信息错误',
  'facility-repair': '设施报修',
})

export const PLACE_FEEDBACK_STATUS_LABELS = Object.freeze({
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回',
  processing: '处理中',
  completed: '已完成',
})

export const REPAIR_CATEGORY_LABELS = Object.freeze({
  lighting: '路灯',
  dispenser: '饮水机',
  elevator: '电梯',
  other: '其他设施',
})

export const PLACE_FEEDBACK_DESCRIPTION_MAX_LENGTH = 240
export const PLACE_FEEDBACK_REVIEW_NOTE_MAX_LENGTH = 120

const feedbackTypeValues = new Set(Object.values(PLACE_FEEDBACK_TYPES))
const crowdStatusValues = new Set(['low', 'normal', 'busy'])
const openStatusValues = new Set(['open', 'limited', 'closed'])

function toValidDate(value) {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function validatePlaceFeedbackInput(input, now = new Date()) {
  if (!input || typeof input !== 'object') return '反馈内容无效，请重新填写。'
  if (!input.locationId || typeof input.locationId !== 'string') return '请先选择一个地点。'
  if (!feedbackTypeValues.has(input.type)) return '请选择有效的反馈类型。'

  const description = String(input.description ?? '').trim()
  if (!description) return '请简要说明反馈内容。'
  if (description.length > PLACE_FEEDBACK_DESCRIPTION_MAX_LENGTH) return '说明不能超过 240 字。'

  if (input.type === PLACE_FEEDBACK_TYPES.CROWD && !crowdStatusValues.has(input.crowdStatus)) {
    return '请选择当前人流状态。'
  }
  if (input.type === PLACE_FEEDBACK_TYPES.OPEN_STATUS && !openStatusValues.has(input.openStatus)) {
    return '请选择地点开放状态。'
  }
  if (input.type === PLACE_FEEDBACK_TYPES.LOCATION_INFO) {
    const suggestion = String(input.suggestedDescription ?? '').trim()
    if (!suggestion) return '请填写建议修正后的地点信息。'
    if (suggestion.length > PLACE_FEEDBACK_DESCRIPTION_MAX_LENGTH) return '建议内容不能超过 240 字。'
  }
  if (input.type === PLACE_FEEDBACK_TYPES.REPAIR && !Object.hasOwn(REPAIR_CATEGORY_LABELS, input.repairCategory)) {
    return '请选择需要报修的设施类型。'
  }
  if ([PLACE_FEEDBACK_TYPES.CLOSURE, PLACE_FEEDBACK_TYPES.CONSTRUCTION].includes(input.type)) {
    const endAt = toValidDate(input.reportedEndAt)
    const currentTime = toValidDate(now)
    if (!endAt || !currentTime || endAt.getTime() <= currentTime.getTime()) return '请选择未来的预计结束时间。'
  }

  return ''
}

function makeId() {
  const suffix = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  return `feedback-${suffix}`
}

export function createPlaceFeedback(input, now = new Date()) {
  const error = validatePlaceFeedbackInput(input, now)
  if (error) throw new Error(error)

  return {
    id: makeId(),
    locationId: input.locationId,
    type: input.type,
    description: String(input.description).trim(),
    suggestedDescription: input.type === PLACE_FEEDBACK_TYPES.LOCATION_INFO
      ? String(input.suggestedDescription ?? '').trim()
      : '',
    crowdStatus: input.type === PLACE_FEEDBACK_TYPES.CROWD ? input.crowdStatus : null,
    openStatus: input.type === PLACE_FEEDBACK_TYPES.OPEN_STATUS ? input.openStatus : null,
    repairCategory: input.type === PLACE_FEEDBACK_TYPES.REPAIR ? input.repairCategory : null,
    reportedEndAt: [PLACE_FEEDBACK_TYPES.CLOSURE, PLACE_FEEDBACK_TYPES.CONSTRUCTION].includes(input.type)
      ? new Date(input.reportedEndAt).toISOString()
      : null,
    status: PLACE_FEEDBACK_STATUSES.PENDING,
    submittedAt: now.toISOString(),
    reporterLabel: '本机访客',
    reviewedAt: null,
    reviewedBy: null,
    reviewNote: '',
    approvedEventId: null,
  }
}

export function isSavedPlaceFeedback(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  if (typeof value.id !== 'string' || typeof value.locationId !== 'string') return false
  if (!feedbackTypeValues.has(value.type)) return false
  if (!Object.values(PLACE_FEEDBACK_STATUSES).includes(value.status)) return false
  if (typeof value.description !== 'string' || value.description.length > PLACE_FEEDBACK_DESCRIPTION_MAX_LENGTH) return false
  if (!Number.isFinite(Date.parse(value.submittedAt))) return false
  if (value.suggestedDescription !== undefined && (
    typeof value.suggestedDescription !== 'string'
    || value.suggestedDescription.length > PLACE_FEEDBACK_DESCRIPTION_MAX_LENGTH
  )) return false
  if (value.crowdStatus != null && !crowdStatusValues.has(value.crowdStatus)) return false
  if (value.openStatus != null && !openStatusValues.has(value.openStatus)) return false
  if (value.repairCategory != null && !Object.hasOwn(REPAIR_CATEGORY_LABELS, value.repairCategory)) return false
  if (value.reportedEndAt != null && !Number.isFinite(Date.parse(value.reportedEndAt))) return false
  if (value.reviewedAt != null && !Number.isFinite(Date.parse(value.reviewedAt))) return false
  if (value.reviewedBy != null && typeof value.reviewedBy !== 'string') return false
  if (value.reviewNote !== undefined && (
    typeof value.reviewNote !== 'string'
    || value.reviewNote.length > PLACE_FEEDBACK_REVIEW_NOTE_MAX_LENGTH
  )) return false
  if (value.approvedEventId != null && typeof value.approvedEventId !== 'string') return false
  if (value.type === PLACE_FEEDBACK_TYPES.REPAIR) {
    if (!Object.hasOwn(REPAIR_CATEGORY_LABELS, value.repairCategory)) return false
    if (![PLACE_FEEDBACK_STATUSES.PENDING, PLACE_FEEDBACK_STATUSES.PROCESSING, PLACE_FEEDBACK_STATUSES.COMPLETED].includes(value.status)) return false
    return value.status === PLACE_FEEDBACK_STATUSES.PENDING
      ? value.reviewedAt == null && value.reviewedBy == null
      : Number.isFinite(Date.parse(value.reviewedAt)) && typeof value.reviewedBy === 'string'
  }

  if (![PLACE_FEEDBACK_STATUSES.PENDING, PLACE_FEEDBACK_STATUSES.APPROVED, PLACE_FEEDBACK_STATUSES.REJECTED].includes(value.status)) return false
  return value.status === PLACE_FEEDBACK_STATUSES.PENDING
    ? value.reviewedAt == null && value.reviewedBy == null
    : Number.isFinite(Date.parse(value.reviewedAt)) && typeof value.reviewedBy === 'string'
}
