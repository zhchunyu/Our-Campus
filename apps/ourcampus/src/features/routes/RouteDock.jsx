import { campusDisplayText } from '../../data/campusPresentation.js'
import { useEffect, useState } from 'react'
import { ArrowRight, ArrowUpDown, ListOrdered, MapPinned, Navigation, Route, Star, X } from 'lucide-react'
import { getTencentCampusPosition } from '../../data/tencentCampusGeo.js'
import {
  getRouteInstructions,
  getRouteModeDescription,
  ROUTE_MODE_LABELS,
  ROUTE_MODES,
} from '../../domain/route.js'

const tencentMapKey = import.meta.env.VITE_TENCENT_MAP_KEY

function buildTencentRouteUrl({ destination, origin, useAppScheme }) {
  const parameters = new URLSearchParams({
    type: 'walk',
    from: useAppScheme ? '我的位置' : origin.name,
    fromcoord: useAppScheme ? 'CurrentLocation' : `${origin.position.lat},${origin.position.lng}`,
    to: destination.name,
    tocoord: `${destination.position.lat},${destination.position.lng}`,
    referer: tencentMapKey,
  })

  return useAppScheme
    ? `qqmap://map/routeplan?${parameters.toString()}`
    : `https://apis.map.qq.com/uri/v1/routeplan?${parameters.toString()}`
}

export function getRouteStatusLabel(routePlan) {
  if (routePlan?.status === 'arrived') return '已到达目的地'
  if (routePlan?.unavailableReason === 'origin-closed') return '出发地点暂时关闭'
  if (routePlan?.unavailableReason === 'destination-closed') return '目的地点暂时关闭'
  return routePlan?.status === 'unavailable'
    ? '当前模式下没有可用路线'
    : `约 ${routePlan.durationMinutes} 分钟`
}

