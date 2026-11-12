// 地名展示：直接使用数据中的真实校园名称，不再做比赛化改写。
// 说明：2026-11 按项目负责人要求还原地图真实地名，此层只保留链接过滤能力。
export const COMPETITION_PRESENTATION = true

export function campusDisplayText(value) {
  return value
}

export function canShowCampusLink(value) {
  if (!value) return false
  if (!COMPETITION_PRESENTATION) return true
  try {
    const hostname = new URL(value).hostname.toLowerCase()
    return hostname !== 'sxau.edu.cn' && !hostname.endsWith('.sxau.edu.cn')
  } catch { return false }
}

export function campusDisplayRecord(record) {
  return record
}

export function campusDisplayService(service) {
  return {
    ...service,
    website: canShowCampusLink(service.website) ? service.website : null,
    sourceUrl: canShowCampusLink(service.sourceUrl) ? service.sourceUrl : null,
  }
}
