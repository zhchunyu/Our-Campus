import { LocateFixed, MapPin, RotateCcw } from 'lucide-react'

export function SimulatedLocationPicker({ locations = [], currentLocationId, onChange, compact = false }) {
  const currentLocation = locations.find((location) => location.id === currentLocationId)

  if (compact) {
    return (
      <label className="simulated-location-picker simulated-location-picker--compact">
        <span className="simulated-location-picker__compact-label">路线起点（演示）</span>
        <select
          value={currentLocationId ?? ''}
          onChange={(event) => onChange(event.target.value || null)}
          aria-label="路线起点演示位置"
        >
          <option value="">默认西校门</option>
          {locations.map((location) => (
            <option value={location.id} key={location.id}>{location.name}</option>
          ))}
        </select>
      </label>
    )
  }

  return (
    <div className="simulated-location-picker">
      <div className="simulated-location-picker__heading">
        <span><LocateFixed size={14} />模拟我的位置</span>
        <small>本地演示</small>
      </div>
      <p>选择一个校园地点作为路线起点。</p>
      <div className="simulated-location-picker__options">
        <button
          className={!currentLocationId ? 'is-selected' : ''}
          type="button"
          onClick={() => onChange(null)}
        >
          <RotateCcw size={13} />未选择（默认西校门）
        </button>
        {locations.map((location) => (
          <button
            className={currentLocationId === location.id ? 'is-selected' : ''}
            key={location.id}
            type="button"
            onClick={() => onChange(location.id)}
          >
            <MapPin size={13} />{location.name}
          </button>
        ))}
      </div>
      <div className="simulated-location-picker__current">
        当前：<strong>{currentLocation?.name ?? '未选择，路线从西校门开始'}</strong>
      </div>
    </div>
  )
}
