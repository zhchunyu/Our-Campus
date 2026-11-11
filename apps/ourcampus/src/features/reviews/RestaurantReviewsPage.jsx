import { campusDisplayText } from '../../data/campusPresentation.js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ArrowUpRight, ChevronRight, Leaf, MessageSquare, PenLine, Search, Soup, Star, ThumbsUp, Trash2, UtensilsCrossed, Wheat, X, ZoomIn, ZoomOut } from 'lucide-react'
import { createLocalRestaurantReview, getExampleWindowReviews, getRestaurantWindows, loadLocalRestaurantReviews, saveLocalRestaurantReviews, summarizeReviews, WINDOW_CATEGORIES } from '../../data/restaurantReviews.js'
import { ReviewComposer } from './ReviewComposer.jsx'
import { RestaurantWindowManager } from './RestaurantWindowManager.jsx'
import { addRestaurantWindow, deleteRestaurantWindow, loadRestaurantWindows } from '../../data/restaurantWindows.js'
import { supabase } from '../../data/supabaseClient.js'
import { loadReviewSummary, loadWindowCloudReviews, reviewServerError, submitWindowCloudReview, withdrawWindowCloudReview } from '../../data/restaurantCloudReviews.js'
import { isMemberUserId } from '../../data/memberHallMessages.js'
import { getAvatarUrl } from '../../data/memberProfiles.js'
import { ProfileAvatar } from '../mobile/ProfileAvatar.jsx'
import { useMemberProfiles } from './useMemberProfiles.js'
import './restaurant-real-menu.css'
import './restaurant-review-profiles.css'

function FoodIcon({ type, size = 26 }) {
  const Icon = type === 'noodles' ? Soup : type === 'salad' ? Leaf : type === 'snack' ? Wheat : UtensilsCrossed
  return <Icon size={size} strokeWidth={1.65} aria-hidden="true" />
}

function WindowCardArt({ window }) {
  const [photoFailed, setPhotoFailed] = useState(false)
  const hasPhoto = window.photo && !photoFailed
  return <div className={`restaurant-window-card__art${hasPhoto ? ' restaurant-window-card__art--photo' : ''}`}>
    {hasPhoto ? <><img src={window.photo} alt={`${window.name}现场招牌`} loading="lazy" decoding="async" onError={() => setPhotoFailed(true)} /><span className="restaurant-window-card__photo-badge">实拍<small>{window.floor}</small></span></> : <><span>{window.numberVerified === false ? '实拍' : window.number}<small>{window.numberVerified === false ? window.floor : '号窗口'}</small></span><FoodIcon type={window.icon} size={42} /></>}
    {window.isExample && <i>示例</i>}
  </div>
}

function WindowPhoto({ window, onOpen }) {
  const [photoFailed, setPhotoFailed] = useState(false)
  if (!window.photo || photoFailed) return null
  return <figure className="restaurant-window-photo">
    <button type="button" onClick={onOpen} aria-label={`查看${window.name}完整现场照片`}><img src={window.photo} alt={`${window.name}现场窗口、招牌及菜单`} decoding="async" onError={() => setPhotoFailed(true)} /><span><ZoomIn size={15} />点击查看大图</span></button>
    <figcaption>现场实拍 · 招牌与菜单参考，供应和价格以当天窗口为准</figcaption>
  </figure>
}

