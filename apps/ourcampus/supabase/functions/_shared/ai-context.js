export const redactContact = (value) => String(value ?? '').replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[联系方式已省略]')
  .replace(/(?:\+?86[-\s]?)?1[3-9]\d{9}|(?:0\d{2,3}[-\s]?)?\d{7,8}/g, '[联系方式已省略]')
  .replace(/(?:微信|vx|wechat|qq)[号\s：:]*[a-z\d_-]{5,}/gi, '[联系方式已省略]')

export function personalAiContext({ preferences = null, reports = [], candidates = [], matches = [] } = {}) {
  const cleanReport = (r) => ({ id: r.id, kind: r.kind, title: redactContact(r.title).slice(0, 80),
    body: redactContact(r.body).slice(0, 500), location_id: r.location_id,
    occurred_at: Number.isFinite(Date.parse(r.details?.occurred_at)) ? new Date(r.details.occurred_at).toISOString() : null, published_at: r.created_at, status: r.status })
  return { favorite_location_ids: preferences?.favorite_location_ids ?? [],
    interest_keywords: (preferences?.interest_keywords ?? []).map(redactContact),
    my_active_lost_found: reports.map(cleanReport), possible_matches: matches.map((m) => ({ report_id: m.report_id, my_report_id: m.my_report_id,
      score: m.score, confidence: ['较高', '一般'].includes(m.confidence) ? m.confidence : '一般',
      reasons: (m.reasons ?? []).filter((s) => typeof s === 'string').map(redactContact),
      warnings: (m.warnings ?? []).filter((s) => typeof s === 'string').map(redactContact),
      generated_by: m.generated_by === 'auv-features' ? 'auv-features' : 'feature-rules',
      candidate: candidates.find((r) => r.id === m.report_id) ? cleanReport(candidates.find((r) => r.id === m.report_id)) : null })),
    evidence_note: '失物发布和匹配是未核实线索，不代表已确认归属。收藏表示关注，不能推断身份、健康、性格或生活习惯。' }
}
