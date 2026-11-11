export function StatusBadge({ label, tone = 'neutral', dot = true }) {
  return (
    <span className={`status-badge status-badge--${tone}`}>
      {dot && <span className="status-badge__dot" aria-hidden="true" />}
      {label}
    </span>
  )
}
