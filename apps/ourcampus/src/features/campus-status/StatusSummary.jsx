import { Activity, CircleDot, Users } from 'lucide-react'
import { CROWD_STATUS_LABELS, OPEN_STATUS_LABELS } from '../../domain/campus.js'

export function StatusSummary({ locations }) {
  const openCount = locations.filter((location) => location.openStatus === 'open').length
  const busyCount = locations.filter((location) => location.crowdStatus === 'busy').length

  return (
    <div className="status-summary">
      <div className="summary-item">
        <span className="summary-item__icon summary-item__icon--cyan"><CircleDot size={15} /></span>
        <span><strong>{openCount}/{locations.length}</strong><small>{OPEN_STATUS_LABELS.open}</small></span>
      </div>
      <div className="summary-item">
        <span className="summary-item__icon summary-item__icon--amber"><Users size={15} /></span>
        <span><strong>{busyCount}</strong><small>{CROWD_STATUS_LABELS.busy}</small></span>
      </div>
      <div className="summary-item">
        <span className="summary-item__icon summary-item__icon--rose"><Activity size={15} /></span>
        <span><strong>当前</strong><small>本地状态</small></span>
      </div>
    </div>
  )
}
