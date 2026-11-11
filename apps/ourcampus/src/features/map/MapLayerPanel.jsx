import { Layers3 } from 'lucide-react'

const LAYERS = [
  { key: 'showLabels', label: '地点标签', description: '腾讯地图使用原生标签；此开关只控制校园示意图' },
  { key: 'showHotspots', label: '校园热点', description: '显示活动、人流和施工状态' },
  { key: 'showLostFound', label: '失物招领', description: '显示寻找中的本机发布，关联到校园建筑' },
  { key: 'showRoute', label: '当前路线', description: '显示路线规划覆盖层' },
  { key: 'showCurrentLocation', label: '我的位置', description: '仅校园示意图显示模拟点位；腾讯底图不叠加推算标记' },
  { key: 'showStatusColors', label: '状态颜色', description: '校园示意图显示开放和人流状态色；腾讯底图保留原生样式' },
]

const MOBILE_LAYERS = LAYERS.filter((layer) => ['showHotspots', 'showLostFound', 'showRoute'].includes(layer.key))

export function MapLayerPanel({ settings, onChange, compact = false }) {
  const visibleLayers = compact ? MOBILE_LAYERS : LAYERS

  return (
    <section className={`map-layer-panel${compact ? ' map-layer-panel--compact' : ''}`} aria-label="地图图层设置">
      <div className="map-panel-heading"><Layers3 size={14} /><span>地图图层</span></div>
      <div className="map-layer-list">
        {visibleLayers.map((layer) => (
          <label className="map-layer-row" key={layer.key}>
            <span>
              <strong>{layer.label}</strong>
              <small>{layer.description}</small>
            </span>
            <input
              type="checkbox"
              checked={settings[layer.key]}
              onChange={(event) => onChange({ [layer.key]: event.target.checked })}
              aria-label={layer.label}
            />
          </label>
        ))}
      </div>
    </section>
  )
}
