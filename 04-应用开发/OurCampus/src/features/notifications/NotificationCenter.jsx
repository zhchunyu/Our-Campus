import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Bell, BellRing, Check, ChevronRight, MapPin, RefreshCw, Send, ShieldCheck, X } from 'lucide-react'
import { PostImagePicker } from '../mobile/PostImagePicker.jsx'
import { PostImageGallery } from '../mobile/PostImageGallery.jsx'
import { usePostImageDraft } from '../mobile/usePostImageDraft.js'
import { safePostImagePaths } from '../../data/postImages.js'
import { requireSupabase } from '../../data/supabaseClient.js'
import { campusDisplayText } from '../../data/campusPresentation.js'
import { reportImageDetails, eventReportImagePaths, INFORMATION_KINDS, PUBLIC_INFORMATION_KINDS, REPORT_STATUS, informationError, newReportId, retryCampusReport, reviewCampusReport, setReportStatus, submitCampusReport } from '../../data/campusInformation.js'
import { CampusPush, disablePushDevice, isAndroidPush } from '../../data/campusPush.js'
import { orderRelevantNotices } from '../../data/notificationRelevance.js'
import { NotificationPreferences } from './NotificationPreferences.jsx'
import { HallNotificationPreferences } from './HallNotificationPreferences.jsx'
import { getHallNotificationMessage, getCurrentHallNotificationDetail, hallNotificationRegion } from '../../data/hallNotifications.js'
import './notifications.css'

const time = (value) => new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
const localTime = (value) => new Date(value - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0, 16)
const blankDraft = (seed = {}) => ({ clientId: newReportId(), kind: 'notice', title: '', body: '', locationId: '', ...seed })

function MatchEvidence({ notice }) {
  const match = notice.context?.match
  if (!match) return notice.reason ? <p className="information-notice-reason">提醒原因：{campusDisplayText(notice.reason)}</p> : null
  return <div className="information-analysis"><strong>为什么提醒我</strong>
    {Array.isArray(match.reasons) && <ul>{match.reasons.map((r, i) => <li key={i}>{campusDisplayText(r)}</li>)}</ul>}
    {Array.isArray(match.warnings) && match.warnings.map((w, i) => <small key={i}>{campusDisplayText(w)}</small>)}
    <small>{match.generated_by === 'auv-features' ? 'AI 提取特征后进行比对' : '按发布中的物品特征比对'} · 请自行核对归属</small>
  </div>
}

function ReviewCard({ report, locations, events, onDone, run, busy, viewerId }) {
  const [title, setTitle] = useState(report.title)
  const [summary, setSummary] = useState(report.analysis?.summary || report.body)
  const [locationId, setLocationId] = useState(report.location_id || report.analysis?.location_id || '')
  const [endAt, setEndAt] = useState(localTime(Date.parse(report.details?.ends_at) || Date.now() + 4 * 3600000))
  const [scope, setScope] = useState('subscribers')
  const [eventId, setEventId] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const related = events.filter((e) => e.locationId === locationId && e.informationKind === report.kind)
  const review = (publish) => run(async () => {
    await reviewCampusReport({ id: report.id, publish, title, summary, locationId, kind: report.kind,
      endAt: publish ? new Date(endAt).toISOString() : null, scope, eventId })
    await onDone()
  }, publish ? '审核通过，通知已写入消息中心；系统推送由后台处理。' : '已拒绝发布。')
  return <section className="information-card information-review">
    <span className="information-tag">{INFORMATION_KINDS[report.kind]} · 待审核</span>
    <h3>{campusDisplayText(report.title)}</h3><p>{campusDisplayText(report.body)}</p><PostImageGallery paths={report.details?.image_paths} viewerId={viewerId} label="上报照片" />
    <small>原始上报 · {time(report.created_at)}</small>
    {report.analysis?.summary && <p className="information-analysis">AI 草稿（未核实）：{campusDisplayText(report.analysis.summary)}</p>}
    <label>确认标题<input maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
    <label>确认说明<textarea rows={3} maxLength={1500} value={summary} onChange={(e) => setSummary(e.target.value)} /></label>
    <label>确认地点<select value={locationId} onChange={(e) => { setLocationId(e.target.value); setEventId('') }}><option value="">请选择地点</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
    <label>通知有效至<input type="datetime-local" required value={endAt} onChange={(e) => setEndAt(e.target.value)} /></label>
    {report.kind === 'activity' && report.details?.starts_at && <small>发布者填写的活动开始时间：{time(report.details.starts_at)}。请核对说明与结束时间，不符时请退回更正。</small>}
    {related.length > 0 && <label>关联已有事件<select value={eventId} onChange={(e) => setEventId(e.target.value)}><option value="">创建新事件</option>{related.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}</select><small>同地点同类型只表示可能相关，请核对后选择。</small></label>}
    {PUBLIC_INFORMATION_KINDS.has(report.kind) ? <p className="information-public-note"><BellRing size={16} />公共通知将发送给所有注册用户。</p>
      : <label>通知范围<select value={scope} onChange={(e) => setScope(e.target.value)}><option value="subscribers">相关用户（收藏、兴趣或订阅）</option><option value="all">重要的全校通知（管理者确认）</option></select></label>}
    <label className="information-consent"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />我已确认地点、内容和有效时间，允许按上述范围发布。</label>
    <div className="information-actions"><button disabled={busy || !confirmed || !locationId || !endAt || !title.trim() || !summary.trim()} onClick={() => review(true)}><ShieldCheck size={15} />确认并发布</button><button disabled={busy} onClick={() => review(false)}>不予发布</button></div>
  </section>
}

