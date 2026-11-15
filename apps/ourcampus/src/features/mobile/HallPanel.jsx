import { campusDisplayText } from '../../data/campusPresentation.js'
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ChevronRight, Flame, LogIn, MapPin, MessageCircle, PackageSearch, Palette, Plus, Send, UtensilsCrossed } from 'lucide-react'
import { describeServerError } from '../../data/supabaseClient.js'
import { CAMPUS_HALL_REGIONS } from '../../data/campusHall.js'
import { CampusHotspotsPanel } from './CampusHotspotsPanel.jsx'
import { LostFoundPanel } from './LostFoundPanel.jsx'
import { RestaurantHallSection } from './RestaurantHallSection.jsx'
import { DrawGamePanel } from '../game/DrawGamePanel.jsx'
import { PostImagePicker } from './PostImagePicker.jsx'
import { PostImageGallery } from './PostImageGallery.jsx'
import { usePostImageDraft } from './usePostImageDraft.js'
import { ProfileAvatar } from './ProfileAvatar.jsx'
import './community-canvas.css'

const COMPOSER_REGIONS = CAMPUS_HALL_REGIONS.filter((region) => region.id !== 'all')
const REGION_LABELS = new Map(COMPOSER_REGIONS.map((region) => [region.id, region.label]))
const DEMO_HOTSPOT_IDS = new Set(['event-library-lecture', 'event-canteen-crowd', 'event-sports-training'])
const SECTION_TITLES = { chat: '地区聊天', hotspots: '校园动态', 'lost-found': '失物招领', restaurants: '餐厅评价', draw: '你画我猜' }
const SECTION_DESCRIPTIONS = { hotspots: '查看校园最新动态', 'lost-found': '查看寻物与招领信息', restaurants: '查看餐厅、窗口与同学评价', draw: '一个人画，其他人猜' }