function WindowPhotoViewer({ window, onClose }) {
  const [zoomed, setZoomed] = useState(false)
  const [photoFailed, setPhotoFailed] = useState(false)
  const closeRef = useRef(null)
  useEffect(() => {
    const previousFocus = document.activeElement
    closeRef.current?.focus()
    return () => { if (previousFocus?.isConnected) previousFocus.focus?.() }
  }, [])
  return <section className="restaurant-window-photo-viewer" data-window-photo-viewer role="dialog" aria-modal="true" aria-labelledby="restaurant-window-photo-title">
    <header><button type="button" ref={closeRef} onClick={onClose} aria-label="返回窗口详情"><ArrowLeft size={21} /></button><div><h2 id="restaurant-window-photo-title">{window.name}</h2><span>现场实拍</span></div><button type="button" className="restaurant-window-photo-viewer__zoom" disabled={photoFailed} aria-pressed={zoomed} onClick={() => setZoomed((value) => !value)}>{zoomed ? <ZoomOut size={18} /> : <ZoomIn size={18} />}{zoomed ? '适应屏幕' : '放大菜单'}</button></header>
    <div className={`restaurant-window-photo-viewer__image${zoomed ? ' is-zoomed' : ''}`}>
      {photoFailed ? <p role="status"><FoodIcon type={window.icon} size={40} />照片暂时无法加载，请返回窗口详情。</p> : <img src={window.photo} alt={`${window.name}现场窗口完整照片`} onError={() => setPhotoFailed(true)} />}
    </div>
    <p className="restaurant-window-photo-viewer__hint">{zoomed ? '左右滑动查看招牌和菜单' : '可点“放大菜单”查看照片细节'}</p>
  </section>
}

function RatingStars({ rating, size = 12 }) {
  return <span className="restaurant-review-stars" role="img" aria-label={`${rating} 星`}>{[1, 2, 3, 4, 5].map((score) => <span className="restaurant-review-star" key={score} style={{ width: size, height: size }}><Star size={size} aria-hidden="true" /><Star className="restaurant-review-star__fill" size={size} fill="currentColor" style={{ clipPath: `inset(0 ${100 - Math.max(0, Math.min(1, rating - score + 1)) * 100}% 0 0)` }} aria-hidden="true" /></span>)}</span>
}

export function ReviewItem({ review, profile, onDelete, userId, manager, onOpenMemberProfile }) {
  const [helpful, setHelpful] = useState(false)
  const isMember = !review.isExample && review.isCloud && isMemberUserId(review.authorId)
  const memberProfile = isMember && profile?.user_id === review.authorId ? profile : null
  const author = campusDisplayText(memberProfile?.nickname || review.author || '校园同学')
  const avatar = isMember ? <ProfileAvatar src={getAvatarUrl(memberProfile?.avatar_path)} name={author} className="window-review-item__avatar" /> : <span className="window-review-item__avatar" aria-hidden="true">{[...author][0]}</span>
  const date = review.isExample ? '示例评价' : new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(new Date(review.createdAt))
  return (
    <article className="window-review-item">
      <header>
        {isMember && onOpenMemberProfile ? <button type="button" className="window-review-item__profile" aria-label={`查看${author}的主页`} onClick={() => onOpenMemberProfile(review.authorId)}>{avatar}</button> : avatar}
        <div><strong>{author}</strong><span>{date}{!review.isExample && (review.isCloud ? ' · 云端评价' : ' · 本机发布')}</span></div>
        {review.price !== null && <span className="window-review-item__price">¥{review.price}</span>}
      </header>
      <RatingStars rating={review.rating} />
      <p>{campusDisplayText(review.content)}</p>
      {review.tags.length > 0 && <div className="window-review-item__tags">{review.tags.map((tag) => <span key={tag}>{campusDisplayText(tag)}</span>)}</div>}
      <footer>
        <button type="button" className={helpful ? 'is-active' : ''} aria-pressed={helpful} onClick={() => setHelpful((value) => !value)}><ThumbsUp size={13} />{helpful ? '已标为有用（本次）' : '觉得有用'}</button>
        {!review.isExample && (!review.isCloud || review.authorId === userId || manager) && <button type="button" onClick={() => onDelete(review)} aria-label="撤回这条评价"><Trash2 size={13} />撤回</button>}
      </footer>
    </article>
  )
}

