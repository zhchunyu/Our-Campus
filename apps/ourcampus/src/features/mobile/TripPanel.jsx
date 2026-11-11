import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, MapPinned, Navigation, Route as RouteIcon } from 'lucide-react'
import { RouteDock } from '../routes/RouteDock.jsx'

export function TripPanel({
  locations,
  currentLocationId,
  routePlan,
  routeResult,
  showRoute,
  onPlanRoute,
  onOpenMap,
  onModeChange,
  onOriginChange,
  onDestinationChange,
  onSwap,
  onClear,
}) {
  const [originId, setOriginId] = useState(routePlan?.originId ?? currentLocationId ?? 'east-gate')
  const [destinationId, setDestinationId] = useState(routePlan?.destinationId ?? '')
  const [destinationQuery, setDestinationQuery] = useState('')

  const destinationMatches = useMemo(() => {
    const normalizedQuery = destinationQuery.trim().toLocaleLowerCase()
    if (!normalizedQuery || destinationId) return []
    return locations.filter((location) => (
      [location.name, ...(location.aliases ?? []), ...(location.keywords ?? [])]
        .some((term) => String(term).toLocaleLowerCase().includes(normalizedQuery))
    )).slice(0, 6)
  }, [destinationId, destinationQuery, locations])

  useEffect(() => {
    const destination = locations.find((location) => location.id === routePlan?.destinationId)
    setOriginId(routePlan?.originId ?? currentLocationId ?? 'east-gate')
    setDestinationId(destination?.id ?? '')
    setDestinationQuery(destination?.name ?? '')
  }, [routePlan?.originId, routePlan?.destinationId, currentLocationId, locations])

  return (
    <section className="mobile-page-panel mobile-page-panel--trip" aria-label="行程规划">
      <header className="mobile-page-heading">
        <span className="mobile-page-heading__eyebrow">CAMPUS ROUTE</span>
        <h2>行程</h2>
        <p>选择校园内的起点和目的地，查看适合的步行路线。</p>
      </header>

      {routePlan ? (
        <>
          <div className="mobile-trip-summary">
            <span><Navigation size={15} /> 当前路线</span>
            <strong>{locations.find((location) => location.id === routePlan.originId)?.name} <ArrowRight size={15} /> {locations.find((location) => location.id === routePlan.destinationId)?.name}</strong>
            <small>可在路线卡片中更换起终点、路线模式或查看分段指引。</small>
          </div>
          <RouteDock
            routePlan={routePlan}
            locations={locations}
            routeResult={routeResult}
            showRoute={showRoute}
            onModeChange={onModeChange}
            onOriginChange={onOriginChange}
            onDestinationChange={onDestinationChange}
            onSwap={onSwap}
            onClear={onClear}
          />
        </>
      ) : (
        <form
          className="mobile-trip-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (destinationId) onPlanRoute({ originId, destinationId })
          }}
        >
          <label>
            <span>出发地点</span>
            <select value={originId} onChange={(event) => setOriginId(event.target.value)}>
              {locations.map((location) => <option value={location.id} key={location.id}>{location.name}</option>)}
            </select>
          </label>
          <label>
            <span>到达地点</span>
            <input
              type="search"
              value={destinationQuery}
              placeholder="搜索教学楼、食堂、公寓…"
              onChange={(event) => {
                setDestinationQuery(event.target.value)
                setDestinationId('')
              }}
            />
          </label>
          {destinationMatches.length > 0 && (
            <div className="mobile-trip-form__suggestions" role="listbox" aria-label="搜索到的校园地点">
              {destinationMatches.map((location) => (
                <button
                  className="mobile-trip-form__suggestion"
                  type="button"
                  key={location.id}
                  role="option"
                  aria-selected={false}
                  onClick={() => {
                    setDestinationId(location.id)
                    setDestinationQuery(location.name)
                  }}
                >
                  <span>{location.name}</span><small>{location.description || '校园地点'}</small>
                </button>
              ))}
            </div>
          )}
          <button type="submit" disabled={!destinationId}>
            <RouteIcon size={17} /> 规划路线
          </button>
          <button className="mobile-trip-form__map-pick" type="button" onClick={onOpenMap}>
            <MapPinned size={16} /> 在地图上点选地点
          </button>
          <small>当前位置使用本机保存的模拟地点；没有设置时从西校门开始。</small>
        </form>
      )}
    </section>
  )
}
