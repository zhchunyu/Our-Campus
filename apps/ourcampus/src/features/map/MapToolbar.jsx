import { Layers3, LocateFixed, Megaphone, PanelLeft, Settings2, ShieldCheck, Tags } from 'lucide-react'
import { RoleSwitcher } from '../roles/RoleSwitcher.jsx'
import { EventComposer } from '../events/EventComposer.jsx'
import { SimulatedLocationPicker } from './SimulatedLocationPicker.jsx'
import { MapLayerPanel } from './MapLayerPanel.jsx'
import { SettingsPanel } from './SettingsPanel.jsx'

const tools = [
  { id: 'categories', label: '地点分类', icon: Tags },
  { id: 'layers', label: '图层显示', icon: Layers3 },
  { id: 'role', label: '角色模式', icon: ShieldCheck },
  { id: 'settings', label: '设置', icon: Settings2 },
  { id: 'location', label: '我的位置', icon: LocateFixed },
]

export function MapToolbar({ open, activeTool, role, settings, locations, events, currentLocationId, canUndoAdminAction, lastAdminAction, onToggle, onToolChange, onRoleChange, onCurrentLocationChange, onSettingsChange, onResetSettings, onResetView, onFullscreen, onClearRoute, onClearCurrentLocation, onResetDemoData, onPublishEvent, onUpdateEvent, onCloseEvent, onUndoAdminAction }) {
  const visibleTools = role === 'manager' ? [...tools, { id: 'events', label: '发布热点', icon: Megaphone }] : tools

  const handleToolClick = (toolId) => {
    if (toolId === 'location' && !open) {
      onToggle(true)
      onToolChange(toolId)
      return
    }

    onToolChange(activeTool === toolId ? null : toolId)
  }

  return (
    <aside className={`map-toolbar ${open ? 'is-expanded' : ''}`} aria-label="地图工具栏">
      <button className="map-toolbar__toggle" type="button" onClick={() => { if (open) onToolChange(null); onToggle() }} aria-expanded={open} aria-label={open ? '收起工具栏' : '展开工具栏'}>
        <PanelLeft size={17} />
        <span>{open ? '收起工具' : '地图工具'}</span>
      </button>
      <div className="map-toolbar__tools">
        {visibleTools.map(({ id, label, icon: Icon }) => (
          <button
            className={`map-tool-button ${activeTool === id ? 'is-active' : ''}`}
            type="button"
            key={id}
            onClick={() => handleToolClick(id)}
            aria-pressed={activeTool === id}
          >
            <Icon size={17} />
            <span>{label}</span>
          </button>
        ))}
      </div>
      {open && activeTool === 'role' && (
        <div className="map-toolbar__drawer">
          <RoleSwitcher role={role} onChange={onRoleChange} />
        </div>
      )}
      {open && activeTool === 'categories' && <div className="map-toolbar__hint">使用搜索框或分类入口筛选地点。</div>}
      {open && activeTool === 'layers' && <MapLayerPanel settings={settings} onChange={onSettingsChange} />}
      {open && activeTool === 'settings' && (
        <SettingsPanel
          settings={settings}
          onChange={onSettingsChange}
          onResetSettings={onResetSettings}
          onResetView={onResetView}
          onFullscreen={onFullscreen}
          onClearRoute={onClearRoute}
          onClearCurrentLocation={onClearCurrentLocation}
          onResetDemoData={onResetDemoData}
          canUndoAdminAction={canUndoAdminAction}
          lastAdminAction={lastAdminAction}
          onUndoAdminAction={onUndoAdminAction}
        />
      )}
      {open && activeTool === 'location' && (
        <SimulatedLocationPicker locations={locations} currentLocationId={currentLocationId} onChange={onCurrentLocationChange} />
      )}
      {open && activeTool === 'events' && role === 'manager' && <EventComposer locations={locations} events={events} onPublish={onPublishEvent} onUpdate={onUpdateEvent} onClose={onCloseEvent} />}
    </aside>
  )
}
