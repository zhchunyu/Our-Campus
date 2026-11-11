import { useEffect, useRef, useState } from 'react'
import { Check, Star, X } from 'lucide-react'
import { REVIEW_TAGS } from '../../data/restaurantReviews.js'
import { newReportId } from '../../data/campusInformation.js'

const RATING_LABELS = ['选一个星级', '不太满意', '还有提升空间', '一般般', '值得一试', '很推荐']

export function ReviewComposer({ restaurant, windows, initialWindowId, onClose, onSubmit, cloud = false }) {
  const [windowId, setWindowId] = useState(initialWindowId)
  const [rating, setRating] = useState(0)
  const [tags, setTags] = useState([])
  const [content, setContent] = useState('')
  const [price, setPrice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
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
    if (submittingRef.current) return
    submittingRef.current = true
    setBusy(true)
    setError('')
    try { await onSubmit({ windowId, rating, tags, content, price, clientId: clientId.current }) }
    catch (failure) { setError(failure.message || '保存失败，请重试') }
    finally { submittingRef.current = false; setBusy(false) }
  }

  return (
    <div className="review-composer-backdrop" onClick={(event) => { if (!busy && event.target === event.currentTarget) onClose() }}>
      <section className="review-composer" data-review-composer role="dialog" aria-modal="true" aria-labelledby="review-composer-title">
        <div className="review-composer__handle" aria-hidden="true" />
        <header className="review-composer__header">
          <div><span>分享一顿饭的体验</span><h2 id="review-composer-title">写窗口评价</h2></div>
          <button ref={closeRef} type="button" disabled={busy} onClick={onClose} aria-label="关闭评价表单"><X size={19} /></button>
        </header>
        <form id="restaurant-window-review-form" onSubmit={submit} noValidate>
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
          <label className="review-composer__field" htmlFor="review-content">想推荐，还是想吐槽？
            <textarea id="review-content" value={content} onChange={(event) => setContent([...event.target.value].slice(0, 300).join(''))} rows={4} placeholder="吃了什么？味道、分量、排队体验都可以聊聊…" aria-describedby="review-content-count" />
            <small className="review-composer__count" id="review-content-count">{[...content].length} / 300</small>
          </label>
          <label className="review-composer__field">这顿花了多少 <small>选填</small>
            <div className="review-composer__price"><span>¥</span><input type="number" inputMode="decimal" min="0" max="200" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="填写消费金额" /><span>元</span></div>
          </label>
          {error && <p ref={errorRef} className="review-composer__error" role="alert">{error}</p>}
        </form>
        <footer className="review-composer__footer">
          <p className="review-composer__note">{restaurant.name} · {cloud ? '登录后公开发布，其他同学可以查看。请评价用餐体验。' : '当前仅存本机，服务器部署完成后支持公开评价。'}</p>
          <button className="review-composer__submit" disabled={busy} type="submit" form="restaurant-window-review-form"><Check size={18} />{busy ? '提交中…' : cloud ? '发布评价' : '保存本机评价'}</button>
        </footer>
      </section>
    </div>
  )
}