export function NotificationCenter({ auth, information, push, preferences, favoriteIds, locations, onClose, onOpenLogin, onSelectLocation, onPlanRouteToLocation, onOpenChat, initialDraft, noticeId, initialTab = 'messages' }) {
  const [tab, setTab] = useState(initialDraft ? 'publish' : initialTab === 'review' && auth.role !== 'manager' ? 'messages' : initialTab)
  const [draft, setDraft] = useState(() => blankDraft(initialDraft))
  const photos = usePostImageDraft(auth.user?.id)
  const draftOwner = useRef(auth.user?.id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [detail, setDetail] = useState(null)
  const [consent, setConsent] = useState(false)
  const [subscribeLocation, setSubscribeLocation] = useState('')
  const [subscribeKind, setSubscribeKind] = useState('')
  const goBack = () => { if (!busy) { if (tab === 'messages' && detail) setDetail(null); else onClose() } }
  useBackLayer(true, goBack, 85)
  const dialog = useRef(null)
  const userRef = useRef(auth.user?.id); userRef.current = auth.user?.id
  const userId = auth.user?.id
  const manager = auth.role === 'manager'
  useEffect(() => {
    const previous = document.activeElement
    dialog.current?.querySelector('button')?.focus()
    const key = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Tab') {
        const list = [...dialog.current.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea,select,a[href]')].filter((n) => n.getClientRects().length)
        const first = list[0]; const last = list.at(-1)
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
      }
    }
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('keydown', key); previous?.focus() }
  }, [onClose])
  useEffect(() => { setDetail(null); setError(''); setSuccess(''); setBusy(false); if (draftOwner.current !== userId) { draftOwner.current = userId; setDraft(blankDraft()) } }, [userId])
  const chatDetailId = detail?.notice.related_type === 'message' ? detail.notice.id : null
  useEffect(() => {
    if (!chatDetailId || !userId) return undefined
    let live = true
    const refresh = async () => {
      try {
        const current = await getCurrentHallNotificationDetail(detail.notice, userId)
        if (!live || userRef.current !== userId) return
        setDetail(previous => previous?.notice.id === chatDetailId ? current : previous)
        if (!current) setError('这条聊天消息已撤回，或聊天提醒已取消。')
      } catch (error) {
        if (!live || userRef.current !== userId) return
        setDetail(previous => previous?.notice.id === chatDetailId ? null : previous)
        setError(informationError(error))
      }
    }
    refresh()
    return () => { live = false }
  }, [chatDetailId, userId, information.notices])
  const run = async (fn, text) => {
    if (busy) return
    const actor = userId
    setBusy(true); setError(''); setSuccess('')
    try { await fn(); if (userRef.current === actor && text) setSuccess(text) }
    catch (e) { if (userRef.current === actor) setError(informationError(e)) }
    finally { if (userRef.current === actor) setBusy(false) }
  }
  const showNotice = async (notice) => {
    const actor = userId
    if (!notice || notice.recipient_id !== actor) return
    let target = null
    if (notice.related_type === 'event') {
      const { data, error: failed } = await requireSupabase().from('campus_events').select('*').eq('id', notice.related_id).maybeSingle()
      if (failed) throw failed
      target = data
      if (data) {
        const reports = await requireSupabase().from('campus_reports').select('event_id,status,details').eq('event_id', data.id).eq('status', 'published').order('created_at', { ascending: false }).limit(20)
        if (reports.error) throw reports.error
        target = { ...data, imagePaths: eventReportImagePaths(reports.data, data.id) }
      }
    } else if (notice.related_type === 'message') {
      target = await getHallNotificationMessage(notice)
    } else if (['lost-found', 'feedback'].includes(notice.related_type)) {
      const { data, error: failed } = await requireSupabase().from('campus_reports').select('*').eq('id', notice.related_id).maybeSingle()
      if (failed) throw failed
      target = data
    }
    if (userRef.current !== actor) return
    setDetail({ notice, target }); setTab('messages')
    await information.markRead(notice.id)
  }
  useEffect(() => {
    if (!noticeId || !userId || !/^[0-9a-f-]{36}$/i.test(noticeId)) return undefined
    let live = true
    requireSupabase().from('notifications').select('*').eq('id', noticeId).eq('recipient_id', userId).maybeSingle().then(async ({ data, error: failed }) => {
      if (!live) return
      if (failed) { setError(informationError(failed)); return }
      if (!data) { setError('这条通知已移除，或不属于当前账号。'); return }
      try { await showNotice(data) } catch (e) { if (live) setError(informationError(e)) }
    })
    return () => { live = false }
  }, [noticeId, userId])
  const publish = (e) => {
    e.preventDefault()
    if (photos.busy) return
    run(async () => {
      const actor = userId
      const details = { ...draft.details }
      const uploaded = await photos.upload()
      if (userRef.current !== actor) throw new Error('账号已变化，请重新发布')
      if (draft.kind === 'activity') {
        const start = Date.parse(draft.startsAt); const end = Date.parse(draft.endsAt)
        if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || end <= Date.now()) throw new Error('请填写有效的活动开始、结束时间。')
        details.starts_at = new Date(start).toISOString(); details.ends_at = new Date(end).toISOString()
      }
      await submitCampusReport({ ...draft, details: reportImageDetails(details, uploaded, actor) })
      if (userRef.current !== userId) return
      setDraft(blankDraft()); photos.reset(); setTab('reports'); await information.refresh()
    }, '信息已保存到云端，后台分析完成后会更新状态。公共通知需要管理员确认。')
  }
  const subscribe = (e) => {
    e.preventDefault()
    run(async () => {
      if (subscribeKind === 'activity' && preferences?.status !== 'ready') throw new Error('活动提醒服务尚未升级，请稍后再试。')
      const { error: failed } = await requireSupabase().from('campus_subscriptions').insert({ location_id: subscribeLocation, kind: subscribeKind })
      if (failed && failed.code !== '23505') throw failed
      await information.refresh()
    }, '订阅已保存。施工、封路和停水停电通知仍会面向所有注册用户。')
  }
  const reports = information.reports.filter((r) => r.author_id === userId)
  const pending = information.reports.filter((r) => ['submitted', 'analyzed'].includes(r.status) && !['lost', 'found'].includes(r.kind))
  return <div className="information-page" role="dialog" aria-modal="true" aria-labelledby="information-title" ref={dialog}>
    <div className="information-frame">
      <header><button aria-label="返回" onClick={goBack} disabled={busy}><ArrowLeft size={20} /></button><div><small>OURCAMPUS</small><h2 id="information-title">{{ messages: '校园消息', publish: '发布校园信息', reports: '我的校园上报', subscriptions: '订阅与通知设置', review: '校园信息审核' }[tab]}</h2></div><button aria-label="刷新消息" disabled={busy} onClick={() => run(async () => { await information.refresh(); await preferences?.refresh?.() })}><RefreshCw size={18} /></button></header>
      <div className="information-scroll">
        {!userId ? <section className="information-empty"><Bell size={38} /><h3>{tab === 'publish' ? '登录后发布校园信息' : tab === 'subscriptions' ? '登录后管理订阅与通知' : tab === 'reports' ? '登录后查看我的上报' : '登录后接收校园通知'}</h3><p>使用校园账号，连接与你相关的信息。</p><button onClick={onOpenLogin}>登录 / 注册</button></section> : <>
          {(error || information.error) && <p className="information-error" role="alert">{error || information.error}</p>}
          {success && <p className="information-success" role="status">{success}</p>}
          {information.status === 'loading' && <p role="status">正在连接校园信息服务…</p>}
          {tab === 'messages' && <>
            {detail ? <section className="information-card"><button className="information-text-button" onClick={() => setDetail(null)}>返回消息列表</button><h3>{campusDisplayText(detail.notice.title)}</h3><p>{campusDisplayText(detail.notice.related_type === 'message' ? (detail.target?.content || (detail.target ? '图片消息' : '这条聊天消息已撤回或不可查看。')) : (detail.target?.impact ?? detail.target?.body ?? detail.notice.body))}</p><PostImageGallery paths={detail.target?.imagePaths || detail.target?.image_paths || detail.target?.details?.image_paths} viewerId={userId} label="通知照片" />{hallNotificationRegion(detail.notice, detail.target) && onOpenChat && <button className="information-primary" onClick={() => onOpenChat(hallNotificationRegion(detail.notice, detail.target))}>打开这个地区的聊天</button>}<MatchEvidence notice={detail.notice} /><small>{time(detail.notice.created_at)}</small>{detail.target?.status && <p className="information-tag">{REPORT_STATUS[detail.target.status] ?? (detail.target.status === 'closed' ? '通知已结束' : Date.parse(detail.target.end_at) <= Date.now() ? '通知已过期' : '有效通知')}</p>}{detail.target?.details?.contact && <p>联系 / 领取方式：{campusDisplayText(detail.target.details.contact)}</p>}{detail.target?.location_id && <div className="information-actions"><button onClick={() => onSelectLocation(detail.target.location_id)}><MapPin size={15} />查看地点</button><button onClick={() => onPlanRouteToLocation(detail.target.location_id)}>导航到这里</button></div>}</section>
              : <><div className="information-list-heading"><span>重要和与你相关的提醒</span><button disabled={busy || !information.unread} onClick={() => run(() => information.markRead(), '已全部标为已读')}>全部已读</button></div>
                {!information.notices.length && information.status === 'ready' && <div className="information-empty"><Bell size={36} /><h3>暂时没有新通知</h3><p>重要校园通知、你订阅的聊天新消息、相关活动和可能匹配的失物线索会出现在这里。</p></div>}
                {orderRelevantNotices(information.notices).map((n) => <button className={`information-notice${n.read_at ? '' : ' unread'}`} key={n.id} disabled={busy} onClick={() => run(() => showNotice(n))}><span className="information-notice-icon"><Bell size={19} /></span><span><strong>{campusDisplayText(n.title)}</strong><p>{campusDisplayText(n.body)}</p>{n.reason && <small className="information-notice-reason">{n.priority >= 3 ? '优先提醒' : '与你相关'} · {campusDisplayText(n.reason)}</small>}<small>{time(n.created_at)}</small></span><ChevronRight size={17} /></button>)}
                {information.more && <button className="information-text-button" disabled={busy} onClick={() => run(information.loadMore)}>查看更早消息</button>}
              </>}
          </>}
          {tab === 'publish' && <form className="information-card information-form" onSubmit={publish}><fieldset disabled={busy}><span className="information-eyebrow">让信息连接到校园</span><h3>发布一条校园信息</h3><p>信息先入库，再由后台分析。施工、封路、停水停电审核后给所有注册用户发通知。</p><label>信息类型<select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>{Object.entries(INFORMATION_KINDS).map(([value, label]) => <option key={value} value={value} disabled={value === 'activity' && preferences?.status !== 'ready'}>{label}</option>)}</select></label>{draft.kind === 'activity' && <><label>活动开始<input type="datetime-local" required value={draft.startsAt || ''} onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })} /></label><label>活动结束<input type="datetime-local" required value={draft.endsAt || ''} onChange={(e) => setDraft({ ...draft, endsAt: e.target.value })} /></label></>}<label>标题<input required maxLength={80} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="例如：东侧道路正在施工" /></label><label>地点<select value={draft.locationId} onChange={(e) => setDraft({ ...draft, locationId: e.target.value })}><option value="">由描述匹配，或手动选择</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label><label>说明<textarea required rows={5} maxLength={1500} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} placeholder="发生了什么、何时看到、影响哪些位置？只写你知道的情况。" /></label>{safePostImagePaths(draft.details?.image_paths).length > 0 && <><PostImageGallery paths={draft.details.image_paths} viewerId={userId} label="原消息照片" /><button type="button" onClick={() => setDraft({ ...draft, details: { ...draft.details, image_paths: [] } })}>移除原消息照片</button></>}<PostImagePicker draft={photos} disabled={busy || safePostImagePaths(draft.details?.image_paths).length > 0} label="添加信息照片" />{draft.sourceMessageId && <small>来自你主动提交的社区消息，普通聊天不会自动送给 AI。</small>}<button className="information-primary" disabled={busy || photos.busy || information.status !== 'ready'}><Send size={16} />{busy ? '提交中…' : '提交到云端分析'}</button></fieldset></form>}
          {tab === 'reports' && <><div className="information-list-heading"><span>最近的上报</span><button onClick={() => setTab('publish')}>发布信息</button></div>{!reports.length && <p className="information-empty">暂时没有云端上报。原有本机发布仍保留在社区。</p>}{reports.map((r) => <section className="information-card" key={r.id}><span className="information-tag">{INFORMATION_KINDS[r.kind]} · {r.analysis_status === 'failed' && r.status === 'submitted' ? '分析失败，可重试' : REPORT_STATUS[r.status]}</span><h3>{campusDisplayText(r.title)}</h3><p>{campusDisplayText(r.body)}</p><PostImageGallery paths={r.details?.image_paths} viewerId={userId} label="上报照片" />{r.analysis?.summary && <p className="information-analysis">{r.analysis.generated_by === 'auv' ? 'AI 整理：' : '特征整理：'}{campusDisplayText(r.analysis.summary)}<small>用户上报，尚未自动核实。</small></p>}{r.related_event_id && <small>发现同地点同类型的已有事件，管理员会核对关联。</small>}{r.related_report_id && <small>存在可能匹配的失物信息，请到消息列表核对。</small>}<small>{time(r.created_at)}</small><div className="information-actions">{r.analysis_status === 'failed' && r.status === 'submitted' && <button disabled={busy} onClick={() => run(async () => { await retryCampusReport(r.id); await information.refresh() }, '已重新加入分析队列')}>重试分析</button>}{['submitted', 'analyzed'].includes(r.status) && <button disabled={busy} onClick={() => run(async () => { await setReportStatus(r.id, 'withdrawn'); await information.refresh() }, '已撤回，上报不再进入后续匹配')}>撤回</button>}{['lost', 'found', 'repair'].includes(r.kind) && ['submitted', 'analyzed', 'published'].includes(r.status) && <button disabled={busy} onClick={() => run(async () => { await setReportStatus(r.id, 'resolved'); await information.refresh() }, '已标记完成')}>标记完成</button>}</div></section>)}</>}
          {tab === 'subscriptions' && <>
            <HallNotificationPreferences userId={userId} information={information} busy={busy} run={run} />
            {preferences && <NotificationPreferences preferences={preferences} favoriteIds={favoriteIds} locations={locations} busy={busy} run={run} />}
            <section className="information-push"><BellRing size={24} /><div><h3>手机系统通知</h3><p>{!isAndroidPush() ? '系统通知请在安卓 APK 中开启。' : !push.status.configured ? '当前版本尚未启用系统通知，请安装配置完成后的更新版本。站内消息仍可查看。' : push.status.enabled && push.status.permission === 'granted' ? (push.status.cid ? '设备通知已开启；退出后的接收还需完成平台和手机厂商通道配置。' : '正在登记通知设备…') : '允许通知后，可接收校园通知和你订阅的聊天新消息。退出后接收需完成手机厂商通道配置。'}</p></div></section>
            {isAndroidPush() && push.status.configured && <section className="information-card">
              <p className="information-small">开启后个推处理设备标识、机型等信息以投递通知。校园推送接口不发送课表或应用定位坐标，并关闭 SDK 的智能、应景与应急推送。<a href="https://www.getui.com/privacy" target="_blank" rel="noreferrer">查看个推隐私政策</a></p>
              {push.status.vivoConfigured && <p className="information-small">此安装包还包含维沃移动通信有限公司提供的 vivo 推送 SDK，用于 iQOO/vivo 系统通知；会处理应用信息、推送 RegID、机型和系统信息。<a href="https://developers.vivo.com/doc/d/23807c559e844cbeb06049ee69e71833" target="_blank" rel="noreferrer">查看 vivo 推送隐私说明</a>。离线接收还需平台开通、消息分类和手机通知设置，不能仅凭安装包配置保证送达。</p>}
              <label className="information-consent"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />同意使用推送服务接收校园通知</label>
              <div className="information-actions"><button disabled={!consent || push.busy} onClick={push.enable}>开启系统通知</button><button disabled={busy} onClick={() => run(async () => { await disablePushDevice(); await push.refresh() }, '已停用本设备系统推送，站内消息继续保留。')}>关闭</button><button onClick={() => CampusPush.openSettings()}>系统设置</button></div>
              {push.error && <p className="information-error">{push.error}</p>}
            </section>}
<section className="information-card"><h3>只接收与你相关的信息</h3><p>按地点和类型订阅；公共施工、封路和停水停电通知自动面向全体注册用户。</p><form onSubmit={subscribe}><label>地点<select value={subscribeLocation} onChange={(e) => setSubscribeLocation(e.target.value)}><option value="">全部地点</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label><label>类别<select value={subscribeKind} onChange={(e) => setSubscribeKind(e.target.value)}><option value="">全部类别</option>{Object.entries(INFORMATION_KINDS).map(([value, label]) => <option key={value} value={value} disabled={value === 'activity' && preferences?.status !== 'ready'}>{label}</option>)}</select></label><button className="information-primary" disabled={busy || information.status !== 'ready'}><Check size={16} />保存订阅</button></form></section>{information.subscriptions.filter((s) => s.kind !== 'hall-message').map((s) => <div className="information-subscription" key={`${s.location_id}:${s.kind}`}><span>{locations.find((l) => l.id === s.location_id)?.name ?? '全部地点'} · {INFORMATION_KINDS[s.kind] ?? '全部类别'}</span><button aria-label="取消此订阅" disabled={busy} onClick={() => run(async () => { const { error: failed } = await requireSupabase().from('campus_subscriptions').delete().eq('user_id', userId).eq('location_id', s.location_id).eq('kind', s.kind); if (failed) throw failed; await information.refresh() }, '已取消订阅')}><X size={16} /></button></div>)}</>}
          {tab === 'review' && manager && <><p className="information-small">AI 只生成草稿。请确认现场信息和有效时间；施工等公共通知将全员发送。最近显示 100 条上报。</p>{pending.map((r) => <ReviewCard key={r.id} report={r} locations={locations} events={information.events} onDone={information.refresh} busy={busy} run={run} viewerId={userId} />)}{!pending.length && <p className="information-empty">没有待审核信息。</p>}{information.events.map((e) => <section className="information-card" key={e.id}><span className="information-tag">{e.informationScope === 'all' ? '全员通知' : '订阅通知'}</span><h3>{e.title}</h3><p>{e.impact}</p><button disabled={busy} onClick={() => run(async () => { const { error: failed } = await requireSupabase().rpc('campus_close_information_event', { p_id: e.id }); if (failed) throw failed; await information.refresh() }, '事件已结束，更新通知已加入队列')}>确认事件结束</button></section>)}</>}
        </>}
      </div>
    </div>
  </div>
}
import { useBackLayer } from '../../app/useBackLayer.js'
