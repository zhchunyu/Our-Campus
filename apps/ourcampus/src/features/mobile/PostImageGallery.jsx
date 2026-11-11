import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { safePostImagePaths, signPostImages } from '../../data/postImages.js'
import { useBackLayer } from '../../app/useBackLayer.js'
import { acquireInert } from '../../app/modalInert.js'
import './post-images.css'
export function PostImageGallery({ paths, viewerId, label = '发布照片', loadImages = signPostImages }) {
  const valid = safePostImagePaths(paths)
  const key = `${viewerId || 'guest'}:${valid.join(',')}`
  const [state, setState] = useState({ key: '', images: [], error: '', loading: false })
  const [revision, setRevision] = useState(0)
  const [opened, setOpened] = useState(null)
  const dialog = useRef(null)
  const overlay = useRef(null)
  const visible = state.key === key ? state : { images: [], error: '', loading: true }
  const active = opened?.key === key && visible.images[opened.index] ? opened.index : null
  const close = () => setOpened(null)
  useBackLayer(active !== null, close, 200)
  useEffect(() => {
    let live = true
    if (!viewerId || !valid.length) { setState({ key, images: [], error: '', loading: false }); return undefined }
    const load = async () => {
      try { const images = await loadImages(valid); if (live) setState({ key, images, error: '', loading: false }) }
      catch (error) { if (live) setState({ key, images: [], error: error.message, loading: false }) }
    }
    setState({ key, images: [], error: '', loading: true }); void load()
    const timer = setInterval(load, 240000)
    return () => { live = false; clearInterval(timer) }
  }, [key, revision, loadImages])
  useEffect(() => {
    if (active === null) return undefined
    const previous = document.activeElement
    const releaseSiblings = [...document.body.children].filter((element) => element !== overlay.current).map(acquireInert)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.current?.focus()
    const keydown = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close() }
      if (event.key === 'Tab') {
        event.stopImmediatePropagation()
        const buttons = [...dialog.current.querySelectorAll('button:not([disabled])')]
        if (event.shiftKey && (document.activeElement === buttons[0] || document.activeElement === dialog.current)) { event.preventDefault(); buttons.at(-1)?.focus() }
        else if (!event.shiftKey && (document.activeElement === buttons.at(-1) || document.activeElement === dialog.current)) { event.preventDefault(); buttons[0]?.focus() }
      }
    }
    window.addEventListener('keydown', keydown, true)
    return () => { window.removeEventListener('keydown', keydown, true); releaseSiblings.forEach((release) => release()); document.body.style.overflow = previousOverflow; if (previous?.isConnected) previous.focus({ preventScroll: true }) }
  }, [active !== null])
  if (!valid.length || !viewerId) return null
  return <div className="post-image-gallery" aria-label={label}>
    {visible.loading && <small role="status">正在加载照片…</small>}
    {visible.error && <div className="post-image-error" role="status"><span>{visible.error}</span><button type="button" onClick={() => setRevision((value) => value + 1)}>重试照片</button></div>}
    <div className="post-image-gallery__grid">{visible.images.map((image, index) => <button type="button" key={image.path} aria-label={`放大${label} ${index + 1}`} onClick={() => setOpened({ key, index })}><img src={image.url} alt={`${label} ${index + 1}`} loading="lazy" onError={() => setState((current) => current.key === key && current.images.some((entry) => entry.path === image.path && entry.url === image.url) ? { key, images: [], loading: false, error: '照片加载失败，请重试' } : current)} /></button>)}</div>
    {active !== null && typeof document !== 'undefined' && createPortal(<div className="post-image-viewer" ref={overlay} onClick={(event) => { if (event.target === event.currentTarget) close() }}><section role="dialog" aria-modal="true" aria-label="照片预览" ref={dialog} tabIndex={-1}><header><span>{active + 1} / {visible.images.length}</span><button type="button" aria-label="关闭照片预览" onClick={close}><X size={22} /></button></header><img src={visible.images[active].url} alt={`${label} ${active + 1}`} /><footer><button type="button" disabled={active === 0} aria-label="上一张照片" onClick={() => setOpened({ key, index: active - 1 })}><ChevronLeft size={24} /></button><button type="button" disabled={active === visible.images.length - 1} aria-label="下一张照片" onClick={() => setOpened({ key, index: active + 1 })}><ChevronRight size={24} /></button></footer></section></div>, document.body)}
  </div>
}
