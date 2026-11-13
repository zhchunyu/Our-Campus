import { useEffect, useRef, useState } from 'react'
import { Check, Star, X } from 'lucide-react'
import { REVIEW_TAGS } from '../../data/restaurantReviews.js'
import { newReportId } from '../../data/campusInformation.js'
import { PostImagePicker } from '../mobile/PostImagePicker.jsx'
import { useReviewPhotoDraft } from './useReviewPhotoDraft.js'

const RATING_LABELS = ['选一个星级', '不太满意', '还有提升空间', '一般般', '值得一试', '很推荐']

export function ReviewComposer({ restaurant, windows, initialWindowId, onClose, onSubmit, cloud = false, userId }) {
  const [windowId, setWindowId] = useState(initialWindowId)
  const [rating, setRating] = useState(0)
  const [tags, setTags] = useState([])
  const [content, setContent] = useState('')
  const [price, setPrice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const photos = useReviewPhotoDraft(userId)
  const publishCloud = cloud && windows.some((item) => item.id === windowId && item.cloudStored)
  const clientId = useRef(newReportId())
  const submittingRef = useRef(false)
  const closeRef = useRef(null)
  const errorRef = useRef(null)

  useEffect(() => {
    const previous = document.activeElement
    closeRef.current?.focus()
    return () => { if (previous?.isConnected) previous.focus?.() }
  }, [])
  useEffect(() => { if (error) errorRef.current?.scrollIntoView({ block: 'nearest' }) }, [error])

  const submit = async (event) => {
    event.preventDefault()
    if (submittingRef.current || photos.busy) return
    submittingRef.current = true
    setBusy(true)
    setError('')
    try { await onSubmit({ windowId, rating, tags, content, price, ...photos.snapshot(), clientId: clientId.current }) }
    catch (failure) { setError(failure.message || '保存失败，请重试') }
    finally { submittingRef.current = false; setBusy(false) }
  }

  return (
    <div className="review-composer-backdrop" onClick={(event) => { if (!busy && event.target === event.currentTarget) onClose() }}>
      <section className="review-composer" data-review-composer role="dialog" aria-modal="true" aria-busy={busy || photos.busy} aria-labelledby="review-composer-title">
        <div className="review-composer__handle" aria-hidden="true" />
        <header className="review-composer__header">
          <div><span>评分、文字与照片</span><h2 id="review-composer-title">写窗口评价</h2></div>
          <button ref={closeRef} type="button" disabled={busy} onClick={onClose} aria-label="关闭评价表单"><X size={19} /></button>
        </header>
        <form id="restaurant-window-review-form" onSubmit={submit} noValidate>
          <fieldset className="review-composer__fields" disabled={busy}>
          <label className="review-composer__field">评价哪个窗口
            <select value={windowId} onChange={(event) => setWindowId(event.target.value)}>
              {windows.map((window) => <option key={window.id} value={window.id}>{window.numberVerified === false ? window.floor : `${window.number} 号`} · {window.name}{window.isExample ? '（示例）' : ''}</option>)}
            </select>
          </label>
          <fieldset className="review-composer__rating">
            <legend>整体体验</legend>
            <div className="review-composer__stars">
              {[1, 2, 3, 4, 5].map((score) => (
                <label key={score} className={score <= rating ? 'is-active' : ''}>
                  <input type="radio" name="window-rating" value={score} checked={rating === score} onChange={() => { setRating(score); setError('') }} aria-label={`${score} 星`} />
                  <Star size={32} fill={score <= rating ? 'currentColor' : 'none'} aria-hidden="true" />
                </label>
              ))}
            </div>
            <span>{RATING_LABELS[rating]}</span>
          </fieldset>
          <div className="review-composer__field"><span>给它贴个标签 <small>最多 3 个</small></span>
            <div className="review-composer__tags">
              {REVIEW_TAGS.map((tag) => <button key={tag} type="button" className={tags.includes(tag) ? 'is-active' : ''} aria-pressed={tags.includes(tag)} disabled={!tags.includes(tag) && tags.length >= 3} onClick={() => setTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag])}>{tag}</button>)}
            </div>
          </div>
          <label className="review-composer__field" htmlFor="review-content">用餐评价
            <textarea id="review-content" value={content} onChange={(event) => setContent([...event.target.value].slice(0, 300).join(''))} rows={4} placeholder="填写菜品、口味、分量或等餐时间" aria-describedby="review-content-count" />
            <small className="review-composer__count" id="review-content-count">{[...content].length} / 300</small>
          </label>
          <label className="review-composer__field">消费金额 <small>选填</small>
            <div className="review-composer__price"><span>¥</span><input type="number" inputMode="decimal" min="0" max="200" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="填写消费金额" /><span>元</span></div>
          </label>
          <fieldset className="review-composer__photos" disabled={busy}>
            <legend>用餐照片 <small>选填</small></legend>
            <PostImagePicker draft={photos} disabled={busy} label="添加用餐照片" />
            <p>{publishCloud ? '照片随评价发布，登录同学可查看。' : '压缩照片随评价保存在当前设备。'}</p>
          </fieldset>
          </fieldset>
          {error && <p ref={errorRef} className="review-composer__error" role="alert">{error}</p>}
        </form>
        <footer className="review-composer__footer">
          <p className="review-composer__note">{restaurant.name} · {publishCloud ? '登录后公开发布，其他同学可以查看。请评价用餐体验。' : '当前仅保存在这台设备，其他同学看不到。'}</p>
          <button className="review-composer__submit" disabled={busy || photos.busy} type="submit" form="restaurant-window-review-form"><Check size={18} />{photos.busy ? '正在处理照片…' : busy ? '提交中…' : publishCloud ? '发布评价' : '保存本机评价'}</button>
        </footer>
      </section>
    </div>
  )
}
