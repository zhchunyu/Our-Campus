import { LocateFixed, MapPin, Minus, Plus, RotateCcw, Route } from 'lucide-react'

export function MapControls({
  canFocusSelected,
  canFocusCurrentLocation,
  canFocusRoute,
  onZoomIn,
  onZoomOut,
  onFocusSelected,
  onFocusCurrentLocation,
  onFocusRoute,
  onResetView,
}) {
  return (
    <div className="campus-3d-map-controls" role="group" aria-label="三维地图视角控制">
      <button type="button" aria-label="放大三维地图" title="放大" onClick={onZoomIn}><Plus size={15} /></button>
      <button type="button" aria-label="缩小三维地图" title="缩小" onClick={onZoomOut}><Minus size={15} /></button>
      <span className="campus-3d-map-controls__divider" />
      <button type="button" aria-label="聚焦选中地点" title="聚焦选中地点" disabled={!canFocusSelected} onClick={onFocusSelected}><MapPin size={15} /></button>
      <button type="button" aria-label="聚焦我的位置" title="聚焦我的位置" disabled={!canFocusCurrentLocation} onClick={onFocusCurrentLocation}><LocateFixed size={15} /></button>
      <button type="button" aria-label="聚焦当前路线" title="聚焦当前路线" disabled={!canFocusRoute} onClick={onFocusRoute}><Route size={15} /></button>
      <span className="campus-3d-map-controls__divider" />
      <button type="button" aria-label="重置三维地图视角" title="重置视角" onClick={onResetView}><RotateCcw size={14} /></button>
    </div>
  )
}
