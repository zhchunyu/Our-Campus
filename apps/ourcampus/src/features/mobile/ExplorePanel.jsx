import { useState } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, ChevronRight, MapPin, MessageCircle, Navigation, Wrench } from 'lucide-react'
import { LocationFilters } from '../locations/LocationFilters.jsx'
import { LocationList } from '../locations/LocationList.jsx'
import { CampusEventCalendar } from './CampusEventCalendar.jsx'
import { CampusServiceDirectory } from './CampusServiceDirectory.jsx'
import { NearbyFacilitiesPanel } from './NearbyFacilitiesPanel.jsx'
import { FacilityReportsPanel } from './FacilityReportsPanel.jsx'
import { PLACE_FEEDBACK_TYPES } from '../../domain/placeFeedback.js'

const SECTIONS = [
  { id: 'places', title: '找地点', description: '教学楼、餐厅与校园建筑', Icon: MapPin },
  { id: 'nearby', title: '附近设施', description: '找身边的饮水与便利设施', Icon: Navigation },
  { id: 'directory', title: '校园服务', description: '开放时间、电话与办事信息', Icon: BookOpen },
  { id: 'calendar', title: '活动日历', description: '讲座、活动与校园安排', Icon: CalendarDays },
  { id: 'repair', title: '设施报修', description: '反馈故障，查看处理进度', Icon: Wrench },
]

export function ExplorePanel({ locations, allLocations, calendarEvents = [], services = [], selectedId, query, category,
  onQueryChange, onCategoryChange, onSelectLocation, onPlanRouteToLocation, onReset, facilityContributions,
  livePosition, deviceLocationStatus, deviceLocationMessage, onLocateDevice, role, onSubmitFacility, onReviewFacility,
  section = 'home', onSectionChange, onOpenTimetable, onOpenAssistant, onOpenRepair, onOpenRepairRecords, placeFeedback = [], onUpdateFacilityReport, headerActions }) {
  const [repairLocationId, setRepairLocationId] = useState('')
  const heading = SECTIONS.find((item) => item.id === section)?.title ?? '办事'
  return <section className={`mobile-page-panel mobile-page-panel--explore service-page${section === 'home' ? ' service-page--home' : ''}`} aria-label={heading}>
    <header className="organized-page-heading">
      {section !== 'home' && <button className="organized-back" type="button" aria-label="返回服务" onClick={() => onSectionChange('home')}><ArrowLeft size={20} /></button>}
      <div>{section === 'home' && <small className="campus-page-brand" aria-hidden="true">OurCampus</small>}<h2>{heading}</h2>{section === 'home' && <p>课表、设施与校园办事</p>}</div>
      {headerActions}
    </header>
    {section === 'home' && <>
      <button className="service-timetable-entry" type="button" onClick={onOpenTimetable}><div className="service-timetable-copy"><small>课程与安排</small><strong>我的课表</strong><p>导入课表，或查看已保存的课程。</p><span className="service-timetable-action">打开课表 <ArrowRight size={16} /></span></div><CalendarDays size={30} strokeWidth={1.4} aria-hidden="true" /></button>
      <div className="organized-section-heading"><h3>校园工具</h3></div>
      <div className="service-entry-grid">
        {SECTIONS.filter(({ id }) => id !== 'directory').map(({ id, title, description, Icon }) => <button type="button" className="service-life-card" key={id} onClick={() => onSectionChange(id)}><Icon size={24} strokeWidth={1.5} aria-hidden="true" /><ChevronRight className="service-life-card__arrow" size={16} /><strong>{title}</strong><small>{description}</small></button>)}
      </div>
      <button className="service-assistant-entry" type="button" onClick={onOpenAssistant}><span className="service-assistant-icon"><MessageCircle size={25} strokeWidth={1.65} /></span><span className="service-assistant-copy"><strong>AI 校园助手</strong><small>找地点 · 查办事 · 安排学习</small></span><ArrowRight size={19} /></button>
      <div className="organized-section-heading"><h3>办事入口</h3><span>{services.length} 项服务</span></div>
      <div className="service-directory-shortcuts">
        <button type="button" onClick={() => onSectionChange('directory')}><BookOpen size={24} strokeWidth={1.65} /><span><strong>校园服务</strong><small>教务、校园卡、网络与学生事务</small></span><ChevronRight size={18} /></button>
      </div>
    </>}
    {section === 'places' && <>
      <LocationFilters query={query} category={category} onQueryChange={onQueryChange} onCategoryChange={onCategoryChange} />
      <section className="mobile-panel-section"><div className="mobile-panel-section__heading"><h3>校园地点</h3><span>{locations.length} 处</span></div><LocationList locations={locations} selectedId={selectedId} onSelect={onSelectLocation} onPlanRoute={onPlanRouteToLocation} onReset={onReset} /></section>
    </>}
    {section === 'nearby' && <NearbyFacilitiesPanel locations={allLocations} contributions={facilityContributions} livePosition={livePosition} locationStatus={deviceLocationStatus} locationMessage={deviceLocationMessage} onLocate={onLocateDevice} role={role} onSubmitContribution={onSubmitFacility} onReviewContribution={onReviewFacility} onSelectLocation={onSelectLocation} onPlanRouteToLocation={onPlanRouteToLocation} />}
    {section === 'directory' && <CampusServiceDirectory services={services} locations={allLocations} query="" onSelectLocation={onSelectLocation} onPlanRouteToLocation={onPlanRouteToLocation} />}
    {section === 'calendar' && <CampusEventCalendar events={calendarEvents} locations={allLocations} onSelectLocation={onSelectLocation} onPlanRouteToLocation={onPlanRouteToLocation} />}
    {section === 'repair' && <>
      <section className="service-repair-entry"><h3>反馈设施故障</h3><p>先选择故障所在地点，再填写设施和问题。</p><label htmlFor="repair-place">所在地点</label><select id="repair-place" value={repairLocationId} onChange={(event) => setRepairLocationId(event.target.value)}><option value="">选择一个地点</option>{allLocations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select><button className="community-primary" disabled={!repairLocationId} type="button" onClick={() => onOpenRepair(repairLocationId)}><Wrench size={16} />填写报修</button></section>
      <button className="context-ai-entry" type="button" onClick={onOpenRepairRecords}>我的云端反馈与报修记录 <ChevronRight size={14} /></button>
      <FacilityReportsPanel reports={placeFeedback.filter((entry) => entry.type === PLACE_FEEDBACK_TYPES.REPAIR)} locations={allLocations} role={role} onStatusChange={onUpdateFacilityReport} />
    </>}
  </section>
}
