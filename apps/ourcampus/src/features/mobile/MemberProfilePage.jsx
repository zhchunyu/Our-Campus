import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, MessageCircle, RefreshCw, UserRound } from 'lucide-react'
import { useBackLayer } from '../../app/useBackLayer.js'
import { acquireInert } from '../../app/modalInert.js'
import { CAMPUS_HALL_REGIONS } from '../../data/campusHall.js'
import { isMemberUserId, listMemberHallMessages, MEMBER_HALL_MESSAGE_LIMIT, toMemberHallMessage } from '../../data/memberHallMessages.js'
import { getAvatarUrl, getMemberProfile } from '../../data/memberProfiles.js'
import { describeServerError, supabase } from '../../data/supabaseClient.js'
import { PostImageGallery } from './PostImageGallery.jsx'
import { ProfileAvatar } from './ProfileAvatar.jsx'
import './member-profile.css'

const EMPTY_STATE = { profile: null, messages: [], profileStatus: 'loading', messagesStatus: 'loading', profileError: '', messagesError: '' }
const REGION_LABELS = new Map(CAMPUS_HALL_REGIONS.map((region) => [region.id, region.label]))
const DATE_FORMAT = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })

function orderMessages(messages, userId, removedIds) {
  const byId = new Map()
  for (const message of messages) {
    if (message?.authorId === userId && !message.deletedAt && !removedIds.has(message.id)) byId.set(message.id, message)
  }
  return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)).slice(0, MEMBER_HALL_MESSAGE_LIMIT)
}

// Each open page owns its request sequence and tombstones. A late snapshot must
// never restore a retraction or write into a different member's page.
export function createMemberProfileLoader({ userId, loadProfile = getMemberProfile, loadMessages = listMemberHallMessages, onChange }) {
  let state = { ...EMPTY_STATE }
  let disposed = false
  let requestId = 0
  let eventVersion = 0
  const removedIds = new Set()
  const liveUpdates = new Map()
  const update = (changes) => {
    if (disposed) return
    state = { ...state, ...changes }
    onChange(state)
  }
  const refresh = async () => {
    if (disposed) return
    const currentRequest = ++requestId
    const snapshotVersion = eventVersion
    update({
      profileStatus: state.profile ? 'ready' : 'loading',
      messagesStatus: state.messagesStatus === 'ready' || state.messages.length ? 'ready' : 'loading',
      profileError: '', messagesError: '',
    })
    const [profileResult, messagesResult] = await Promise.allSettled([loadProfile(userId), loadMessages(userId)])
    if (disposed || currentRequest !== requestId) return
    const changes = {}
    if (profileResult.status === 'fulfilled') {
      changes.profile = profileResult.value
      changes.profileStatus = profileResult.value ? 'ready' : 'notfound'
    } else {
      changes.profileStatus = 'error'
      changes.profileError = describeServerError(profileResult.reason, '成员资料加载失败，请重试')
    }
    if (messagesResult.status === 'fulfilled') {
      const live = [...liveUpdates.values()].filter((entry) => entry.version > snapshotVersion).map((entry) => entry.message)
      changes.messages = orderMessages([...messagesResult.value, ...live], userId, removedIds)
      changes.messagesStatus = 'ready'
      for (const [id, entry] of liveUpdates) if (entry.version <= snapshotVersion) liveUpdates.delete(id)
    } else {
      changes.messagesStatus = 'error'
      changes.messagesError = describeServerError(messagesResult.reason, '大厅发言加载失败，请重试')
    }
    update(changes)
  }
  const handleHallChange = (payload) => {
    if (disposed) return
    const row = payload.new
    const id = payload.eventType === 'DELETE' ? payload.old?.id : row?.id
    if (!id || (row?.author_id && row.author_id !== userId)) return
    if (payload.eventType === 'DELETE' || row?.deleted_at) {
      removedIds.add(id)
      liveUpdates.delete(id)
      update({ messages: state.messages.filter((message) => message.id !== id) })
      return
    }
    const message = toMemberHallMessage(row, userId)
    if (!message || removedIds.has(id)) return
    liveUpdates.set(id, { message, version: ++eventVersion })
    update({ messages: orderMessages([...state.messages, message], userId, removedIds) })
  }
  return {
    refresh, handleHallChange,
    dispose() { disposed = true; requestId += 1; liveUpdates.clear() },
  }
}

function RetryButton({ onRetry }) {
  return <button className="member-profile__retry" type="button" onClick={onRetry}><RefreshCw size={15} />重试</button>
}

