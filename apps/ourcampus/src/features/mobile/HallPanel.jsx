import { campusDisplayText } from '../../data/campusPresentation.js'
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ChevronRight, Flame, LogIn, MapPin, MessageCircle, PackageSearch, Plus, Send, UtensilsCrossed } from 'lucide-react'
import { describeServerError } from '../../data/supabaseClient.js'
import { CAMPUS_HALL_REGIONS } from '../../data/campusHall.js'
import { CampusHotspotsPanel } from './CampusHotspotsPanel.jsx'
import { LostFoundPanel } from './LostFoundPanel.jsx'
import { RestaurantHallSection } from './RestaurantHallSection.jsx'
import { CampusSticker } from './CampusSticker.jsx'
import { PostImagePicker } from './PostImagePicker.jsx'
import { PostImageGallery } from './PostImageGallery.jsx'
import { usePostImageDraft } from './usePostImageDraft.js'
import { ProfileAvatar } from './ProfileAvatar.jsx'
import { DEFAULT_PERSONAL_ARTWORK } from '../../data/personalHome.js'

const COMPOSER_REGIONS = CAMPUS_HALL_REGIONS.filter((region) => region.id !== 'all')
const REGION_LABELS = new Map(COMPOSER_REGIONS.map((region) => [region.id, region.label]))
const SECTION_TITLES = { chat: '校园聊天', hotspots: '校园热点', 'lost-found': '失物招领', restaurants: '餐厅评价' }
const SECTION_DESCRIPTIONS = { hotspots: '查看校园最新动态', 'lost-found': '查看寻物与招领信息', restaurants: '查看餐厅、窗口与同学评价' }