export function RestaurantReviewsPage({ restaurant, authorName = '我', role = 'visitor', userId, onOpenLogin, onOpenMemberProfile, onClose, initialWindowId = null }) {
  const [windows, setWindows] = useState(() => getRestaurantWindows(restaurant.id))
  const [catalogState, setCatalogState] = useState('loading')
  const [catalogError, setCatalogError] = useState('')
  const [managerOpen, setManagerOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const isManager = role === 'manager'
  const canManage = isManager && ['ready', 'unseeded'].includes(catalogState)
  const [cloudStats, setCloudStats] = useState([])
  const [cloudReviews, setCloudReviews] = useState([])
  const memberProfiles = useMemberProfiles({ userIds: cloudReviews.filter((review) => !review.isExample && review.isCloud).map((review) => review.authorId), viewerId: userId })
  const [reviewState, setReviewState] = useState('loading')
  const [reviewError, setReviewError] = useState('')
  const [moreReviews, setMoreReviews] = useState(false)
  const [reviewBusy, setReviewBusy] = useState(false)
  const alive = useRef(true)
  const examples = useMemo(() => getExampleWindowReviews(restaurant.id), [restaurant.id])
  const [localReviews, setLocalReviews] = useState(loadLocalRestaurantReviews)
  const [selectedWindowId, setSelectedWindowId] = useState(initialWindowId)
  const [composerWindowId, setComposerWindowId] = useState(null)
  const [photoWindow, setPhotoWindow] = useState(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('全部')
  const [reviewFilter, setReviewFilter] = useState('all')
  const [sort, setSort] = useState('recent')
  const [notice, setNotice] = useState('')
  const reviewScope = useRef('')
  reviewScope.current = `${restaurant.id}:${selectedWindowId ?? 'all'}`
  const pageRef = useRef(null)
  const contentRef = useRef(null)
  const backRef = useRef(null)
  const goBack = () => {
    if (photoWindow) setPhotoWindow(null)
    else if (managerOpen || deleteTarget) {
      if (pageRef.current?.querySelector('[data-review-composer][aria-busy="true"]')) return
      setManagerOpen(false); setDeleteTarget(null)
    } else if (composerWindowId) {
      if (pageRef.current?.querySelector('[data-review-composer] button[aria-label="关闭评价表单"]:disabled')) return
      setComposerWindowId(null)
    } else if (selectedWindowId) setSelectedWindowId(null)
    else onClose()
  }
  useBackLayer(true, goBack, 60)
  const selectedWindow = windows.find((window) => window.id === selectedWindowId) ?? null
  const restaurantLocalReviews = localReviews.filter((review) => review.restaurantId === restaurant.id && windows.some((window) => window.id === review.windowId))
  const allReviews = [...cloudReviews, ...restaurantLocalReviews, ...examples.filter((review) => windows.some((window) => window.isExample && window.id === review.windowId))]
  const cloudReady = reviewState === 'ready' && catalogState === 'ready'
  const summary = cloudReady ? { count: cloudStats.reduce((sum, s) => sum + s.count, 0), rating: cloudStats.length ? (cloudStats.reduce((sum, s) => sum + s.ratingSum, 0) / cloudStats.reduce((sum, s) => sum + s.count, 0)).toFixed(1) : null } : summarizeReviews(allReviews)
  const windowReviews = selectedWindow ? allReviews.filter((review) => review.windowId === selectedWindow.id) : []
  const windowSummary = cloudReady ? cloudStats.find((s) => s.windowId === selectedWindowId) ?? summarizeReviews([]) : summarizeReviews(windowReviews)
  const visibleWindows = windows.filter((window) => (category === '全部' || window.category === category) && `${window.number}号${window.name}${window.category}`.includes(query.trim()))
  const visibleReviews = windowReviews.filter((review) => reviewFilter === 'all' || (reviewFilter === 'recommend' ? review.rating >= 4 : review.rating <= 3))
    .sort((a, b) => (sort === 'high' ? b.rating - a.rating : sort === 'low' ? a.rating - b.rating : 0) || Number(a.isExample) - Number(b.isExample) || Date.parse(b.createdAt) - Date.parse(a.createdAt))

  useEffect(() => {
    let active = true
    loadRestaurantWindows(restaurant.id).then((next) => {
      if (active) { const unseeded = restaurant.id === 'canteen' && !next.length; setWindows(unseeded ? getRestaurantWindows(restaurant.id) : next); setCatalogState(unseeded ? 'unseeded' : 'ready') }
    }).catch((error) => { if (active) { setCatalogState('unavailable'); setCatalogError(error.message) } })
    return () => { active = false }
  }, [restaurant.id])
  const refreshReviews = useCallback(async () => {
    const scope = `${restaurant.id}:${selectedWindowId ?? 'all'}`
    try {
      const [stats, reviews] = await Promise.all([loadReviewSummary(restaurant.id), selectedWindowId ? loadWindowCloudReviews(selectedWindowId) : Promise.resolve([])])
      if (!alive.current || reviewScope.current !== scope) return
      setCloudStats(stats); setCloudReviews(reviews); setMoreReviews(reviews.length === 50); setReviewState('ready'); setReviewError('')
    } catch (error) { if (alive.current && reviewScope.current === scope) { setReviewState('unavailable'); setReviewError(reviewServerError(error)) } }
  }, [restaurant.id, selectedWindowId])
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])
  useEffect(() => {
    let current = true
    setCloudReviews([]); setMoreReviews(false)
    const refresh = () => { if (current) refreshReviews() }
    refresh()
    const timer = setInterval(refresh, 30000)
    const resumed = () => { if (document.visibilityState === 'visible') refresh() }
    const channel = supabase?.channel(`restaurant-reviews:${restaurant.id}:${selectedWindowId ?? 'all'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_reviews', filter: `restaurant_id=eq.${restaurant.id}` }, refresh)
      .subscribe((status) => { if (status === 'SUBSCRIBED') refresh() })
    document.addEventListener('visibilitychange', resumed)
    return () => { current = false; clearInterval(timer); document.removeEventListener('visibilitychange', resumed); if (channel) supabase.removeChannel(channel) }
  }, [refreshReviews, restaurant.id, selectedWindowId])
  useEffect(() => { if (!isManager) { setManagerOpen(false); setDeleteTarget(null) } }, [isManager])

  useEffect(() => {
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    backRef.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      if (previousFocus?.isConnected) previousFocus.focus?.()
    }
  }, [])

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 })
    if (!composerWindowId) backRef.current?.focus()
  }, [selectedWindowId])

  useEffect(() => {
    const handleKey = (event) => {
      if (event.defaultPrevented || document.querySelector('.member-profile-backdrop')) return
      if (event.key === 'Escape') {
        event.preventDefault()
        goBack()
        return
      }
      if (document.querySelector('.mobile-login-backdrop')) return
      if (event.key !== 'Tab') return
      const scope = pageRef.current?.querySelector('[data-window-photo-viewer]') ?? pageRef.current?.querySelector('[data-review-composer]') ?? pageRef.current
      const focusable = [...(scope?.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)') ?? [])]
      const first = focusable[0]
      const last = focusable.at(-1)
      if (!first || !last) return
      if (event.shiftKey && (document.activeElement === first || !scope.contains(document.activeElement))) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (document.activeElement === last || !scope.contains(document.activeElement))) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [composerWindowId, selectedWindowId, managerOpen, deleteTarget, photoWindow, onClose])

  useEffect(() => {
    if (!notice) return undefined
    const timer = setTimeout(() => setNotice(''), 4500)
    return () => clearTimeout(timer)
  }, [notice])

  const selectWindow = (id) => { setSelectedWindowId(id); setReviewFilter('all'); setSort('recent') }
  const submitReview = async (draft) => {
    if (!windows.some((window) => window.id === draft.windowId)) throw new Error('这个窗口已经移除，请重新选择')
    const review = createLocalRestaurantReview({ ...draft, restaurantId: restaurant.id, author: authorName })
    const target = windows.find((window) => window.id === draft.windowId)
    if (cloudReady && target?.cloudStored) {
      if (!userId) { onOpenLogin(); throw new Error('请先登录，再公开发布评价') }
      try { await submitWindowCloudReview({ ...review, clientId: draft.clientId }); await refreshReviews() }
      catch (error) { throw new Error(reviewServerError(error)) }
      if (!alive.current) return
      selectWindow(draft.windowId); setComposerWindowId(null); setNotice('评价已保存到云端，其他同学可以查看'); return
    }
    const next = [review, ...localReviews]
    saveLocalRestaurantReviews(next)
    setLocalReviews(next)
    selectWindow(draft.windowId)
    setComposerWindowId(null)
    setNotice('评价已保存到本机')
  }
  const deleteReview = async (review) => {
    if (reviewBusy) return
    setReviewBusy(true)
    try {
      if (review.isCloud) { await withdrawWindowCloudReview(review.id); await refreshReviews(); setNotice('云端评价已撤回'); return }
      const next = localReviews.filter((entry) => entry.id !== review.id)
      saveLocalRestaurantReviews(next)
      setLocalReviews(next)
      setNotice('本机评价已删除')
    } catch (error) { setNotice(reviewServerError(error)) }
    finally { setReviewBusy(false) }
  }
  const loadMoreReviews = async () => {
    if (reviewBusy || !moreReviews) return
    setReviewBusy(true)
    const target = selectedWindowId
    try { const rows = await loadWindowCloudReviews(target, cloudReviews.at(-1)); if (alive.current && reviewScope.current === `${restaurant.id}:${target}`) { setCloudReviews((current) => [...current, ...rows.filter((r) => !current.some((old) => old.id === r.id))]); setMoreReviews(rows.length === 50) } }
    catch (error) { setNotice(reviewServerError(error)) }
    finally { setReviewBusy(false) }
  }
  const submitWindow = async (draft) => {
    if (!canManage) throw new Error('请使用管理员账号，并确认窗口管理已开通')
    if (deleteTarget) {
      await deleteRestaurantWindow(restaurant.id, deleteTarget.id)
      setWindows((current) => current.filter((window) => window.id !== deleteTarget.id))
      if (selectedWindowId === deleteTarget.id) setSelectedWindowId(null)
      setDeleteTarget(null); setNotice('窗口已从服务器删除')
    } else {
      const added = await addRestaurantWindow(restaurant.id, draft)
      setWindows((current) => [...current, added].sort((a, b) => a.number.localeCompare(b.number, 'zh-CN', { numeric: true })))
      setManagerOpen(false); setQuery(''); setCategory('全部'); setNotice('窗口已添加，其他手机重新打开即可看到')
    }
  }

  return createPortal(
    <section className="restaurant-review-page" ref={pageRef} role="dialog" aria-modal="true" aria-labelledby="restaurant-review-page-title">
      <div className="restaurant-review-page__frame">
        <header className="restaurant-review-page__header">
          <button type="button" ref={backRef} onClick={goBack} aria-label={selectedWindow ? '返回窗口列表' : '返回上一页'}><ArrowLeft size={21} /></button>
          <div><h1 id="restaurant-review-page-title">{selectedWindow ? '窗口详情' : '餐厅评价'}</h1><span>{restaurant.name}</span></div>
          <span className="restaurant-review-page__preview">{isManager ? '管理员' : '校园食记'}</span>
        </header>

        <main className="restaurant-review-page__content" ref={contentRef}>
          {!selectedWindow ? <>
            <section className="restaurant-review-hero">
              <span className="restaurant-review-hero__eyebrow">校园食记 / WINDOW GUIDE</span>
              <h2>{restaurant.name}</h2><p>挑个窗口，看看同学怎么说。</p>
              <div className="restaurant-review-hero__art" aria-hidden="true"><Soup size={56} strokeWidth={1.35} /><span>一餐一评</span></div>
              <div className="restaurant-review-hero__stats">
                <div><strong>{summary.rating ?? '—'}<Star size={14} fill="currentColor" /></strong><span>{cloudReady ? '真实平均评分' : '暂无云端评分'}</span></div>
                <div><strong>{windows.length}<small> 个</small></strong><span>餐厅窗口</span></div>
                <div><strong>{cloudReady ? summary.count : restaurantLocalReviews.length}<small> 条</small></strong><span>{cloudReady ? '云端评价' : '本机评价'}</span></div>
              </div>
            </section>
            <p className="restaurant-review-page__demo-note"><span />{catalogState === 'loading' ? '正在加载餐厅窗口…' : catalogState === 'ready' ? (cloudReady ? '真实窗口与云端评价。现场标价仅作参考，以当日菜单为准。' : '窗口名单已加载；多人评价等待服务器部署。') : restaurant.id === 'canteen' ? `这 6 个窗口位于${campusDisplayText('谷园')}一层，来自你提供的现场照片；现场编号待确认。服务器导入后可同步公开评价。` : '暂时展示示例窗口，真实窗口名单尚未加载。'}</p>
            {reviewError && <p className="restaurant-review-page__demo-note" role="status">{reviewError}<button type="button" onClick={refreshReviews}>重试</button></p>}
            {isManager && <div className="restaurant-window-admin"><div><strong>窗口管理</strong><small>{catalogState === 'ready' ? '按真实名单添加窗口' : catalogError || '正在连接服务器…'}</small></div><button type="button" disabled={!canManage} onClick={() => setManagerOpen(true)}>＋ 添加窗口</button></div>}
            <div className="restaurant-window-search"><Search size={17} /><input aria-label="搜索餐厅窗口" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜窗口编号、面食、米饭…" />{query && <button type="button" aria-label="清空窗口搜索" onClick={() => setQuery('')}><X size={15} /></button>}</div>
            <div className="restaurant-window-categories" role="group" aria-label="窗口分类">{WINDOW_CATEGORIES.map((item) => <button key={item} type="button" className={category === item ? 'is-active' : ''} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}</div>
            <div className="restaurant-review-section-heading"><h3>逛逛窗口</h3><span>{visibleWindows.length} 个选择</span></div>
            <div className="restaurant-window-grid">
              {visibleWindows.map((window) => {
                const windowReviews = allReviews.filter((review) => review.windowId === window.id)
                const stats = cloudReady ? cloudStats.find((s) => s.windowId === window.id) ?? summarizeReviews([]) : summarizeReviews(windowReviews)
                return <button type="button" key={window.id} className={`restaurant-window-card restaurant-window-card--${window.tone}`} onClick={() => selectWindow(window.id)}>
                  <WindowCardArt key={window.photo || window.id} window={window} />
                  <div className="restaurant-window-card__body"><h4>{window.name}<ArrowUpRight size={15} /></h4><div className="restaurant-window-card__rating"><Star size={12} fill="currentColor" /><strong>{stats.rating ?? '—'}</strong><span>{stats.count} 条评价</span></div><p>{window.dish}</p><div className="restaurant-window-card__bottom"><span>{window.category}</span><span>{stats.price !== null ? `${window.isExample ? '参考样例' : '人均'} ¥${stats.price}` : window.menu?.length ? `菜单 ¥${Math.min(...window.menu.map(([, price]) => price))}起` : '暂无价格'}</span></div></div>
                </button>
              })}
            </div>
            {!visibleWindows.length && <div className="restaurant-reviews-empty"><Search size={27} /><strong>{windows.length ? '没有找到这个窗口' : '还没有收录窗口'}</strong><p>{windows.length ? '试试窗口编号或其他分类。' : isManager ? '点击上方“添加窗口”，录入真实名单。' : '管理员收录真实窗口后，就可以查看和评价了。'}</p>{windows.length > 0 && <button type="button" onClick={() => { setQuery(''); setCategory('全部') }}>查看全部窗口</button>}</div>}
            <p className="restaurant-review-page__bottom-note">窗口按餐厅分别收录。</p>
          </> : <>
            <section className={`restaurant-window-intro restaurant-window-intro--${selectedWindow.tone}`}><div className="restaurant-window-intro__icon"><FoodIcon type={selectedWindow.icon} size={34} /></div><div><span>{selectedWindow.numberVerified === false ? `现场窗口 · ${selectedWindow.floor}` : `${selectedWindow.number} 号窗口`}{selectedWindow.isExample && ' · 示例'}</span><h2>{selectedWindow.name}</h2><p>{selectedWindow.description}</p></div></section>
            <WindowPhoto key={selectedWindow.photo || selectedWindow.id} window={selectedWindow} onOpen={() => setPhotoWindow(selectedWindow)} />
            {selectedWindow.menu?.length > 0 && <section className="restaurant-real-menu"><div><h3>现场菜单参考</h3><small>按你提供的照片录入 · 价格以现场为准</small></div>{selectedWindow.menu.map(([name, price]) => <p key={name}><span>{name}</span><strong>¥{price}</strong></p>)}</section>}
            {canManage && selectedWindow.cloudStored && <button className="restaurant-window-delete" type="button" onClick={() => setDeleteTarget(selectedWindow)}><Trash2 size={15} />删除这个窗口</button>}
            <section className="restaurant-window-score"><div><strong>{windowSummary.rating ?? '—'}</strong><RatingStars rating={Number(windowSummary.rating ?? 0)} size={14} /><span>{windowSummary.count} 条评价</span></div><div className="restaurant-window-score__details"><span><b>{windowSummary.count ? `${windowSummary.recommended}%` : '—'}</b> 推荐评价占比</span><div><i style={{ width: `${windowSummary.recommended}%` }} /></div><small>{cloudReady ? '统计包含该窗口全部云端评价，本机历史不计入' : selectedWindow.isExample ? '统计包含示例内容，仅用于体验页面' : '统计仅包含当前设备保存的评价'}</small></div></section>
            <p className="restaurant-review-page__demo-note"><span />{cloudReady ? '公开评价按真实评分统计；可以推荐，也可以吐槽。' : selectedWindow.isExample ? '示例评价不代表真实口碑；本机发布仅当前设备可见。' : '多人评价待服务器部署，本机评价仅当前设备可见。'}</p>
            <div className="restaurant-review-section-heading"><h3>同学怎么说</h3><select aria-label="评价排序" value={sort} onChange={(event) => setSort(event.target.value)}><option value="recent">最新评价</option><option value="high">评分从高到低</option><option value="low">评分从低到高</option></select></div>
            <div className="restaurant-review-filters" role="group" aria-label="评价筛选">{[{ id: 'all', label: '全部' }, { id: 'recommend', label: '推荐 · 4–5 星' }, { id: 'complaint', label: '吐槽 · 1–3 星' }].map((filter) => <button type="button" key={filter.id} className={reviewFilter === filter.id ? 'is-active' : ''} aria-pressed={reviewFilter === filter.id} onClick={() => setReviewFilter(filter.id)}>{filter.label}</button>)}</div>
            <div className="window-review-list">{memberProfiles.error && <p className="restaurant-review-profile-error" role="alert"><span>{memberProfiles.error}</span><button type="button" onClick={memberProfiles.refresh}>重试</button></p>}{visibleReviews.map((review) => <ReviewItem key={review.id} review={review} profile={memberProfiles.profiles[review.authorId]} onDelete={deleteReview} userId={userId} manager={isManager} onOpenMemberProfile={onOpenMemberProfile} />)}</div>
            {moreReviews && <button className="restaurant-review-more" disabled={reviewBusy} type="button" onClick={loadMoreReviews}>{reviewBusy ? '加载中…' : '加载更多评价'}</button>}
            {!visibleReviews.length && <div className="restaurant-reviews-empty"><MessageSquare size={28} /><strong>这里还没有这类评价</strong><p>吃过这个窗口？写下你的感受吧。</p></div>}
          </>}
        </main>

        <footer className="restaurant-review-page__footer"><span>{selectedWindow ? selectedWindow.name : '好吃的推荐，真实的感受'}<small>{cloudReady ? '登录后发布真实评价' : '目前可保存本机评价'}</small></span><button type="button" disabled={!windows.length || catalogState === 'loading'} onClick={() => { if (cloudReady && !userId) onOpenLogin(); else setComposerWindowId(selectedWindow?.id ?? windows[0]?.id) }}><PenLine size={17} />写评价<ChevronRight size={15} /></button></footer>
        {notice && <p className="restaurant-review-page__notice" role="status">{notice}</p>}
        {composerWindowId && <ReviewComposer restaurant={restaurant} windows={windows} initialWindowId={composerWindowId} onClose={() => setComposerWindowId(null)} onSubmit={submitReview} cloud={cloudReady} />}
        {(managerOpen || deleteTarget) && isManager && <RestaurantWindowManager restaurant={restaurant} deletingWindow={deleteTarget} onClose={() => { setManagerOpen(false); setDeleteTarget(null) }} onSubmit={submitWindow} />}
        {photoWindow && <WindowPhotoViewer key={photoWindow.id} window={photoWindow} onClose={() => setPhotoWindow(null)} />}
      </div>
    </section>, document.body,
  )
}
import { useBackLayer } from '../../app/useBackLayer.js'
