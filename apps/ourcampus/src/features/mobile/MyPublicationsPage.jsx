import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { campusDisplayText } from '../../data/campusPresentation.js'
import { LOCAL_AUTHOR_ID } from '../../data/campusCommunity.js'
import { loadLocalRestaurantReviews } from '../../data/restaurantReviews.js'
import { loadUserCloudReviews, reviewServerError } from '../../data/restaurantCloudReviews.js'
import { PLACE_FEEDBACK_TYPES } from '../../domain/placeFeedback.js'

const FILTERS = [['all', '全部'], ['notice', '动态'], ['lost', '失物'], ['review', '评价'], ['feedback', '反馈报修']]
const STATUS = { submitted: '分析中', analyzed: '待确认', published: '已发布', resolved: '已完成', withdrawn: '已撤回', rejected: '未通过', pending: '待处理', processing: '处理中', completed: '已完成', active: '寻找中' }
const dateText = (value) => new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export function MyPublicationsPage({ userId, reports = [], posts = [], feedbacks = [], locations, refreshToken = 0, initialFilter = 'all', covered = false, onClose, onOpenCloudReports, onOpenMyLostFound, onOpenReview, onOpenFeedback, onSelectLocation, onRefresh }) {
  const [filter, setFilter] = useState(initialFilter)
  const [detail, setDetail] = useState(null)
  const [cloudReviews, setCloudReviews] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [revision, setRevision] = useState(0)
  const pageRef = useRef(null)
  const goBack = () => detail ? setDetail(null) : onClose()
  useBackLayer(!covered, goBack, 40)
  useEffect(() => { if (!covered) pageRef.current?.querySelector('button')?.focus({ preventScroll: true }) }, [covered])
  useEffect(() => {
    let live = true
    setCloudReviews([]); setError('')
    if (!userId) { setLoading(false); return undefined }
    setLoading(true)
    loadUserCloudReviews(userId).then((rows) => { if (live) setCloudReviews(rows) })
      .catch((failed) => { if (live) setError(reviewServerError(failed)) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [userId, revision, refreshToken])
  useEffect(() => {
    const previous = document.activeElement
    pageRef.current?.querySelector('button')?.focus({ preventScroll: true })
    const keydown = (event) => {
      if (!pageRef.current?.contains(document.activeElement)) return
      if (event.key === 'Escape') onClose()
      if (event.key === 'Tab') {
        const buttons = [...pageRef.current.querySelectorAll('button:not([disabled])')].filter((button) => button.getClientRects().length)
        if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1)?.focus() }
        if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0]?.focus() }
      }
    }
    window.addEventListener('keydown', keydown)
    return () => { window.removeEventListener('keydown', keydown); if (previous?.isConnected) previous.focus({ preventScroll: true }) }
  }, [onClose])
  const records = [
    ...reports.filter((report) => userId && report.author_id === userId).map((report) => ({ id: report.id, category: ['lost', 'found'].includes(report.kind) ? 'lost' : (['repair', 'feedback'].includes(report.kind) || Object.hasOwn(report.details ?? {}, 'open_status')) ? 'feedback' : 'notice', title: report.title, body: report.body, source: '我的云端发布', status: STATUS[report.status] ?? report.status, date: report.created_at, action: onOpenCloudReports })),
    ...posts.filter((post) => !post.cloudReportId && (post.authorId === LOCAL_AUTHOR_ID || (userId && post.authorId === userId))).map((post) => ({ id: post.id, category: 'lost', title: post.title, body: post.description, source: '本机历史记录', status: post.status === 'resolved' ? '已完成' : post.type === 'found' ? '待认领' : '寻找中', date: post.createdAt, action: onOpenMyLostFound })),
    ...[...cloudReviews, ...loadLocalRestaurantReviews().filter((review) => !review.isCloud)].map((review) => ({ id: review.id, category: 'review', title: `${locations.find((location) => location.id === review.restaurantId)?.name ?? '餐厅'} · ${review.rating} 星评价`, body: review.content, source: review.isCloud ? '我的云端评价' : '本机历史评价', status: STATUS[review.status] ?? '已发布', date: review.createdAt, action: () => onOpenReview(review.restaurantId, review.windowId) })),
    ...feedbacks.map((feedback) => ({ id: feedback.id, category: 'feedback', title: `${locations.find((location) => location.id === feedback.locationId)?.name ?? '校园地点'} · ${feedback.type === PLACE_FEEDBACK_TYPES.REPAIR ? '设施报修' : '地点反馈'}`, body: feedback.description, note: feedback.reviewNote, locationId: feedback.locationId, isRepair: feedback.type === PLACE_FEEDBACK_TYPES.REPAIR, source: '本机历史记录', status: STATUS[feedback.status] ?? feedback.status, date: feedback.submittedAt })),
  ].sort((left, right) => (Date.parse(right.date) || 0) - (Date.parse(left.date) || 0))
  const visible = records.filter((record) => filter === 'all' || record.category === filter)
  return <section className="my-publications-page" role="dialog" aria-modal="true" aria-labelledby="my-publications-title" aria-hidden={covered || undefined} inert={covered} ref={pageRef}>
    <header><button className="organized-back" type="button" aria-label={detail ? '返回我的发布' : '返回我的'} onClick={() => detail ? setDetail(null) : onClose()}><ArrowLeft size={20} /></button><div><h2 id="my-publications-title">{detail ? '发布详情' : '我的发布'}</h2></div><button className="organized-back" type="button" aria-label="刷新我的发布" disabled={loading} onClick={() => { setRevision((value) => value + 1); Promise.resolve(onRefresh?.()).catch((failed) => setError(reviewServerError(failed))) }}><RefreshCw size={19} /></button></header>
    {!detail && <nav className="community-chip-strip" aria-label="我的发布分类">{FILTERS.map(([id, label]) => <button type="button" key={id} className={filter === id ? 'is-active' : ''} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}</nav>}
    <div className="my-publications-scroll">
      {detail ? <section className="my-publication-detail"><span className="my-publication-meta"><span>{detail.source}</span><b>{detail.status}</b></span><h3>{campusDisplayText(detail.title)}</h3><p>{campusDisplayText(detail.body)}</p>{detail.note && <p>处理说明：{campusDisplayText(detail.note)}</p>}<small>{dateText(detail.date)}</small><div className="community-card-actions"><button type="button" onClick={() => onSelectLocation(detail.locationId)}>查看地点</button>{detail.isRepair && <button type="button" onClick={onOpenFeedback}>查看报修进度</button>}</div></section> : <>
      {!userId && <p className="organized-empty">当前展示本机历史记录，登录后可查看自己的云端发布。</p>}
      {loading && <p role="status" className="organized-empty">正在读取我的云端评价…</p>}
      {error && <p role="alert" className="information-error">云端评价暂未读取：{error}</p>}
      <div className="organized-section-heading"><h3>{filter === 'all' ? '近期发布' : FILTERS.find(([id]) => id === filter)?.[1] + '记录'}</h3><span>{visible.length} 条</span></div>
      {visible.map((record) => <button className="my-publication-record" type="button" key={`${record.category}:${record.id}`} onClick={() => record.action ? record.action() : setDetail(record)}><span className="my-publication-meta"><span>{record.source}</span><b>{record.status}</b></span><strong>{campusDisplayText(record.title)}</strong><p>{campusDisplayText(record.body)}</p><span className="my-publication-time">{dateText(record.date)}<span>查看 / 管理 <ChevronRight size={13} /></span></span></button>)}
      {!visible.length && !loading && <p className="organized-empty">这个分类还没有发布记录。</p>}
      </>}
    </div>
  </section>
}
import { useBackLayer } from '../../app/useBackLayer.js'
