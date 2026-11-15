import { useMemo, useState } from 'react'
import { Maximize2 } from 'lucide-react'
import { teamCampusMap } from '../../data/campusMap.js'
import { TencentCampusMap } from '../map/TencentCampusMap.jsx'

export function HomeMapPreview({ locations, livePosition, onSelectLocation, onOpenMap }) {
  const [fallback, setFallback] = useState(!import.meta.env.VITE_TENCENT_MAP_KEY)
  const labels = useMemo(() => {
    const ids = new Set(['library', 'canteen', 'teaching-a'])
    return locations.filter(place => ids.has(place.id))
  }, [locations])
  return <section className="along-home__map" aria-label="校园地点预览">
    {fallback ? <button className="along-home__map-image" type="button" onClick={onOpenMap}><img src={teamCampusMap.scenes['2d'].imageUrl} alt="校园地点引导图" /><span>校园引导图</span></button> : <TencentCampusMap initialZoom={15.6} forceCampusLabels locations={labels} events={[]} livePosition={livePosition} onSelectLocation={onSelectLocation} onUseCampusMap={() => setFallback(true)} />}
    <button className="along-home__map-expand" type="button" onClick={onOpenMap}><Maximize2 size={16} />展开地图</button>
  </section>
}
