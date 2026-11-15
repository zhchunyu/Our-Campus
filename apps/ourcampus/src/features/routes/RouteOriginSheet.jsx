import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ArrowRight, LocateFixed, MapPin, X } from 'lucide-react'
import { useBackLayer } from '../../app/useBackLayer.js'
import { nearbyRouteOrigins, validRouteOrigin } from './routeOrigin.js'
import './route-origin.css'

export function RouteOriginSheet({ locations, destinationId, devicePosition, deviceLocationStatus, deviceLocationMessage, onLocate, onConfirm, onClose }) {
  const [originId, setOriginId] = useState('')
  const frameRef = useRef(null), closeRef = useRef(null)
  const destination = locations.find(place => place.id === destinationId)
  const nearby = nearbyRouteOrigins(devicePosition, locations)
  useBackLayer(true, onClose, 65)
  useEffect(() => {
    const previous = document.activeElement, overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'; closeRef.current?.focus()
    const trap = event => {
      if (event.key !== 'Tab') return
      const items = [...frameRef.current.querySelectorAll('button:not(:disabled),select:not(:disabled)')].filter(item => item.getClientRects().length)
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus() }
      else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0]?.focus() }
    }
    window.addEventListener('keydown', trap)
    return () => { window.removeEventListener('keydown', trap); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus?.() }
  }, [])
  return createPortal(<div className="along-origin-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose() }}><section className="along-origin-sheet" role="dialog" aria-modal="true" aria-labelledby="along-origin-title" ref={frameRef}>
    <header><div><small>路线</small><h2 id="along-origin-title">从哪里出发</h2></div><button ref={closeRef} type="button" aria-label="关闭起点选择" onClick={onClose}><X size={22} /></button></header>
    <p className="along-origin-destination"><MapPin size={18} /><span>前往 <strong>{destination?.name || '所选地点'}</strong></span></p>
    <label htmlFor="along-origin-place">选择校园起点</label><select id="along-origin-place" value={originId} onChange={event => setOriginId(event.target.value)}><option value="">请选择出发地点</option>{locations.map(place => <option key={place.id} value={place.id}>{place.name}</option>)}</select>
    <button className="along-origin-locate" type="button" disabled={deviceLocationStatus === 'loading'} onClick={onLocate}><LocateFixed size={18} />{deviceLocationStatus === 'loading' ? '正在定位…' : '看看我附近的起点'}</button>
    {deviceLocationStatus === 'error' && <p className="along-origin-error" role="status">{deviceLocationMessage || '暂时无法定位，可直接选择校园起点。'}</p>}
    {deviceLocationStatus === 'located' && <div className="along-origin-suggestions"><p>{nearby.length ? `定位误差约 ${Math.round(devicePosition.accuracy)} 米，以下为附近地点，请选择：` : '定位范围内没有合适的校园起点，可从上方选择。'}</p>{nearby.map(({ place, distance }) => <button key={place.id} type="button" className={originId === place.id ? 'is-selected' : ''} aria-pressed={originId === place.id} onClick={() => setOriginId(place.id)}><span>{place.name}</span><small>直线约 {distance} 米</small></button>)}</div>}
    <p className="along-origin-note">校园路线从所选地点估算。打开腾讯导航后，可按设备位置重新计算。</p>
    <footer><button type="button" onClick={onClose}><ArrowLeft size={17} />返回</button><button type="button" disabled={!validRouteOrigin(originId, locations)} onClick={() => onConfirm(originId)}>查看路线 <ArrowRight size={18} /></button></footer>
  </section></div>, document.body)
}