export function RouteDock({
  routePlan,
  locations = [],
  routeResult = null,
  showRoute = true,
  onModeChange,
  onOriginChange,
  onDestinationChange,
  onSwap,
  onClear,
  isSaved = false,
  onSave,
}) {
  const [openPanel, setOpenPanel] = useState(null)

  useEffect(() => {
    setOpenPanel(null)
  }, [routePlan?.originId, routePlan?.destinationId, routePlan?.mode, routePlan?.status])

  if (!routePlan) return null

  const destinationName = locations.find((location) => location.id === routePlan.destinationId)?.name ?? routePlan.destinationId
  const originName = locations.find((location) => location.id === routePlan.originId)?.name ?? routePlan.originId
  const hasMatchingRouteResult = routeResult?.originId === routePlan.originId
    && routeResult?.destinationId === routePlan.destinationId
  const tencentRoute = routePlan.requiresTencentRoute && hasMatchingRouteResult && routeResult.status === 'success'
    ? routeResult.route
    : null
  const tencentInstructions = (tencentRoute?.steps ?? []).map((step) => ({
    direction: step.instruction || step.act_desc || step.road_name || '沿校园道路前行',
    distance: Math.round(Number(step.distance) || 0),
    destinationName: null,
  })).filter((step) => step.direction)
  const instructions = routePlan.requiresTencentRoute
    ? tencentInstructions
    : getRouteInstructions(routePlan, locations)
  const destination = locations.find((location) => location.id === routePlan.destinationId)
  const origin = locations.find((location) => location.id === routePlan.originId)
  const destinationPosition = getTencentCampusPosition(destination)
  const originPosition = getTencentCampusPosition(origin)
  const hasBlockedEdges = (routePlan.blockedEdgeIds?.length ?? 0) > 0
  const canOpenTencentNavigation = Boolean(!hasBlockedEdges && tencentMapKey && destinationPosition && originPosition)
  const isMobileBrowser = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  const tencentNavigationUrl = canOpenTencentNavigation
    ? buildTencentRouteUrl({
        destination: { name: destination.name, position: destinationPosition },
        origin: { name: origin.name, position: originPosition },
        useAppScheme: isMobileBrowser,
      })
    : undefined
  const tencentWebRouteUrl = canOpenTencentNavigation
    ? buildTencentRouteUrl({
        destination: { name: destination.name, position: destinationPosition },
        origin: { name: origin.name, position: originPosition },
        useAppScheme: false,
      })
    : undefined
  const routeDistance = routePlan.requiresTencentRoute ? tencentRoute?.distance : routePlan.distance
  const routeSummary = routePlan.requiresTencentRoute
    ? tencentRoute
      ? `腾讯步行路线 · ${routeDistance} 米`
      : hasMatchingRouteResult && routeResult.status === 'error'
        ? '腾讯步行路线暂不可用'
        : '正在查询腾讯步行路线…'
    : `路线预览 · 校园演示估算 ${routePlan.distance} 米`
  const routeDuration = routePlan.requiresTencentRoute
    ? tencentRoute?.durationMinutes
    : routePlan.durationMinutes
  const togglePanel = (panel) => setOpenPanel((current) => current === panel ? null : panel)
  return (
    <section className="route-dock" aria-label="路线预览">
      <div className="route-dock__icon"><Route size={18} /></div>
      <div className="route-dock__summary">
        <span>{routeSummary}</span>
        <strong>{originName} <ArrowRight size={14} /> {destinationName}</strong>
      </div>
      <button className="route-dock__swap" type="button" onClick={onSwap} aria-label="交换起点和终点" title="交换起点和终点"><ArrowUpDown size={15} /></button>
      <div className="route-dock__modes" aria-label="路线模式">
        {Object.values(ROUTE_MODES).map((mode) => (
          <button className={routePlan.mode === mode ? 'is-active' : ''} type="button" key={mode} onClick={() => onModeChange(mode)}>
            {ROUTE_MODE_LABELS[mode]}
          </button>
        ))}
      </div>
      <div className="route-dock__utilities">
        <button
          className={openPanel === 'endpoints' ? 'is-active' : ''}
          type="button"
          aria-expanded={openPanel === 'endpoints'}
          onClick={() => togglePanel('endpoints')}
        >
          <MapPinned size={13} /> 起终点
        </button>
        <button
          className={openPanel === 'instructions' ? 'is-active' : ''}
          type="button"
          aria-expanded={openPanel === 'instructions'}
          onClick={() => togglePanel('instructions')}
        >
          <ListOrdered size={13} /> 路线指引{instructions.length ? ` · ${instructions.length} 段` : ''}
        </button>
        <button
          className={isSaved ? 'is-active' : ''}
          type="button"
          aria-pressed={isSaved}
          disabled={isSaved || routePlan.status !== 'preview'}
          onClick={onSave}
        >
          <Star size={13} fill={isSaved ? 'currentColor' : 'none'} /> {isSaved ? '已保存' : '保存路线'}
        </button>
      </div>
      {openPanel === 'endpoints' && (
        <div className="route-dock__flyout route-dock__flyout--endpoints">
          <strong>调整路线起终点</strong>
          <div className="route-dock__endpoint-grid">
            <label>
              <span>出发地点</span>
              <select value={routePlan.originId} onChange={(event) => onOriginChange?.(event.target.value)}>
                {locations.map((location) => <option value={location.id} key={location.id}>{location.name}</option>)}
              </select>
            </label>
            <label>
              <span>到达地点</span>
              <select value={routePlan.destinationId} onChange={(event) => onDestinationChange?.(event.target.value)}>
                {locations.map((location) => <option value={location.id} key={location.id}>{location.name}</option>)}
              </select>
            </label>
          </div>
        </div>
      )}
      {openPanel === 'instructions' && (
        <div className="route-dock__flyout route-dock__flyout--instructions">
          <strong>{routePlan.status === 'unavailable' ? '暂时无法规划这条路线' : '路线分段指引'}</strong>
          <p className="route-dock__reason">{getRouteModeDescription(routePlan)}</p>
          {routePlan.status === 'preview' && !routePlan.requiresTencentRoute && <p className="route-dock__reason">距离与分段来自校园演示路网；腾讯步行路线成功时，地图会叠加实际路线。</p>}
          {routePlan.requiresTencentRoute && !tencentRoute && <p className="route-dock__reason">正在从腾讯地图获取这处地点的步行路线。</p>}
          {routePlan.status === 'unavailable' ? (
            <p className="route-dock__empty">请更换起终点或路线模式后重试。</p>
          ) : routePlan.status === 'arrived' ? (
            <p className="route-dock__empty">当前位置已经是目的地。</p>
          ) : instructions.length ? (
            <ol className="route-dock__steps">
              {instructions.map((instruction, index) => (
                <li key={`${campusDisplayText(instruction.direction)}-${index}`}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <strong>{campusDisplayText(instruction.direction)}</strong>
                  <small>约 {instruction.distance} 米</small>
                  {instruction.destinationName && <em>到达 {campusDisplayText(instruction.destinationName)}</em>}
                </li>
              ))}
            </ol>
          ) : <p className="route-dock__empty">该路线暂时没有可展示的分段指引。</p>}
        </div>
      )}
      {!showRoute ? (
        <span className="route-dock__unavailable">路线图层已关闭</span>
      ) : routePlan.requiresTencentRoute && !tencentRoute ? (
        <span className={hasMatchingRouteResult && routeResult.status === 'error' ? 'route-dock__unavailable' : 'route-dock__duration'}>
          {hasMatchingRouteResult && routeResult.status === 'error'
            ? routeResult.message || '腾讯步行路线暂不可用'
            : '正在获取腾讯步行路线'}
        </span>
      ) : routePlan.status === 'unavailable' ? (
        <span className="route-dock__unavailable">{getRouteStatusLabel(routePlan)}</span>
      ) : routePlan.status === 'arrived' ? (
        <span className="route-dock__arrived">{getRouteStatusLabel(routePlan)}</span>
      ) : (
        <span className="route-dock__duration">{routeDuration ? `约 ${routeDuration} 分钟 · ${routeDistance} 米` : getRouteStatusLabel(routePlan)}{routePlan.blockedEdgeIds?.length ? ' · 已纳入施工提醒' : ''}</span>
      )}
      {routePlan.status === 'preview' && (
        <div className="route-dock__navigation-actions">
          {canOpenTencentNavigation ? (
            <a
              className="route-dock__start"
              href={tencentNavigationUrl}
              target={isMobileBrowser ? undefined : '_blank'}
              rel={isMobileBrowser ? undefined : 'noreferrer'}
            >
              <Navigation size={14} /> {isMobileBrowser ? '腾讯地图实时导航' : '在腾讯地图查看路线'}
            </a>
          ) : (
            <button className="route-dock__start" type="button" disabled title={hasBlockedEdges ? '腾讯导航无法接收本地校园封路信息，请按地图中的避让路线预览' : '请配置腾讯地图 Key 并确认起终点有坐标'}>
              <Navigation size={14} /> {hasBlockedEdges ? '按校园避让路线通行' : '腾讯地图导航不可用'}
            </button>
          )}
          {tencentWebRouteUrl && isMobileBrowser && (
            <a className="route-dock__web-fallback" href={tencentWebRouteUrl} target="_blank" rel="noreferrer">未打开 App？看网页版</a>
          )}
        </div>
      )}
      <button className="route-dock__clear" type="button" onClick={onClear} aria-label="清除路线"><X size={16} /></button>
      {routePlan.status === 'preview' && <small className="route-dock__navigation-note">腾讯地图会按 GPS 当前位置重新计算步行路线；避施工、避雨、无障碍等策略仅用于本页预览。</small>}
    </section>
  )
}
