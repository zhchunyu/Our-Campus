export function MapSceneSwitcher({ scene, onChange }) {
  return (
    <div className="map-scene-switcher" role="tablist" aria-label="地图场景">
      {[
        ['2d', '2D 总览'],
        ['3d', '3D 主视角'],
      ].map(([value, label]) => (
        <button
          className={scene === value ? 'is-active' : ''}
          key={value}
          type="button"
          role="tab"
          aria-selected={scene === value}
          onClick={() => onChange(value)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