export function HallPanel({ messages, selectedRegionId, onRegionChange, onSendMessage, activeSection, onSectionChange, isFullscreen = false, onCloseSection, locations, hotspots, posts, lostFoundFilter, onLostFoundFilterChange, onSubmitPost, onPostStatusChange, onDeletePost, onSelectLocation, onPlanRouteToLocation, onOpenRestaurantReviews, showLostFound, onLostFoundMapChange, auth, chat, onOpenLogin, information, onPublishInformation, onSubmitAsInformation, onStartLostFound, lostFoundPublishToken = 0, onAskAi, headerActions, onOpenMemberProfile }) {
  const [draft, setDraft] = useState('')
  const photos = usePostImageDraft(auth.user?.id)
  const [composerRegionId, setComposerRegionId] = useState('living')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [retractingId, setRetractingId] = useState(null)
  const [publishMenu, setPublishMenu] = useState(false)
  useBackLayer(publishMenu, () => setPublishMenu(false), 25)
  const feedRef = useRef(null)
  const backRef = useRef(null)
  const expandedRef = useRef(false)
  const previousLastMessageId = useRef(null)
  const followingLatest = useRef(true)
  const [visibleViewport, setVisibleViewport] = useState(null)
  const shouldScrollToNewMessage = useRef(false)
  const loadedScope = useRef(null)
  const currentUserId = useRef(auth.user?.id)
  currentUserId.current = auth.user?.id

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
    const initialHistory = chat.historyStatus === 'ready' && loadedScope.current !== scope
    const justExpanded = isFullscreen && !expandedRef.current
    const lastId = messages.at(-1)?.id ?? null
    const newLastMessage = lastId !== previousLastMessageId.current
    if (activeSection === 'chat' && (initialHistory || justExpanded || shouldScrollToNewMessage.current || (newLastMessage && followingLatest.current)) && messages.length > 0) {
      feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: initialHistory || justExpanded ? 'auto' : 'smooth' })
      shouldScrollToNewMessage.current = false
    }
    expandedRef.current = isFullscreen
    previousLastMessageId.current = lastId
    if (activeSection === 'chat' && chat.historyStatus === 'ready') loadedScope.current = scope
  }, [messages, auth.user?.id, selectedRegionId, chat.historyStatus, activeSection, isFullscreen])

  useEffect(() => {
    if (!isFullscreen || activeSection !== 'chat' || !followingLatest.current) return undefined
    const frame = requestAnimationFrame(() => {
      const feed = feedRef.current
      if (feed) feed.scrollTo({ top: feed.scrollHeight })
    })
    return () => cancelAnimationFrame(frame)
  }, [visibleViewport, activeSection, isFullscreen])

  const handleSubmit = async (event) => {
    event.preventDefault()
    const content = draft.trim()
    if ((!content && !photos.items.length) || sending || photos.busy) return
    if (!auth.user) { onOpenLogin(); return }
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

  return (
    <section className={`mobile-page-panel mobile-page-panel--hall${isFullscreen ? ' mobile-page-panel--hall-fullscreen' : ''}`} style={isFullscreen && visibleViewport ? { height: visibleViewport.height, top: visibleViewport.top } : undefined} aria-label={isFullscreen ? SECTION_TITLES[activeSection] : '校园社区'}>
      {isFullscreen ? <header className="hall-fullscreen-heading">
        <button type="button" ref={backRef} onClick={() => { if (!requestAppBack()) onCloseSection?.() }} aria-label="返回校园社区"><ArrowLeft size={21} aria-hidden="true" /></button>
        <div><h2>{SECTION_TITLES[activeSection]}</h2><p>{activeSection === 'chat' && <span className={`hall-connection-dot${chat.connectionStatus === 'live' ? ' is-live' : ''}`} aria-hidden="true" />}{activeSection === 'chat' ? chatLabel : SECTION_DESCRIPTIONS[activeSection]}</p></div>
      </header> : <>
      <header className="organized-page-heading campus-community-heading"><div><small className="campus-page-brand" aria-hidden="true">OurCampus</small><h2>社区</h2><p>和同学聊聊，看看校园新鲜事。</p></div>
        <div className="hall-publish"><button className="hall-publish-toggle" type="button" aria-expanded={publishMenu} aria-controls="hall-publish-menu" onClick={() => setPublishMenu((value) => !value)}><Plus size={17} />发布</button>
          {publishMenu && <div className="hall-publish-menu" id="hall-publish-menu"><button type="button" onClick={() => { setPublishMenu(false); onPublishInformation() }}><Flame size={17} />校园动态</button><button type="button" onClick={() => { setPublishMenu(false); onStartLostFound() }}><PackageSearch size={17} />失物信息</button><button type="button" onClick={() => { setPublishMenu(false); onSectionChange('restaurants') }}><UtensilsCrossed size={17} />餐厅评价</button></div>}
        </div>
        {headerActions}
      </header>
      <div className="hall-home-content">
        <section className="campus-community-mood" aria-label="校园生活"><div><small>在这里，遇见同频的日常</small><h3>校园里的小事，<br />都值得被看见。</h3><p>聊聊近况，也帮彼此一个小忙。</p></div><span className="campus-community-mood__art" aria-hidden="true"><img src={DEFAULT_PERSONAL_ARTWORK} alt="" /></span></section>
        <div className="organized-section-heading"><h3>和同学一起</h3><span>分享 · 发现 · 互助</span></div>
        <div className="hall-entry-grid" aria-label="社区功能">
          {[{ id: 'chat', label: '校园聊天', copy: '按地区聊聊新鲜事', Icon: MessageCircle }, { id: 'hotspots', label: '校园热点', copy: '关注校园正在发生的事', Icon: Flame }, { id: 'lost-found', label: '失物招领', copy: '让丢失的物品找到归处', Icon: PackageSearch }, { id: 'restaurants', label: '餐厅评价', copy: '看看同学们怎么说', Icon: UtensilsCrossed }].map(({ id, label, copy, Icon }, index) => <button type="button" key={id} className={`hall-life-card hall-life-card--${['mint', 'sunny', 'lavender', 'coral'][index]}`} onClick={() => onSectionChange(id)}><CampusSticker Icon={Icon} tone={['mint', 'sunny', 'lavender', 'coral'][index]} /><strong>{label}</strong><small>{copy}</small><ChevronRight size={16} /></button>)}
        </div>
        <div className="organized-section-heading"><h3>近期校园动态</h3><button type="button" onClick={() => onSectionChange('hotspots')}>查看全部 <ChevronRight size={14} /></button></div>
        <div className="hall-recent-list">{[...hotspots].sort((a, b) => (Date.parse(b.startAt) || 0) - (Date.parse(a.startAt) || 0)).slice(0, 3).map((event) => <button type="button" key={event.id} onClick={() => onSectionChange('hotspots')}><span className="hall-recent-dot" /><span><strong>{event.title}</strong><small><MapPin size={12} />{locations.find((location) => location.id === event.locationId)?.name ?? '校园动态'} · {event.isCloud ? '已审核发布' : '本机 / 示例'}</small></span><ChevronRight size={15} /></button>)}{!hotspots.length && <p className="organized-empty">暂时没有新动态，可以发布你发现的校园信息。</p>}</div>
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
        <CampusHotspotsPanel events={hotspots} locations={locations} regionId={selectedRegionId} onSelectLocation={onSelectLocation} onPlanRouteToLocation={onPlanRouteToLocation} onPublishInformation={onPublishInformation} onAskAi={onAskAi} viewerId={auth.user?.id} />
      </div>
      <div className="community-scroll" hidden={activeSection !== 'lost-found'}>
        <LostFoundPanel posts={posts} locations={locations} regionId={selectedRegionId} filter={lostFoundFilter} onFilterChange={onLostFoundFilterChange} onRegionChange={onRegionChange} onSubmitPost={onSubmitPost} onStatusChange={onPostStatusChange} onDeletePost={onDeletePost} onSelectLocation={onSelectLocation} onPlanRouteToLocation={onPlanRouteToLocation} showMapMarkers={showLostFound} onMapMarkersChange={onLostFoundMapChange} currentUserId={auth.user?.id} cloudReady={information.status === 'ready'} publishToken={lostFoundPublishToken} />
      </div>
      {activeSection === 'restaurants' && <div className="community-scroll"><RestaurantHallSection locations={locations} onOpenReviews={onOpenRestaurantReviews} /></div>}

      {activeSection === 'chat' && <>
      <section className="mobile-hall-feed" ref={feedRef} onScroll={(event) => { const feed = event.currentTarget; followingLatest.current = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 64 }} aria-label="校园聊天消息">
        <div className="mobile-panel-section__heading mobile-hall-feed__heading">
          <h3>{selectedRegionId === 'all' ? '全部消息' : REGION_LABELS.get(selectedRegionId)}</h3>
          <span>{auth.user ? `${messages.length} 条消息` : '登录后可见'}</span>
        </div>
        {!auth.user ? <div className="mobile-hall-login-gate"><MessageCircle size={32} /><h3>认识校园里的新朋友</h3><p>登录后查看历史消息，按地区参与聊天。</p><button type="button" disabled={auth.status === 'loading'} onClick={onOpenLogin}><LogIn size={16} /> 登录 / 注册</button></div>
        : <>
        {chat.error && <div className="mobile-chat-error" role="alert"><span>{chat.error}</span><button type="button" onClick={chat.retry}>重试</button></div>}
        {chat.hasMore && <button className="mobile-chat-load-more" type="button" disabled={chat.loadingOlder} onClick={chat.loadOlder}>{chat.loadingOlder ? '加载中…' : '查看更早消息'}</button>}
        {messages.length > 0 ? (
          <ol className="mobile-hall-messages" aria-live="polite">
            {messages.map((message) => (
              <li
                className={`mobile-hall-message${message.authorId === auth.user.id ? ' is-own' : ''}`}
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
        <PostImagePicker draft={photos} disabled={!auth.user || sending} label="添加聊天照片" />
        <label className="sr-only" htmlFor="mobile-hall-message">输入消息</label>
        <input
          id="mobile-hall-message"
          type="text"
          maxLength={200}
          placeholder={auth.user ? '聊聊校园里的新鲜事…' : '登录后即可发消息'}
          value={draft}
          disabled={!auth.user || sending}
          onChange={(event) => { setDraft(event.target.value); setSendError('') }}
        />
        <div className="mobile-hall-composer__actions">
          <label className="sr-only" htmlFor="mobile-hall-region">消息所属区域</label>
          <select
            id="mobile-hall-region"
            value={composerRegionId}
            disabled={sending}
            onChange={(event) => setComposerRegionId(event.target.value)}
          >
            {COMPOSER_REGIONS.map((region) => <option value={region.id} key={region.id}>{region.label}</option>)}
          </select>
          <button type="submit" disabled={!auth.user || (!draft.trim() && !photos.items.length) || photos.busy || sending || chat.connectionStatus === 'offline'}>
            <Send size={15} aria-hidden="true" /> {sending ? '发送中…' : '发送'}
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
