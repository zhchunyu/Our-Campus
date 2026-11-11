import { useState } from 'react'
import { BookOpen, BriefcaseBusiness, ExternalLink, GraduationCap, MapPin, Navigation, Phone, Search, Utensils, Wifi } from 'lucide-react'
import { SERVICE_CATEGORIES } from '../../data/campusServices.js'

const CATEGORY_ICONS = { learning: GraduationCap, life: Utensils, network: Wifi, student: BriefcaseBusiness }

function serviceLink(value) {
  if (!value) return null
  try { return ['https:', 'http:'].includes(new URL(value).protocol) ? value : null }
  catch { return null }
}

function matchesQuery(service, query) {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (!normalizedQuery) return true
  return [service.title, service.summary, service.access, service.office, service.hours, service.phone, ...(service.keywords ?? [])]
    .filter(Boolean)
    .some((value) => String(value).toLocaleLowerCase().includes(normalizedQuery))
}

export function CampusServiceDirectory({ services, locations, query = '', onSelectLocation, onPlanRouteToLocation }) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const visibleServices = services.filter((service) => (category === 'all' || service.category === category) && matchesQuery(service, query) && matchesQuery(service, search))

  const locationById = new Map(locations.map((location) => [location.id, location]))

  return (
    <section className="mobile-panel-section mobile-service-directory" aria-label="校园服务信息">
      <div className="mobile-panel-section__heading">
        <h3>服务目录</h3>
        <span>{visibleServices.length} 项服务</span>
      </div>
      <label className="community-search service-directory-search"><Search size={17} aria-hidden="true" /><input type="search" aria-label="搜索校园服务" placeholder="搜索校园卡、成绩、邮箱…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <div className="community-chip-strip service-directory-categories" role="group" aria-label="校园服务分类">{[{ id: 'all', label: '全部' }, ...SERVICE_CATEGORIES].map((item) => <button type="button" key={item.id} aria-pressed={category === item.id} className={category === item.id ? 'is-active' : ''} onClick={() => setCategory(item.id)}>{item.label}</button>)}</div>
      <div className="mobile-service-directory__list">
        {visibleServices.map((service) => {
          const location = service.locationId ? locationById.get(service.locationId) : null
          const Icon = CATEGORY_ICONS[service.category] ?? BookOpen
          const website = serviceLink(service.website)
          const sourceUrl = serviceLink(service.sourceUrl)
          return (
            <article className="mobile-service-directory__card" key={service.id}>
              <header>
                <span className="mobile-service-directory__icon"><Icon size={19} aria-hidden="true" /></span>
                <div><strong>{service.title}</strong><p>{service.summary}</p></div>
              </header>
              <dl>
                {service.access && <div className="mobile-service-directory__access"><dt>办理方式</dt><dd>{service.access}</dd></div>}
                {service.office && <div><dt>办公地点</dt><dd>{service.office}</dd></div>}
                {service.hours && <div><dt>开放时间</dt><dd>{service.hours}</dd></div>}
                {service.phone && <div><dt>联系电话</dt><dd><a href={`tel:${service.phone.replace(/[^\d+]/g, '')}`}><Phone size={13} />{service.phone}</a></dd></div>}
              </dl>
              {service.phoneNote && <small className="mobile-service-directory__note">{service.phoneNote}</small>}
              <footer>
                {location && (
                  <>
                    <button type="button" onClick={() => onSelectLocation(location.id)}><MapPin size={13} />地点详情</button>
                    <button type="button" onClick={() => onPlanRouteToLocation(location.id)}><Navigation size={13} />导航</button>
                  </>
                )}
                {website && <a href={website} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} />{service.actionLabel ?? '官方入口'}</a>}
                {!website && sourceUrl && <a href={sourceUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} />官方来源</a>}
                {website && sourceUrl && website !== sourceUrl && <a className="mobile-service-directory__source" href={sourceUrl} target="_blank" rel="noopener noreferrer">信息来源</a>}
              </footer>
            </article>
          )
        })}
      </div>
      {!visibleServices.length && <div className="organized-empty service-directory-empty"><p>没有找到匹配的校园服务。</p><button type="button" className="community-secondary" onClick={() => { setSearch(''); setCategory('all') }}>清除筛选</button></div>}
      <p className="service-directory-footnote">官方网页在新窗口打开；具体办理安排以官网最新通知为准。</p>
    </section>
  )
}
