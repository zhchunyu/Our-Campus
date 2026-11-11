// 比赛展示名称；原始地点、坐标、用户课表与数据库记录不在此改写。
export const COMPETITION_PRESENTATION = true

const DISPLAY_NAMES = Object.freeze([
  ['亭兰图书馆', '图书馆'], ['亭兰', '图书馆'],
  ['崇学楼', '明德楼'], ['谷园餐厅', '禾香餐厅'], ['谷园', '禾香'],
  ['崇文教学楼', '博雅教学楼'], ['崇文楼', '博雅楼'], ['勤学楼', '笃行楼'],
  ['资源环境学院', '生态环境学院'], ['动物医学中心', '医学院'], ['食品实验室', '花卉培养中心'],
  ['农业工程学院', '机械工程学院'], ['崇实楼', '致知楼'],
  ['韩氏楼', '汇文楼'], ['田氏楼', '思源楼'], ['理化楼', '格物楼'],
  ['崇信楼', '立信楼'], ['动科楼', '生物楼'], ['康馨苑', '康馨园'],
  ['怡馨园餐厅', '悦膳餐厅'], ['怡馨园', '悦膳'], ['体育部', '体育中心'],
  ['睿智文体馆', '文体馆'], ['碧桃园餐厅', '桃李餐厅'], ['碧桃园', '桃李'],
])

export function campusDisplayText(value) {
  if (typeof value !== 'string' || !COMPETITION_PRESENTATION) return value
  let text = value
    .replace(/山西\s*农业\s*大学|山西农大|山西农业大學|Shanxi Agricultural University/gi, '校园')
    .replace(/太谷校区|太谷校园/g, '本校区')
    .replace(/农大西门/g, '校园西门')
    .replace(/校园[（(]本校区[）)]|校园\s*[·—-]\s*本校区/g, '本校区')
    .replace(/太谷区|晋中市|山西省/g, '本地区')
  for (const [original, display] of DISPLAY_NAMES) text = text.replaceAll(original, display)
  return text.replace(/(校园|本校区|本地区)\1+/g, '$1')
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
  const displayed = Object.fromEntries(Object.entries(record).map(([key, value]) => [key,
    ['name', 'title', 'description', 'activity', 'impact', 'updatedBy'].includes(key)
      ? campusDisplayText(value) : value,
  ]))
  if (COMPETITION_PRESENTATION && record.id === 'workshop-west-1') displayed.name = '车间（西）'
  if (COMPETITION_PRESENTATION && record.id === 'workshop-west-2') displayed.name = '车间（北）'
  // 只给地点增加匹配别名，原记录和原名仍留在存储层。
  if (Array.isArray(record.aliases)) {
    displayed.aliases = [...new Set([
      ...record.aliases, ...record.aliases.map(campusDisplayText),
      ...(record.name && record.name !== displayed.name ? [record.name] : []),
    ])]
  }
  return displayed
}

export function campusDisplayService(service) {
  return {
    ...service,
    title: campusDisplayText(service.title),
    summary: campusDisplayText(service.summary),
    phoneNote: campusDisplayText(service.phoneNote),
    keywords: [...new Set([service.title, ...(service.keywords ?? []), ...(service.keywords ?? []).map(campusDisplayText)])],
    website: canShowCampusLink(service.website) ? service.website : null,
    sourceUrl: canShowCampusLink(service.sourceUrl) ? service.sourceUrl : null,
  }
}
