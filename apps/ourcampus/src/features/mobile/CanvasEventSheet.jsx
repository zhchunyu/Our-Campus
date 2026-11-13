import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, MapPin, X } from 'lucide-react'
import { acquireInert } from '../../app/modalInert.js'
import { useBackLayer } from '../../app/useBackLayer.js'
import { PostImageGallery } from './PostImageGallery.jsx'

const dateFormat = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
function formatDate(value) { return Number.isFinite(Date.parse(value)) ? dateFormat.format(new Date(value)) : '时间未提供' }

export function CanvasEventSheet({ event, location, viewerId, onClose, onSelectLocation }) {
  const dialog = useRef(null)
  useBackLayer(true, onClose, 125)
  useEffect(() => {
    const previous = document.activeElement
    const root = document.getElementById('root')
    const release = root ? acquireInert(root) : null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.current?.focus()
    const trap = (key) => {
      if (key.key !== 'Tab') return
      const controls = [...dialog.current.querySelectorAll('button:not(:disabled), a[href]')].filter((node) => node.getClientRects().length)
      const first = controls[0], last = controls.at(-1)
      if (!first) { key.preventDefault(); return }
      if (key.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { key.preventDefault(); last.focus() }
      else if (!key.shiftKey && document.activeElement === last) { key.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', trap)
    return () => { release?.(); document.body.style.overflow = overflow; document.removeEventListener('keydown', trap); if (previous?.isConnected) previous.focus({ preventScroll: true }) }
  }, [])
  return createPortal(<div className="canvas-event-overlay" onClick={(click) => { if (click.target === click.currentTarget) onClose() }}><section className="canvas-event-sheet" role="dialog" aria-modal="true" aria-labelledby="canvas-event-title" ref={dialog} tabIndex={-1}>
    <header><span>{event.isCloud && !event.isDemo ? '校园发布' : '示例动态'}</span><button type="button" aria-label="关闭动态详情" onClick={onClose}><X size={22} /></button></header>
    <div className="canvas-event-sheet__body"><h2 id="canvas-event-title">{event.title}</h2><p className="canvas-event-sheet__date">{formatDate(event.startAt)} — {formatDate(event.endAt)}</p><PostImageGallery paths={event.imagePaths} viewerId={viewerId} label={event.title} /><p>{event.impact}</p>{location && <button className="canvas-place-link" type="button" onClick={() => onSelectLocation(location.id)}><MapPin size={16} />{location.name} <ArrowRight size={16} /></button>}</div>
    {location && <footer><button type="button" onClick={() => onSelectLocation(location.id)}>在地图查看 <ArrowRight size={17} /></button></footer>}
  </section></div>, document.body)
}
