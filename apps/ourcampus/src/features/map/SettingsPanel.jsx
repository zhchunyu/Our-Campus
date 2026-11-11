import { useState } from 'react'
import { FileCog, Maximize2, RotateCcw, Route, Trash2 } from 'lucide-react'
import { ROUTE_MODES, ROUTE_MODE_LABELS } from '../../domain/route.js'
import { teamCampusMap } from '../../data/campusMap.js'

export function SettingsPanel({ settings, onChange, onResetSettings, onResetView, onFullscreen, onClearRoute, onClearCurrentLocation, onResetDemoData, canUndoAdminAction, lastAdminAction, onUndoAdminAction, showClearCurrentLocation = true, showDevelopmentTools = true }) {
  const [confirmReset, setConfirmReset] = useState(false)

  return (
    <section className="settings-panel" aria-label="地图设置">
      <div className="map-panel-heading"><FileCog size={14} /><span>地图设置</span></div>
      <label className="settings-toggle">
        <span><strong>操作提示</strong><small>显示缩放、拖动和漫游提示</small></span>
        <input type="checkbox" checked={settings.showTips} onChange={(event) => onChange({ showTips: event.target.checked })} aria-label="操作提示" />
      </label>
      <label className="settings-route-mode">
        <span><strong>默认路线策略</strong><small>新建路线时优先使用此模式</small></span>
        <select value={settings.defaultRouteMode} onChange={(event) => onChange({ defaultRouteMode: event.target.value })} aria-label="默认路线策略">
          {Object.values(ROUTE_MODES).map((mode) => <option value={mode} key={mode}>{ROUTE_MODE_LABELS[mode]}</option>)}
        </select>
      </label>
      <div className="settings-actions">
        <button type="button" onClick={onResetView}><RotateCcw size={13} />重置视角</button>
        <button type="button" onClick={onFullscreen}><Maximize2 size={13} />全屏地图</button>
        <button type="button" onClick={onClearRoute}><Route size={13} />清除路线</button>
        {showClearCurrentLocation && <button type="button" onClick={onClearCurrentLocation}><Trash2 size={13} />清除模拟位置</button>}
      </div>
      <div className="settings-footer-actions">
        <button type="button" onClick={onResetSettings}>恢复默认设置</button>
        {showDevelopmentTools && <button type="button" onClick={() => setConfirmReset(true)}>恢复演示数据</button>}
      </div>
      {showDevelopmentTools && confirmReset && (
        <div className="settings-reset-confirm" role="alertdialog" aria-label="确认恢复演示数据">
          <strong>确定恢复演示数据？</strong>
          <span>这会清除本机保存的管理员修改、热点和撤销记录。</span>
          <div>
            <button type="button" onClick={() => setConfirmReset(false)}>取消</button>
            <button type="button" onClick={() => { onResetDemoData(); setConfirmReset(false) }}>确认恢复</button>
          </div>
        </div>
      )}
      {canUndoAdminAction && lastAdminAction && (
        <div className="settings-undo">
          <span><small>最近管理操作</small><strong>{lastAdminAction.label}</strong></span>
          <button type="button" onClick={onUndoAdminAction}>撤销</button>
        </div>
      )}
      {showDevelopmentTools && <p className="settings-meta">v0.1.0 · 地图 {teamCampusMap.version}<br />本地自动保存 · 演示数据源</p>}
    </section>
  )
}
