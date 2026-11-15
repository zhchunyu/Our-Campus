import './inner-canvas.css'
import { useState } from 'react'
import { ArrowLeft, BookOpen, CalendarDays, ChevronRight, MapPin, MessageCircle, Navigation, Search, Utensils, Wrench } from 'lucide-react'
import { CampusEventCalendar } from './CampusEventCalendar.jsx'
import { CampusServiceDirectory } from './CampusServiceDirectory.jsx'
import { NearbyFacilitiesPanel } from './NearbyFacilitiesPanel.jsx'
import { FacilityReportsPanel } from './FacilityReportsPanel.jsx'
import { PLACE_FEEDBACK_TYPES } from '../../domain/placeFeedback.js'
import { CATEGORIES, CATEGORY_LABELS } from '../../domain/campus.js'
import { getCampusRestaurants, openCampusRestaurant } from './campusConnections.js'

const SECTIONS = [
  { id: 'places', title: '找地点', Icon: MapPin },
  { id: 'food', title: '吃饭', Icon: Utensils },
  { id: 'nearby', title: '附近', Icon: Navigation },
  { id: 'directory', title: '办事', Icon: BookOpen },
  { id: 'calendar', title: '活动', Icon: CalendarDays },
  { id: 'repair', title: '报修', Icon: Wrench },
]