export function HallPanel({ messages, selectedRegionId, onRegionChange, onSendMessage, activeSection, onSectionChange, isFullscreen = false, onCloseSection, initialMessageId = null, locations, hotspots, posts, lostFoundFilter, onLostFoundFilterChange, onSubmitPost, onPostStatusChange, onDeletePost, onSelectLocation, onPlanRouteToLocation, onOpenRestaurantReviews, showLostFound, onLostFoundMapChange, auth, chat, onOpenLogin, information, onPublishInformation, onSubmitAsInformation, onStartLostFound, lostFoundPublishToken = 0, onAskAi, headerActions, onOpenMemberProfile }) {
  const [draft, setDraft] = useState('')
  const photos = usePostImageDraft(auth.user?.id)
  const [allComposerRegionId, setAllComposerRegionId] = useState('')
  const composerRegionId = REGION_LABELS.has(selectedRegionId) ? selectedRegionId : allComposerRegionId
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [retractingId, setRetractingId] = useState(null)
  const [publishMenu, setPublishMenu] = useState(false)
  useBackLayer(publishMenu, () => setPublishMenu(false), 25)
  const feedRef = useRef(null)
  const messageRefs = useRef(new Map())
  const locatedTargetScope = useRef(null)
  const olderAnchor = useRef(null)
  const readingPositions = useRef(new Map())
  const backRef = useRef(null)
  const expandedRef = useRef(false)
  const previousLastMessageId = useRef(null)
  const followingLatest = useRef(true)
  const [visibleViewport, setVisibleViewport] = useState(null)
  const shouldScrollToNewMessage = useRef(false)
  const loadedScope = useRef(null)
  const currentUserId = useRef(auth.user?.id)
  currentUserId.current = auth.user?.id

  useEffect(() => { setAllComposerRegionId('') }, [selectedRegionId, auth.user?.id])

  useEffect(() => {
    if (!publishMenu) return undefined
    const dismiss = (event) => { if (event.key === 'Escape' || (event.type === 'pointerdown' && !event.target.closest('.hall-publish'))) setPublishMenu(false) }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', dismiss)
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', dismiss) }
  }, [publishMenu])

  useEffect(() => { setDraft(''); setSendError(''); setSending(false); shouldScrollToNewMessage.current = false }, [auth.user?.id])

  useEffect(() => {
    if (!isFullscreen) { setVisibleViewport(null); return undefined }
    backRef.current?.focus({ preventScroll: true })
    const viewport = window.visualViewport
    const syncViewport = () => setVisibleViewport({ height: viewport?.height ?? window.innerHeight, top: viewport?.offsetTop ?? 0 })
    syncViewport()
    viewport?.addEventListener('resize', syncViewport)
    viewport?.addEventListener('scroll', syncViewport)
    window.addEventListener('resize', syncViewport)
    return () => {
      viewport?.removeEventListener('resize', syncViewport)
      viewport?.removeEventListener('scroll', syncViewport)
      window.removeEventListener('resize', syncViewport)
    }
  }, [isFullscreen])

  useEffect(() => {
    const scope = `${auth.user?.id}:${selectedRegionId}`
    const targetScope = initialMessageId ? `${scope}:${initialMessageId}` : null
    if (!targetScope) locatedTargetScope.current = null
    const target = initialMessageId && messages.find((message) => message.id === initialMessageId)
    const initialHistory = chat.historyStatus === 'ready' && loadedScope.current !== scope
    const justExpanded = isFullscreen && !expandedRef.current
    const lastId = messages.at(-1)?.id ?? null
    const newLastMessage = lastId !== previousLastMessageId.current
    if (activeSection === 'chat' && targetScope && target && locatedTargetScope.current !== targetScope) {
      messageRefs.current.get(initialMessageId)?.scrollIntoView?.({ block: 'center', behavior: 'auto' })
      locatedTargetScope.current = targetScope
      followingLatest.current = false
      olderAnchor.current = null
    } else if (activeSection === 'chat' && olderAnchor.current && feedRef.current) {
      const anchor = olderAnchor.current
      if (messages[0]?.id !== anchor.firstId) feedRef.current.scrollTop = anchor.top + feedRef.current.scrollHeight - anchor.height
      olderAnchor.current = null
    } else if (activeSection === 'chat' && !targetScope && (initialHistory || justExpanded || shouldScrollToNewMessage.current || (newLastMessage && followingLatest.current)) && messages.length > 0) {
      const savedPosition = readingPositions.current.get(scope)
      if ((initialHistory || justExpanded) && savedPosition !== undefined && feedRef.current) feedRef.current.scrollTop = savedPosition
      else feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: initialHistory || justExpanded ? 'auto' : 'smooth' })
      shouldScrollToNewMessage.current = false
    }
    expandedRef.current = isFullscreen
    previousLastMessageId.current = lastId
    if (activeSection === 'chat' && chat.historyStatus === 'ready') loadedScope.current = scope
  }, [messages, auth.user?.id, selectedRegionId, initialMessageId, chat.historyStatus, activeSection, isFullscreen])

  useEffect(() => {
    if (!isFullscreen || activeSection !== 'chat' || initialMessageId || !followingLatest.current) return undefined
    const frame = requestAnimationFrame(() => {
      const feed = feedRef.current
      if (feed) feed.scrollTo({ top: feed.scrollHeight })
    })
    return () => cancelAnimationFrame(frame)
  }, [visibleViewport, activeSection, isFullscreen, initialMessageId])

  const loadOlder = async () => {
    const feed = feedRef.current
    if (feed) olderAnchor.current = { top: feed.scrollTop, height: feed.scrollHeight, firstId: messages[0]?.id }
    try { await chat.loadOlder() }
    catch { olderAnchor.current = null; setSendError('更早消息未能加载，请重试。') }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const content = draft.trim()
    if ((!content && !photos.items.length) || sending || photos.busy) return
    if (!auth.user) { onOpenLogin(); return }
    if (!REGION_LABELS.has(composerRegionId)) { setSendError('请先选择消息发送地区。'); return }
    setSending(true)
    const senderId = auth.user.id
    setSendError('')
    try {
      const imagePaths = await photos.upload()
      if (currentUserId.current !== senderId) throw new Error('账号已变化，请重新发布')
      await onSendMessage({ content, regionId: composerRegionId, imagePaths })
      if (currentUserId.current !== senderId) return
      shouldScrollToNewMessage.current = true
      if (selectedRegionId !== 'all' && selectedRegionId !== composerRegionId) onRegionChange(composerRegionId)
      setDraft(''); photos.reset()
      feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' })
    } catch (error) { if (currentUserId.current === senderId) setSendError(describeServerError(error, '发送未成功，草稿已保留，请重试')) }
    finally { if (currentUserId.current === senderId) setSending(false) }
  }
  const retract = async (id) => {
    if (retractingId) return
    setRetractingId(id)
    setSendError('')
    try { await chat.retractMessage(id) }
    catch (error) { setSendError(describeServerError(error, '撤回未成功，请重试')) }
    finally { setRetractingId(null) }
  }
  const chatLabel = !auth.user ? (auth.status === 'loading' ? '正在恢复登录…' : '登录后，与同学一起聊校园')
    : chat.connectionStatus === 'live' ? '实时聊天已连接'
    : chat.connectionStatus === 'offline' ? '当前离线，联网后会重新同步'
    : chat.connectionStatus === 'reconnecting' ? '实时连接重试中，消息仍会定时同步'
    : '正在连接校园社区…'
  const actualHotspots = hotspots.filter((event) => !event.isDemo && !DEMO_HOTSPOT_IDS.has(event.id))
  const recentHotspots = [...actualHotspots.filter((event) => event.isCloud)]
    .sort((left, right) => (Date.parse(right.startAt) || 0) - (Date.parse(left.startAt) || 0))
    .slice(0, 4)
  const localHotspots = actualHotspots.filter((event) => !event.isCloud).slice(0, 3)
  const recentLostFound = posts.filter((post) => !post.isDemo && post.status === 'active').slice(0, 3)
  const targetLoaded = initialMessageId && messages.some((message) => message.id === initialMessageId)
  const targetStatus = initialMessageId && !targetLoaded
    ? chat.historyStatus === 'loading' ? '正在载入原消息所在的聊天记录…'
      : chat.hasMore ? '原消息尚未载入，可查看更早消息继续查找。'
        : '当前历史中未找到原消息，可能已撤回或暂不可查看。'
    : null

  const renderEntry = (event, local = false) => <article className={`hall-canvas-entry${event.imagePaths?.length ? ' is-image' : ''}`} key={event.id}>
    <div className="hall-canvas-entry__copy"><span className="hall-canvas-entry__kind">{event.type === 'activity' ? '活动' : '校园动态'}</span>
      <button className="hall-canvas-entry__title" type="button" onClick={() => onSectionChange('hotspots')}>{campusDisplayText(event.title)}</button>
      {event.impact && <p className="hall-canvas-entry__description">{campusDisplayText(event.impact)}</p>}
      <p className="hall-canvas-entry__meta"><MapPin size={12} aria-hidden="true" />{locations.find((location) => location.id === event.locationId)?.name ?? '地点未指定'}<span>{local ? '本机发布 · 仅此设备' : '已审核发布'}</span></p>
    </div>
    <PostImageGallery paths={event.imagePaths} viewerId={auth.user?.id} label="校园动态照片" />
  </article>

  return (
    <section className={`mobile-page-panel mobile-page-panel--hall canvas-community${isFullscreen ? ' mobile-page-panel--hall-fullscreen' : ''}`} data-community-view={isFullscreen ? activeSection : 'home'} data-compact-viewport={isFullscreen && visibleViewport?.height < 560 ? 'true' : undefined} style={isFullscreen && visibleViewport ? { height: visibleViewport.height, top: visibleViewport.top } : undefined} aria-label={isFullscreen ? SECTION_TITLES[activeSection] : '校园社区'}>
      {isFullscreen ? <header className="hall-fullscreen-heading">
        <button type="button" ref={backRef} onClick={() => { if (onCloseSection) onCloseSection(); else requestAppBack() }} aria-label="返回上一页"><ArrowLeft size={21} aria-hidden="true" /></button>
        <div><h2>{SECTION_TITLES[activeSection]}</h2><p>{activeSection === 'chat' && <span className={`hall-connection-dot${chat.connectionStatus === 'live' ? ' is-live' : ''}`} aria-hidden="true" />}{activeSection === 'chat' ? chatLabel : SECTION_DESCRIPTIONS[activeSection]}</p></div>
      </header> : <>
      <header className="hall-canvas-heading"><div><h2>社区</h2></div>
        <div className="hall-publish"><button className="hall-publish-toggle" type="button" aria-expanded={publishMenu} aria-controls="hall-publish-menu" onClick={() => setPublishMenu((value) => !value)}><Plus size={17} />发布</button>
          {publishMenu && <div className="hall-publish-menu" id="hall-publish-menu"><button type="button" onClick={() => { setPublishMenu(false); onPublishInformation() }}><Flame size={17} />校园动态</button><button type="button" onClick={() => { setPublishMenu(false); onStartLostFound() }}><PackageSearch size={17} />失物信息</button><button type="button" onClick={() => { setPublishMenu(false); onSectionChange('restaurants') }}><UtensilsCrossed size={17} />餐厅评价</button></div>}
        </div>
        {headerActions}
      </header>
      <div className="hall-home-content hall-canvas-home">
        <div className="hall-canvas-section-heading"><h3>校园近况</h3><button type="button" onClick={() => onSectionChange('hotspots')}>全部动态 <ChevronRight size={14} /></button></div>
        <div className="hall-canvas-feed">{recentHotspots.map((event) => renderEntry(event))}{!recentHotspots.length && <div className="hall-canvas-empty"><p>{information.status === 'loading' ? '正在载入校园动态…' : information.status === 'error' ? '校园动态暂未加载成功，请到全部动态重试。' : '暂时没有已审核的校园动态。'}</p><button type="button" onClick={onPublishInformation}>发布校园信息</button></div>}</div>
        {localHotspots.length > 0 && <section className="hall-local-content" aria-label="本机发布"><div className="hall-canvas-section-heading"><h3>本机发布</h3><small>仅此设备</small></div><div className="hall-canvas-feed">{localHotspots.map((event) => renderEntry(event, true))}</div></section>}
        {recentLostFound.length > 0 && <section className="hall-lost-preview"><div className="hall-canvas-section-heading"><h3>寻物与招领</h3><button type="button" onClick={() => onSectionChange('lost-found')}>全部失物 <ChevronRight size={14} /></button></div>{recentLostFound.map((post) => <button className="hall-lost-preview__row" type="button" key={post.id} onClick={() => onSectionChange('lost-found')}><span>{post.type === 'found' ? '招领' : '寻物'}</span><strong>{campusDisplayText(post.title)}</strong><small>{post.isCloud || post.cloudReportId ? '云端' : '本机'}</small><ChevronRight size={15} /></button>)}</section>}
        <nav className="hall-canvas-index" aria-label="社区功能">
          {[{ id: 'chat', label: '地区聊天', Icon: MessageCircle }, { id: 'draw', label: '你画我猜', Icon: Palette }, { id: 'lost-found', label: '失物招领', Icon: PackageSearch }, { id: 'hotspots', label: '校园动态 / 活动', Icon: Flame }, { id: 'restaurants', label: '餐厅评价', Icon: UtensilsCrossed }].map(({ id, label, Icon }) => <button type="button" key={id} onClick={() => onSectionChange(id)}><Icon size={19} strokeWidth={1.7} aria-hidden="true" /><span>{label}</span><ChevronRight size={14} aria-hidden="true" /></button>)}
        </nav>
      </div>
      </>}

      {isFullscreen && <>
      {activeSection !== 'restaurants' && <div className="mobile-hall-regions" role="group" aria-label="按校园区域筛选社区内容">
        {CAMPUS_HALL_REGIONS.map((region) => (
          <button
            className={`mobile-hall-region${selectedRegionId === region.id ? ' is-active' : ''}`}
            type="button"
            key={region.id}
            aria-pressed={selectedRegionId === region.id}
            onClick={() => onRegionChange(region.id)}
          >
            {region.label}
          </button>
        ))}
      </div>}

      <div className="community-scroll" hidden={activeSection !== 'hotspots'}>
        <CampusHotspotsPanel events={actualHotspots} locations={locations} regionId={selectedRegionId} onSelectLocation={onSelectLocation} onPlanRouteToLocation={onPlanRouteToLocation} onPublishInformation={onPublishInformation} onAskAi={onAskAi} viewerId={auth.user?.id} />
      </div>
      <div className="community-scroll" hidden={activeSection !== 'lost-found'}>
        <LostFoundPanel posts={posts} locations={locations} regionId={selectedRegionId} filter={lostFoundFilter} onFilterChange={onLostFoundFilterChange} onRegionChange={onRegionChange} onSubmitPost={onSubmitPost} onStatusChange={onPostStatusChange} onDeletePost={onDeletePost} onSelectLocation={onSelectLocation} onPlanRouteToLocation={onPlanRouteToLocation} showMapMarkers={showLostFound} onMapMarkersChange={onLostFoundMapChange} currentUserId={auth.user?.id} cloudReady={information.status === 'ready'} publishToken={lostFoundPublishToken} />
      </div>
      {activeSection === 'restaurants' && <div className="community-scroll"><RestaurantHallSection locations={locations} onOpenReviews={onOpenRestaurantReviews} /></div>}
      {activeSection === 'draw' && <div className="community-scroll"><DrawGamePanel regionId={selectedRegionId} regionLabel={selectedRegionId === 'all' ? '全部地区' : (REGION_LABELS.get(selectedRegionId) ?? '校园')} auth={auth} onOpenLogin={onOpenLogin} /></div>}

      {activeSection === 'chat' && <>
      <section className="mobile-hall-feed" ref={feedRef} onScroll={(event) => { const feed = event.currentTarget; readingPositions.current.set(`${auth.user?.id}:${selectedRegionId}`, feed.scrollTop); followingLatest.current = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 64 }} aria-label="校园聊天消息">
        <div className="mobile-panel-section__heading mobile-hall-feed__heading">
          <h3>{selectedRegionId === 'all' ? '全部消息' : REGION_LABELS.get(selectedRegionId)}</h3>
          <span>{auth.user ? `${messages.length} 条消息` : '登录后可见'}</span>
        </div>
        {!auth.user ? <div className="mobile-hall-login-gate"><MessageCircle size={32} /><h3>认识校园里的新朋友</h3><p>登录后查看历史消息，按地区参与聊天。</p><button type="button" disabled={auth.status === 'loading'} onClick={onOpenLogin}><LogIn size={16} /> 登录 / 注册</button></div>
        : <>
        {chat.error && <div className="mobile-chat-error" role="alert"><span>{chat.error}</span><button type="button" onClick={chat.retry}>重试</button></div>}
        {targetStatus && <p className="hall-message-target-status" role="status">{targetStatus}</p>}
        {chat.hasMore && <button className="mobile-chat-load-more" type="button" disabled={chat.loadingOlder} onClick={loadOlder}>{chat.loadingOlder ? '加载中…' : '查看更早消息'}</button>}
        {messages.length > 0 ? (
          <ol className="mobile-hall-messages" aria-live="polite">
            {messages.map((message) => (
              <li
                className={`mobile-hall-message${message.authorId === auth.user.id ? ' is-own' : ''}${message.imagePaths?.length ? ' has-attachments' : ''}${message.id === initialMessageId ? ' is-target' : ''}`}
                data-message-id={message.id}
                aria-current={message.id === initialMessageId ? true : undefined}
                ref={(node) => { if (node) messageRefs.current.set(message.id, node); else messageRefs.current.delete(message.id) }}
                key={message.id}
              >
                <article>
                  <header className="mobile-hall-message__header">
                    <button className="mobile-hall-message__profile" type="button" aria-label={`查看${campusDisplayText(message.author)}的主页`} onClick={() => onOpenMemberProfile?.(message.authorId)}><ProfileAvatar src={message.authorAvatarUrl} name={campusDisplayText(message.author)} /></button>
                    <button className="mobile-hall-message__author" type="button" onClick={() => onOpenMemberProfile?.(message.authorId)}><strong>{campusDisplayText(message.author)}</strong></button>
                    <span className="mobile-hall-message__region">{REGION_LABELS.get(message.regionId) ?? '校园'}</span>
                    <time dateTime={message.createdAt}>{message.time}</time>
                  </header>
                  <p>{campusDisplayText(message.content)}</p>
                  <PostImageGallery paths={message.imagePaths} viewerId={auth.user.id} label="聊天照片" />
                  {message.authorId === auth.user.id && <button className="mobile-chat-report" type="button" onClick={() => onSubmitAsInformation(message)}>提交为动态</button>}
                  {message.authorId === auth.user.id && <button className="mobile-chat-retract" type="button" disabled={Boolean(retractingId)} onClick={() => retract(message.id)}>{retractingId === message.id ? '撤回中…' : '撤回'}</button>}
                </article>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mobile-panel-empty" role="status">{chat.historyStatus === 'loading' ? '正在加载历史消息…' : chat.historyStatus === 'error' ? '历史消息未能加载，请重试。' : '这个区域暂时还没有消息，发一条开启聊天吧。'}</p>
        )}
        </>}
      </section>

      <form className="mobile-hall-composer" onSubmit={handleSubmit}>
        <div className="mobile-hall-composer__destination"><label htmlFor="mobile-hall-region">发送到</label><select id="mobile-hall-region" aria-label="消息所属区域" value={composerRegionId} disabled={sending || !auth.user || selectedRegionId !== 'all'} onChange={(event) => { setAllComposerRegionId(event.target.value); setSendError('') }}>
          <option value="">选择发送地区</option>{COMPOSER_REGIONS.map((region) => <option value={region.id} key={region.id}>{region.label}</option>)}
        </select></div>
        <div className="mobile-hall-composer__row">
        <label className="sr-only" htmlFor="mobile-hall-message">输入消息</label>
        <input
          id="mobile-hall-message"
          type="text"
          maxLength={200}
          placeholder={auth.user ? '说点什么…' : '登录后即可发消息'}
          value={draft}
          disabled={!auth.user || sending}
          onChange={(event) => { setDraft(event.target.value); setSendError('') }}
        />
        <PostImagePicker draft={photos} disabled={!auth.user || sending} label="添加聊天照片" />
          <button className="mobile-hall-composer__send" type="submit" aria-label={sending ? '正在发送消息' : '发送消息'} disabled={!auth.user || !composerRegionId || (!draft.trim() && !photos.items.length) || photos.busy || sending || chat.connectionStatus === 'offline'}>
            <Send size={19} aria-hidden="true" /><span className="sr-only">{sending ? '发送中…' : '发送'}</span>
          </button>
        </div>
        {sendError && <p className="mobile-chat-send-error" role="alert">{sendError}</p>}
      </form>
      </>}
      </>}
    </section>
  )
}
import { requestAppBack, useBackLayer } from '../../app/useBackLayer.js'