export function MemberProfileContent({ state, onRetry, viewerId }) {
  const { profile, messages, profileStatus, messagesStatus, profileError, messagesError } = state
  if (!profile) {
    if (profileStatus === 'loading') return <div className="member-profile__state" role="status"><UserRound size={32} /><p>正在加载成员资料…</p></div>
    if (profileStatus === 'notfound') return <div className="member-profile__state" role="status"><UserRound size={32} /><strong>未找到这位成员</strong><p>成员资料可能已不可用。</p></div>
    return <div className="member-profile__state" role="alert"><UserRound size={32} /><p>{profileError || '成员资料加载失败，请重试'}</p><RetryButton onRetry={onRetry} /></div>
  }
  const name = profile.nickname || '校园同学'
  return <>
    <div className="member-profile__identity"><ProfileAvatar src={getAvatarUrl(profile.avatar_path)} name={name} className="member-profile__avatar" /><div><h2>{name}</h2><p>校园成员</p></div></div>
    {profileError && <div className="member-profile__notice" role="alert"><span>{profileError}</span><RetryButton onRetry={onRetry} /></div>}
    <section className="member-profile__messages" aria-labelledby="member-profile-messages-title"><div className="member-profile__heading"><h3 id="member-profile-messages-title">最近的大厅发言</h3><p>最多展示 20 条未撤回的发言</p></div>
      {messagesError && <div className="member-profile__notice" role="alert"><span>{messagesError}</span><RetryButton onRetry={onRetry} /></div>}
      {messagesStatus === 'loading' && !messages.length ? <div className="member-profile__state" role="status"><p>正在加载大厅发言…</p></div> : messages.length ? <ol className="member-profile__message-list">{messages.map((message) => <li key={message.id}><div><span>{REGION_LABELS.get(message.regionId) || '校园大厅'}</span><time dateTime={message.createdAt}>{DATE_FORMAT.format(new Date(message.createdAt))}</time></div><p>{message.content}</p><PostImageGallery paths={message.imagePaths} viewerId={viewerId} label="大厅发言照片" /></li>)}</ol> : messagesStatus === 'ready' && <div className="member-profile__state" role="status"><MessageCircle size={28} /><strong>还没有公开的大厅发言</strong><p>新的大厅发言会显示在这里。</p></div>}
    </section>
  </>
}

export function MemberProfilePage({ userId, viewerId, onClose }) {
  const identity = `${viewerId ?? 'guest'}:${userId ?? ''}`
  const titleId = useId()
  const [state, setState] = useState({ ...EMPTY_STATE, identity })
  const dialogRef = useRef(null)
  const loaderRef = useRef(null)
  useBackLayer(true, onClose, 90)

  useEffect(() => {
    setState({ ...EMPTY_STATE, identity })
    if (!isMemberUserId(userId)) {
      setState({ ...EMPTY_STATE, identity, profileStatus: 'notfound', messagesStatus: 'ready' })
      return undefined
    }
    const loader = createMemberProfileLoader({ userId, onChange: (next) => setState({ ...next, identity }) })
    loaderRef.current = { identity, loader }
    let active = true
    const refresh = () => { if (active) void loader.refresh() }
    const handleHallChange = (payload) => { if (active) { loader.handleHallChange(payload); refresh() } }
    // Establish the listeners before the first read; reconnects also reconcile.
    const channel = supabase?.channel(`member-profile:${identity}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `user_id=eq.${userId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hall_messages', filter: `author_id=eq.${userId}` }, handleHallChange)
      .subscribe((status) => { if (status === 'SUBSCRIBED') refresh() })
    refresh()
    const resumed = () => { if (document.visibilityState === 'visible') refresh() }
    window.addEventListener('online', refresh)
    document.addEventListener('visibilitychange', resumed)
    const timer = setInterval(() => { if (navigator.onLine && document.visibilityState === 'visible') refresh() }, 30000)
    return () => {
      active = false
      loader.dispose()
      clearInterval(timer)
      window.removeEventListener('online', refresh)
      document.removeEventListener('visibilitychange', resumed)
      if (channel) void supabase.removeChannel(channel)
      if (loaderRef.current?.identity === identity) loaderRef.current = null
    }
  }, [identity, userId])

  useEffect(() => {
    const previousFocus = document.activeElement
    const root = document.getElementById('root')
    const releaseRoot = root ? acquireInert(root) : null
    dialogRef.current?.focus()
    const trapFocus = (event) => {
      if (event.key !== 'Tab') return
      const dialog = dialogRef.current
      const elements = [...(dialog?.querySelectorAll('button:not(:disabled), a[href], [tabindex="0"]') ?? [])].filter((element) => element.getClientRects().length > 0)
      if (!elements.length) { event.preventDefault(); dialog?.focus(); return }
      const first = elements[0]
      const last = elements.at(-1)
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement) || document.activeElement === dialog)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement) || document.activeElement === dialog)) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', trapFocus)
    return () => {
      document.removeEventListener('keydown', trapFocus)
      releaseRoot?.()
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [])

  if (typeof document === 'undefined') return null
  const visibleState = state.identity === identity ? state : EMPTY_STATE
  const retry = () => { if (loaderRef.current?.identity === identity) void loaderRef.current.loader.refresh() }
  return createPortal(<div className="personal-sheet-backdrop member-profile-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose() }}><section ref={dialogRef} className="personal-sheet personal-sheet--preview member-profile" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
    <header className="personal-sheet__header member-profile__header"><button type="button" aria-label="关闭成员主页" onClick={onClose}><ChevronLeft size={23} /></button><h1 id={titleId}>成员主页</h1><span aria-hidden="true" /></header>
    <div className="personal-sheet__scroll member-profile__scroll"><MemberProfileContent state={visibleState} onRetry={retry} viewerId={viewerId} /></div>
  </section></div>, document.body)
}
