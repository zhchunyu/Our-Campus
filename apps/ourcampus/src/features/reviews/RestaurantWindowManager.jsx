import { useEffect, useRef, useState } from 'react'
import { Check, X } from 'lucide-react'
import { STALL_CATEGORIES } from '../../data/restaurantWindows.js'

export function RestaurantWindowManager({ restaurant, deletingWindow, onClose, onSubmit }) {
  const [draft, setDraft] = useState({ number: '', name: '', category: '面食', dish: '', description: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  const closeRef = useRef(null)
  useEffect(() => { const previous = document.activeElement; closeRef.current?.focus(); return () => { if (previous?.isConnected) previous.focus?.() } }, [])
  const submit = async (event) => {
    event.preventDefault()
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try { await onSubmit(draft) } catch (failure) { setError(failure.message); lock.current = false; setBusy(false) }
  }
  const field = (key) => ({ value: draft[key], onChange: (event) => setDraft((current) => ({ ...current, [key]: event.target.value })) })
  return <div className="review-composer-backdrop" onClick={(event) => { if (!busy && event.target === event.currentTarget) onClose() }}>
    <section className="review-composer" data-review-composer role="dialog" aria-modal="true" aria-labelledby="window-manager-title" aria-busy={busy}>
      <div className="review-composer__handle" aria-hidden="true" />
      <header className="review-composer__header"><div><span>{restaurant.name} · 管理员</span><h2 id="window-manager-title">{deletingWindow ? '删除这个窗口？' : '添加餐厅窗口'}</h2></div><button ref={closeRef} disabled={busy} onClick={onClose} aria-label="关闭窗口管理"><X size={19} /></button></header>
      <form id="restaurant-window-manager-form" onSubmit={submit}>
        {deletingWindow ? <p className="window-manager-warning">将移除「{deletingWindow.name}」，所有同学都将看不到该窗口，其云端评价也会一并删除。已保存的本机评价不会被清除。</p> : <>
          <label className="review-composer__field">窗口编号<input required maxLength={12} placeholder="例如：一层 01" {...field('number')} /></label>
          <label className="review-composer__field">窗口名称<input required maxLength={40} placeholder="填写真实窗口名称" {...field('name')} /></label>
          <label className="review-composer__field">分类<select {...field('category')}>{STALL_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
          <label className="review-composer__field">招牌菜 <small>选填</small><input maxLength={60} placeholder="例如：番茄鸡蛋面" {...field('dish')} /></label>
          <label className="review-composer__field">窗口介绍 <small>选填</small><textarea rows={2} maxLength={200} placeholder="菜品特色、楼层或营业说明" {...field('description')} /></label>
        </>}
        {error && <p className="review-composer__error" role="alert">{error}</p>}
      </form>
      <footer className="review-composer__footer"><p className="review-composer__note">保存到服务器，其他手机重新打开餐厅即可看到更新。</p><button className="review-composer__submit" disabled={busy} type="submit" form="restaurant-window-manager-form"><Check size={18} />{busy ? '正在保存…' : deletingWindow ? '确认删除窗口' : '保存窗口'}</button></footer>
    </section>
  </div>
}
