import { Flame, Megaphone, TrafficCone } from 'lucide-react'

export function HotspotLegend({ active = true }) {
  if (!active) return null

  return (
    <div className="hotspot-legend" aria-label="校园热点图例">
      <span><i className="hotspot-dot hotspot-dot--activity" /><Megaphone size={12} /> 活动</span>
      <span><i className="hotspot-dot hotspot-dot--crowd" /><Flame size={12} /> 人流</span>
      <span><i className="hotspot-dot hotspot-dot--construction" /><TrafficCone size={12} /> 施工</span>
    </div>
  )
}
