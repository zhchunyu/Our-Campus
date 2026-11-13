import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { normalizeReviewPhotos } from '../../data/restaurantReviews.js'
import { PostImageGallery } from '../mobile/PostImageGallery.jsx'
import { useBackLayer } from '../../app/useBackLayer.js'
import { acquireInert } from '../../app/modalInert.js'

export function ReviewPhotoGallery({ review, viewerId }) {
  let images = []
  try { images = normalizeReviewPhotos(review.images) } catch { /* Keep readable text when a device attachment is damaged. */ }
  const [opened, setOpened] = useState(null)
  const dialog = useRef(null)
  const overlay = useRef(null)
  const active = opened !== null && images[opened] ? opened : null
  const close = () => setOpened(null)
  useBackLayer(active !== null, close, 200)
  useEffect(() => {
    if (active === null) return undefined
    const previous = document.activeElement
    const releases = [...document.body.children].filter((element) => element !== overlay.current).map(acquireInert)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.current?.focus()
    const keydown = (event) => {
      if (!['Escape', 'Tab', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return
      event.stopImmediatePropagation()
      if (event.key === 'Escape') { event.preventDefault(); close() }
      if (event.key === 'ArrowLeft') { event.preventDefault(); setOpened((index) => Math.max(0, index - 1)) }
      if (event.key === 'ArrowRight') { event.preventDefault(); setOpened((index) => Math.min(images.length - 1, index + 1)) }
      if (event.key === 'Tab') {
        const buttons = [...dialog.current.querySelectorAll('button:not(:disabled)')]
        if (event.shiftKey && (document.activeElement === buttons[0] || document.activeElement === dialog.current)) { event.preventDefault(); buttons.at(-1)?.focus() }
        else if (!event.shiftKey && (document.activeElement === buttons.at(-1) || document.activeElement === dialog.current)) { event.preventDefault(); buttons[0]?.focus() }
      }
    }
    window.addEventListener('keydown', keydown, true)
    return () => {
      window.removeEventListener('keydown', keydown, true)
      releases.forEach((release) => release())
      document.body.style.overflow = previousOverflow
      if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [active !== null, images.length])
  if (review.isCloud) return <>
    {review.imagePaths?.length > 0 && !viewerId && <p className="restaurant-review-photo-login">登录后可查看 {review.imagePaths.length} 张用餐照片</p>}
    <PostImageGallery paths={review.imagePaths} viewerId={viewerId} label="用餐照片" />
  </>
  if (!images.length) return null
  return <div className="restaurant-review-photos" aria-label="本机用餐照片">
    <div className="restaurant-review-photos__grid">{images.map((source, index) => <button type="button" key={`${index}:${source.length}`} onClick={() => setOpened(index)} aria-label={`放大用餐照片 ${index + 1}`}><img src={source} alt={`用餐照片 ${index + 1}`} loading="lazy" /></button>)}</div>
    {active !== null && createPortal(<div className="post-image-viewer" ref={overlay} onClick={(event) => { if (event.target === event.currentTarget) close() }}><section role="dialog" aria-modal="true" aria-label="用餐照片预览" ref={dialog} tabIndex={-1}><header><span>{active + 1} / {images.length}</span><button type="button" aria-label="关闭照片预览" onClick={close}><X size={22} /></button></header><img src={images[active]} alt={`用餐照片 ${active + 1}`} /><footer><button type="button" disabled={active === 0} aria-label="上一张照片" onClick={() => setOpened(active - 1)}><ChevronLeft size={24} /></button><button type="button" disabled={active === images.length - 1} aria-label="下一张照片" onClick={() => setOpened(active + 1)}><ChevronRight size={24} /></button></footer></section></div>, document.body)}
  </div>
}
