import { useMemo, useState } from 'react'
import { MapPin, Navigation, LocateFixed, Plus, Search, Utensils, HeartPulse, Trophy, Droplets, Printer, Package, Bike, PersonStanding, X } from 'lucide-react'
import { FACILITY_TYPES } from '../../data/campusCommunity.js'
import { listCampusFacilities } from '../../data/campusFacilities.js'

const icons = { food: Utensils, medical: HeartPulse, sports: Trophy, toilet: PersonStanding, water: Droplets, print: Printer, parcel: Package, bike: Bike }
export function NearbyFacilitiesPanel({ locations, contributions, livePosition, locationStatus, locationMessage, onLocate, role, onSubmitContribution, onReviewContribution, onSelectLocation, onPlanRouteToLocation }) {
  const [type, setType] = useState('all')
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const facilities = useMemo(() => listCampusFacilities(locations, contributions, livePosition, type, query), [locations, contributions, livePosition, type, query])
  const byId = new Map(locations.map((location) => [location.id, location]))
  const openForm = () => { setDraft({ type: type === 'all' ? 'water' : type, name: '', locationId: '', detail: '' }); setError('') }
  const change = (key, value) => setDraft((current) => ({ ...current, [key]: value }))
  const submit = (event) => {
    event.preventDefault()
    try { onSubmitContribution(draft); setDraft(null); setNotice('设施已补充，保存在本机待确认；确认后才显示在设施列表。') }
    catch (saveError) { setError(saveError.message) }
  }
  const review = (id, status) => {
    try { onReviewContribution(id, status); setNotice(status === 'verified' ? '已在本机确认收录。' : '已标记不收录。') } catch (saveError) { setNotice(saveError.message) }
  }
  return <div className="community-content nearby-facilities">
    <div className="community-banner"><MapPin size={27} /><div><strong>找一个方便到达的校园设施</strong><p>{livePosition ? '已按当前位置的直线估算距离排序。' : '定位后，可以按距离查看校园设施。'}</p></div></div>
    <div className="community-action-line"><span className="community-local-label">{livePosition ? Number.isFinite(livePosition.accuracy) ? `定位精度约 ${Math.round(livePosition.accuracy)} 米` : '已获取位置，精度未知' : '尚未获取当前位置'}</span><button className="community-primary" type="button" disabled={locationStatus === 'loading'} onClick={onLocate}><LocateFixed size={15} />{locationStatus === 'loading' ? '定位中…' : '定位'}</button></div>
    {locationMessage && <p className="community-error" role="alert">{locationMessage}</p>}
    <div className="community-facility-types" aria-label="设施分类">{[{ id: 'all', label: '全部' }, ...FACILITY_TYPES].map((item) => {
      const Icon = icons[item.id] ?? MapPin
      return <button type="button" key={item.id} className={type === item.id ? 'is-active' : ''} aria-pressed={type === item.id} onClick={() => setType(item.id)}><Icon size={19} /><span>{item.label}</span></button>
    })}</div>
    <label className="community-search"><Search size={16} /><input type="search" aria-label="搜索附近设施" placeholder="搜索设施或所属建筑" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    <div className="community-list-heading"><h3>{type === 'all' ? '校园设施' : FACILITY_TYPES.find((item) => item.id === type)?.label}</h3><span>{facilities.length} 处</span></div>
    {facilities.length ? facilities.map((facility) => {
      const Icon = icons[facility.type] ?? MapPin
      return <article className="community-card facility-card" key={facility.id}>
        <div className="community-card-top"><span className="community-icon"><Icon size={19} /></span><h3>{facility.name}</h3><small>{facility.distance === null ? '距离待定位' : facility.distance >= 1000 ? `约 ${(facility.distance / 1000).toFixed(1)} km` : `约 ${facility.distance} m`}</small></div>
        <p className="community-description">{facility.detail}</p><div className="community-meta"><MapPin size={13} />{facility.locationName}<span className="community-tag">{facility.source === 'local-contribution' ? '本机已确认' : '地图已有地点'}</span></div>
        <div className="community-card-actions"><button type="button" onClick={() => onSelectLocation(facility.locationId)}><MapPin size={14} />查看地点</button><button type="button" onClick={() => onPlanRouteToLocation(facility.locationId)}><Navigation size={14} />{facility.source === 'local-contribution' ? '导航到所属建筑' : '去这里'}</button></div>
      </article>
    }) : <div className="community-empty"><MapPin size={30} /><strong>{query ? '没有找到匹配的设施' : '这一类设施的位置还未收录'}</strong><p>已知位置可以先补充，确认后再显示。</p></div>}
    <p className="community-footnote">距离为到建筑的直线估算，不是步行路线长度。设施位于建筑内时，导航先到所属建筑，具体位置见说明。</p>
    <button className="community-secondary community-submit" type="button" onClick={openForm}><Plus size={15} />补充设施地点</button>
    {notice && <p className="community-notice" role="status">{notice}</p>}
    {draft && <form className="community-form" aria-label="补充校园设施" onSubmit={submit}>
      <div className="community-list-heading"><h3>补充设施地点</h3><button className="community-icon-button" type="button" onClick={() => setDraft(null)} aria-label="关闭设施表单"><X size={18} /></button></div>
      <label>设施类型<select value={draft.type} onChange={(event) => change('type', event.target.value)}>{FACILITY_TYPES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <label>设施名称<input autoFocus required maxLength={40} value={draft.name} onChange={(event) => change('name', event.target.value)} placeholder="例如：图书馆饮水点" /></label>
      <label>所属校园地点<select required value={draft.locationId} onChange={(event) => change('locationId', event.target.value)}><option value="">请选择所属建筑或地点</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
      <label>具体位置与说明<textarea required maxLength={120} rows={3} value={draft.detail} onChange={(event) => change('detail', event.target.value)} placeholder="例如：二楼东侧走廊，需要自带杯子" /></label>
      <small className="community-footnote">本机保存，待确认后收录。第一版将位置关联到建筑，不代表设施的精确坐标。</small>
      {error && <p className="community-error" role="alert">{error}</p>}
      <button className="community-primary community-submit" type="submit">提交补充</button>
    </form>}
    {contributions.length > 0 && <section className="community-contributions"><div className="community-list-heading"><h3>{role === 'manager' ? '设施确认 · 本机演示' : '我的补充记录'}</h3><span>{contributions.length} 条</span></div>{contributions.map((item) => <article className="community-card" key={item.id}><div className="community-card-top"><strong>{item.name}</strong><small>{({ pending: '待确认', verified: '已收录', rejected: '未收录' })[item.status]}</small></div><p className="community-description">{byId.get(item.locationId)?.name ?? '地点未收录'} · {item.detail}</p>{role === 'manager' && item.status === 'pending' && <div className="community-card-actions"><button type="button" onClick={() => review(item.id, 'verified')}>确认收录</button><button type="button" onClick={() => review(item.id, 'rejected')}>不收录</button></div>}</article>)}</section>}
  </div>
}
