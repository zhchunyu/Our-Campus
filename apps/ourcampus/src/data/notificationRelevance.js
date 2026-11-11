export function orderRelevantNotices(notices = []) {
  return [...notices].sort((a, b) => Number(Boolean(a.read_at)) - Number(Boolean(b.read_at)) ||
    (b.priority ?? 0) - (a.priority ?? 0) || Date.parse(b.created_at) - Date.parse(a.created_at) || String(b.id).localeCompare(String(a.id)))
}

// 初次连接只建立基线；后续新通知才弹提示。每个账号持有自己的基线。
export function collectNewNotices(previous, notices) {
  const ids = new Set(notices.map((n) => n.id))
  const microseconds = (value) => Number((String(value).match(/\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/)?.[1] ?? '').padEnd(6, '0').slice(3, 6))
  const newer = (a, b) => {
    const milliseconds = Date.parse(a.created_at) - Date.parse(b.created_at)
    const micros = microseconds(a.created_at) - microseconds(b.created_at)
    return milliseconds > 0 || milliseconds === 0 && (micros > 0 || micros === 0 && String(a.id) > String(b.id))
  }
  const latest = notices.reduce((best, n) => !best || newer(n, best) ? n : best, null)
  if (previous === null) return { seen: { ids, watermark: latest }, fresh: [] }
  const fresh = orderRelevantNotices(notices.filter((n) => !previous.ids.has(n.id) && !n.read_at &&
    Number.isFinite(Date.parse(n.created_at)) && (!previous.watermark || newer(n, previous.watermark))))
  // 保留首次连接水位：通知事务可晚提交，不能用上一次刷新时间排除延迟的新通知。
  return { seen: { ids: new Set([...previous.ids, ...ids]), watermark: previous.watermark }, fresh }
}
