import { useMemo, useState } from 'react'
import { Check, Clock3, MapPin, Wrench } from 'lucide-react'
import { PLACE_FEEDBACK_STATUSES, REPAIR_CATEGORY_LABELS } from '../../domain/placeFeedback.js'

const REPORT_STATUSES = [
  PLACE_FEEDBACK_STATUSES.PENDING,
  PLACE_FEEDBACK_STATUSES.PROCESSING,
  PLACE_FEEDBACK_STATUSES.COMPLETED,
]
const STATUS_LABELS = {
  [PLACE_FEEDBACK_STATUSES.PENDING]: '待处理',
  [PLACE_FEEDBACK_STATUSES.PROCESSING]: '处理中',
  [PLACE_FEEDBACK_STATUSES.COMPLETED]: '已完成',
}

function formatDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '时间未知'
    : new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date)
}

export function FacilityReportsPanel({ reports = [], locations = [], role, onStatusChange }) {
  const [activeStatus, setActiveStatus] = useState('all')
  const isManager = role === 'manager'
  const counts = useMemo(() => Object.fromEntries(
    REPORT_STATUSES.map((status) => [status, reports.filter((report) => report.status === status).length]),
  ), [reports])
  const visibleReports = useMemo(() => reports
    .filter((report) => activeStatus === 'all' || report.status === activeStatus)
    .sort((left, right) => new Date(right.submittedAt).getTime() - new Date(left.submittedAt).getTime()), [reports, activeStatus])

  return (
    <section className="facility-reports-panel" aria-label="设施报修记录">
      <header className="facility-reports-panel__heading">
        <div><Wrench size={16} /><strong>{isManager ? '设施报修管理' : '我的设施报修'}</strong></div>
        <small>本机模拟 · 不会发送到学校</small>
      </header>
      <div className="facility-report-tabs" role="tablist" aria-label="报修处理状态">
        <button type="button" role="tab" aria-selected={activeStatus === 'all'} className={activeStatus === 'all' ? 'is-active' : ''} onClick={() => setActiveStatus('all')}>全部 <span>{reports.length}</span></button>
        {REPORT_STATUSES.map((status) => (
          <button type="button" role="tab" aria-selected={activeStatus === status} className={activeStatus === status ? 'is-active' : ''} key={status} onClick={() => setActiveStatus(status)}>
            {STATUS_LABELS[status]} <span>{counts[status] ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="facility-report-list">
        {visibleReports.map((report) => {
          const location = locations.find((entry) => entry.id === report.locationId)
          const nextStatus = report.status === PLACE_FEEDBACK_STATUSES.PENDING
            ? PLACE_FEEDBACK_STATUSES.PROCESSING
            : report.status === PLACE_FEEDBACK_STATUSES.PROCESSING
              ? PLACE_FEEDBACK_STATUSES.COMPLETED
              : null
          return (
            <article className="facility-report-card" key={report.id}>
              <header>
                <span>{REPAIR_CATEGORY_LABELS[report.repairCategory] ?? '其他设施'}</span>
                <strong className={'facility-report-status facility-report-status--' + report.status}>{STATUS_LABELS[report.status]}</strong>
              </header>
              <p>{report.description}</p>
              <small><MapPin size={12} />{location?.name ?? '地点已不存在'}</small>
              <small><Clock3 size={12} />提交于 {formatDate(report.submittedAt)}</small>
              {isManager && nextStatus && (
                <button className="facility-report-card__advance" type="button" onClick={() => onStatusChange(report.id, nextStatus)}>
                  <Check size={13} />{nextStatus === PLACE_FEEDBACK_STATUSES.PROCESSING ? '开始处理' : '标记为已完成'}
                </button>
              )}
              {!isManager && report.reviewedAt && <small>最近更新：{formatDate(report.reviewedAt)}</small>}
            </article>
          )
        })}
        {visibleReports.length === 0 && <p className="facility-report-empty">{reports.length ? '这个状态下暂无报修记录。' : '还没有报修记录。可在地点详情中提交。'}</p>}
      </div>
    </section>
  )
}