export function ExplorePanel({ locations = [], allLocations = locations, calendarEvents = [], services = [], selectedId, query = '', category = 'all',
  onQueryChange, onCategoryChange, onSelectLocation, onPlanRouteToLocation, onReset, facilityContributions = [],
  livePosition, deviceLocationStatus, deviceLocationMessage, onLocateDevice, role, onSubmitFacility, onReviewFacility,
  section = 'home', onSectionChange, onOpenTimetable, onOpenAssistant, onOpenRepair, onOpenRepairRecords, onOpenRestaurantReviews,
  placeFeedback = [], onUpdateFacilityReport, headerActions }) {
  const [repairLocationId, setRepairLocationId] = useState('')
  const activeSection = section === 'home' ? 'places' : section
  const isPlaces = activeSection === 'places', isFood = activeSection === 'food'
  const visibleLocations = isFood ? getCampusRestaurants(allLocations, query) : locations
  return <section className="mobile-page-panel mobile-page-panel--explore service-page along-campus" aria-label="校园">
    <header className="organized-page-heading along-campus-heading">
      {section !== 'home' && <button className="organized-back" type="button" aria-label="返回上一页" onClick={() => onSectionChange?.('home')}><ArrowLeft size={20} /></button>}
      <div><h2>校园</h2></div>{headerActions}
    </header>
    <nav className="along-campus-sections" aria-label="校园分类">{SECTIONS.map(({ id, title, Icon }) => <button type="button" key={id} aria-pressed={activeSection === id} onClick={() => onSectionChange?.(id)}><Icon size={19} strokeWidth={1.7} aria-hidden="true" /><span>{title}</span></button>)}</nav>
    {(isPlaces || isFood) && <>
      <label className="along-campus-search"><Search size={19} aria-hidden="true" /><input type="search" aria-label={isFood ? '搜索校园餐厅' : '搜索校园地点'} placeholder={isFood ? '搜餐厅名称' : '搜地点、建筑或关键词'} value={query} onChange={event => onQueryChange?.(event.target.value)} />{query && <button type="button" onClick={() => onQueryChange?.('')} aria-label="清除搜索">×</button>}</label>
      {isPlaces && <div className="along-campus-place-types" aria-label="地点类型">{Object.values(CATEGORIES).map(value => <button type="button" key={value} aria-pressed={category === value} onClick={() => onCategoryChange?.(value)}>{CATEGORY_LABELS[value]}</button>)}</div>}
      <section className="along-campus-results" aria-label={isFood ? '校园餐厅' : '校园地点'}><div className="mobile-panel-section__heading"><h3>{isFood ? '校园餐厅' : '校园地点'}</h3><span>{visibleLocations.length} 处</span></div>
        {visibleLocations.length ? <div className="along-campus-list">{visibleLocations.map(location => <article className={`along-campus-place${selectedId === location.id ? ' is-selected' : ''}`} key={location.id}>
          <button type="button" className="along-campus-place__main" onClick={() => { if (!isFood || !openCampusRestaurant(location.id, allLocations, onOpenRestaurantReviews)) onSelectLocation?.(location.id) }}><span className="along-campus-place__icon">{isFood ? <Utensils size={21} strokeWidth={1.6} /> : <MapPin size={21} strokeWidth={1.6} />}</span><span><strong>{location.name}</strong><small>{isFood ? '窗口、菜单与同学评价' : CATEGORY_LABELS[location.category] || '校园地点'}</small></span><ChevronRight size={17} aria-hidden="true" /></button>
          <div className="along-campus-place__actions">{isFood && typeof onOpenRestaurantReviews === 'function' && <button type="button" onClick={() => openCampusRestaurant(location.id, allLocations, onOpenRestaurantReviews)}><MessageCircle size={15} />窗口与评价</button>}{isFood && <button type="button" onClick={() => onSelectLocation?.(location.id)}><MapPin size={15} />地点</button>}{onPlanRouteToLocation && <button type="button" onClick={() => onPlanRouteToLocation(location.id)}><Navigation size={15} />去这里</button>}</div>
        </article>)}</div> : <div className="along-campus-empty"><MapPin size={26} /><strong>没有找到{isFood ? '匹配的餐厅' : '匹配的地点'}</strong><p>试试建筑全名，或清除筛选。</p><button type="button" onClick={() => { onQueryChange?.(''); onCategoryChange?.('all'); onReset?.() }}>清除筛选</button></div>}
        {isFood && <p className="along-campus-note">营业安排以现场公告为准，菜单和评价在各餐厅内查看。</p>}
      </section>
      <div className="along-campus-tools">{onOpenTimetable && <button type="button" onClick={onOpenTimetable}><CalendarDays size={19} />我的课表<ChevronRight size={16} /></button>}{onOpenAssistant && <button type="button" onClick={onOpenAssistant}><MessageCircle size={19} />AI 校园助手<ChevronRight size={16} /></button>}</div>
    </>}
    {activeSection === 'nearby' && <NearbyFacilitiesPanel locations={allLocations} contributions={facilityContributions} livePosition={livePosition} locationStatus={deviceLocationStatus} locationMessage={deviceLocationMessage} onLocate={onLocateDevice} role={role} onSubmitContribution={onSubmitFacility} onReviewContribution={onReviewFacility} onSelectLocation={onSelectLocation} onPlanRouteToLocation={onPlanRouteToLocation} onOpenRestaurantReviews={onOpenRestaurantReviews} />}
    {activeSection === 'directory' && <CampusServiceDirectory services={services} locations={allLocations} onSelectLocation={onSelectLocation} onPlanRouteToLocation={onPlanRouteToLocation} />}
    {activeSection === 'calendar' && <CampusEventCalendar events={calendarEvents} locations={allLocations} onSelectLocation={onSelectLocation} onPlanRouteToLocation={onPlanRouteToLocation} />}
    {activeSection === 'repair' && <>
      <section className="service-repair-entry"><h3>设施报修</h3><p>选择故障所在地点，再填写具体问题。</p><label htmlFor="repair-place">所在地点</label><select id="repair-place" value={repairLocationId} onChange={event => setRepairLocationId(event.target.value)}><option value="">选择一个地点</option>{allLocations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</select><button className="community-primary" disabled={!repairLocationId} type="button" onClick={() => onOpenRepair?.(repairLocationId)}><Wrench size={16} />填写报修</button></section>
      <button className="context-ai-entry" type="button" onClick={onOpenRepairRecords}>我的云端反馈与报修记录 <ChevronRight size={14} /></button>
      <FacilityReportsPanel reports={placeFeedback.filter(entry => entry.type === PLACE_FEEDBACK_TYPES.REPAIR)} locations={allLocations} role={role} onStatusChange={onUpdateFacilityReport} />
    </>}
  </section>
}
