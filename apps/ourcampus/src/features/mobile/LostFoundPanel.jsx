import { campusDisplayText } from '../../data/campusPresentation.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Plus, ImagePlus, MapPin, Navigation, PackageSearch, KeyRound, Check, Pencil, Trash2, X } from 'lucide-react'
import { createDemoLostFoundPosts, filterLostFoundPosts, getRegionLabel, LOCAL_AUTHOR_ID } from '../../data/campusCommunity.js'
import { prepareCommunityPhoto } from './communityImage.js'
import { usePostImageDraft } from './usePostImageDraft.js'
import { PostImagePicker } from './PostImagePicker.jsx'
import { PostImageGallery } from './PostImageGallery.jsx'
import { informationError, newReportId } from '../../data/campusInformation.js'

const displayTime = (value) => new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
function localDateTime(value = new Date()) {
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
const newDraft = () => ({ type: 'lost', title: '', description: '', locationId: '', locationDetail: '', occurredAt: localDateTime(), contact: '', image: '' })

export function LostFoundPanel({ posts, locations, regionId, filter, onFilterChange, onRegionChange, onSubmitPost, onStatusChange, onDeletePost, onSelectLocation, onPlanRouteToLocation, showMapMarkers, onMapMarkersChange, currentUserId, cloudReady, publishToken = 0 }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('active')
  const [draft, setDraft] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [photoBusy, setPhotoBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [syncToCloud, setSyncToCloud] = useState(true)
  const clientId = useRef(null)
  const submittedDraft = useRef(null)
  const photoDraft = usePostImageDraft(currentUserId)
  const activeUser = useRef(currentUserId); activeUser.current = currentUserId
  const cloudPhotos = !editingId && syncToCloud
  const [deleteId, setDeleteId] = useState(null)
  useBackLayer(Boolean(draft || deleteId || saving), () => { if (!saving) { if (deleteId) setDeleteId(null); else closeForm() } }, 30)
  const photoSequence = useRef(0)
  const examples = useMemo(createDemoLostFoundPosts, [])
  const byId = new Map(locations.map((location) => [location.id, location]))
  const visible = filterLostFoundPosts([...posts, ...examples], { regionId, type: filter, status, query, authorId: currentUserId })
  useEffect(() => { if (filter === 'mine') setStatus('all') }, [filter])
  useEffect(() => () => { photoSequence.current += 1 }, [])

  const closeForm = () => { photoSequence.current += 1; setDraft(null); setEditingId(null); setPhotoBusy(false); setError(''); photoDraft.reset() }
  const change = (key, value) => setDraft((current) => current ? { ...current, [key]: value } : current)
  const openForm = (post = null) => {
    if (saving) return
    submittedDraft.current = null
    clientId.current = newReportId()
    photoDraft.reset()
    photoSequence.current += 1
    setPhotoBusy(false); setError(''); setNotice(''); setEditingId(post?.id ?? null)
    setDraft(post ? { ...post, occurredAt: localDateTime(post.occurredAt) } : newDraft())
  }
  useEffect(() => { if (publishToken) openForm() }, [publishToken])
  const handlePhoto = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const sequence = ++photoSequence.current
    setPhotoBusy(true); setError('')
    try { const image = await prepareCommunityPhoto(file); if (sequence === photoSequence.current) change('image', image) }
    catch (photoError) { if (sequence === photoSequence.current) setError(photoError.message || '照片读取失败，请重新选择') }
    finally { if (sequence === photoSequence.current) setPhotoBusy(false) }
  }
  const submit = async (event) => {
    event.preventDefault()
    if (photoBusy || photoDraft.busy || saving) return
    setSaving(true)
    const actor = currentUserId
    try {
      const imagePaths = cloudPhotos && currentUserId ? await photoDraft.upload() : []
      if (actor !== activeUser.current) throw new Error('账号已变化，请重新发布')
      const payload = { ...draft, image: cloudPhotos ? '' : draft.image, imagePaths,
        syncToCloud: cloudPhotos, occurredAt: new Date(draft.occurredAt).toISOString() }
      const fingerprint = JSON.stringify({ actor, editingId, payload })
      if (submittedDraft.current !== fingerprint) { clientId.current = newReportId(); submittedDraft.current = fingerprint }
      const result = await onSubmitPost({ ...payload, clientId: clientId.current }, editingId)
      if (actor !== activeUser.current) return
      closeForm(); onFilterChange('mine'); onRegionChange('all'); setStatus('all')
      setNotice(result?.warning || (result?.cloud ? '信息与照片已保存到云端，其他登录用户可查看。后台将分析可能的匹配。' : '信息已保存在本机，其他设备不可见。'))
    } catch (saveError) { setError(informationError(saveError)) }
    finally { setSaving(false) }
  }
  const updateStatus = async (post) => {
    if (saving) return
    setSaving(true)
    try { await onStatusChange(post.id, post.status === 'active' ? 'resolved' : 'active'); setNotice(post.status === 'active' ? '已标记完成，可在“我的发布”或“全部状态”查看。' : '已重新开启。') }
    catch (saveError) { setNotice(informationError(saveError)) }
    finally { setSaving(false) }
  }
  const remove = async (id) => {
    if (saving) return
    setSaving(true)
    try { await onDeletePost(id); setDeleteId(null); setNotice('发布已撤回。') } catch (saveError) { setNotice(informationError(saveError)) }
    finally { setSaving(false) }
  }

  return <div className="community-content">
    <div className="community-banner"><PackageSearch size={27} /><div><strong>让丢失的物品找到回家的路</strong><p>留下特征与地点，方便同学辨认。</p></div></div>
    <div className="community-action-line"><span className="community-local-label">{cloudReady ? '云端信息 · 本机资料' : '云端服务待连接'}</span><button className="community-primary" type="button" disabled={saving} onClick={() => openForm()}><Plus size={15} />发布信息</button></div>
    {notice && <p className="community-notice" role="status">{notice}</p>}
    {draft && <form className="community-form" onSubmit={submit} aria-label={editingId ? '编辑失物信息' : '发布失物信息'}>
      <div className="community-list-heading"><h3>{editingId ? '编辑信息' : '发布失物信息'}</h3><button type="button" className="community-icon-button" onClick={closeForm} disabled={saving} aria-label="关闭发布表单"><X size={18} /></button></div>
      <label>信息类型<select disabled={saving} value={draft.type} onChange={(event) => change('type', event.target.value)}><option value="lost">我丢了东西 · 寻物</option><option value="found">我捡到东西 · 招领</option></select></label>
      <label>物品名称<input autoFocus disabled={saving} required maxLength={40} value={draft.title} placeholder="例如：蓝色折叠伞" onChange={(event) => change('title', event.target.value)} /></label>
      <label>物品特征<textarea disabled={saving} required maxLength={300} rows={3} value={draft.description} placeholder="颜色、品牌、明显特征等" onChange={(event) => change('description', event.target.value)} /></label>
      <label>校园地点<select disabled={saving} required value={draft.locationId} onChange={(event) => change('locationId', event.target.value)}><option value="">请选择丢失或拾获的地点</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
      <label>具体位置<input disabled={saving} maxLength={100} value={draft.locationDetail} placeholder="例如：一楼大厅、北侧入口" onChange={(event) => change('locationDetail', event.target.value)} /></label>
      <label>{draft.type === 'lost' ? '丢失时间' : '拾获时间'}<input disabled={saving} required type="datetime-local" value={draft.occurredAt} max={localDateTime()} onChange={(event) => change('occurredAt', event.target.value)} /></label>
      <label>联系方式<input disabled={saving} required maxLength={80} value={draft.contact} placeholder="微信号、电话或物品领取点" onChange={(event) => change('contact', event.target.value)} /></label>
      {cloudPhotos ? <PostImagePicker draft={photoDraft} disabled={saving} label="添加物品照片" /> : <>
      <div className="community-photo-field"><label className="community-upload"><ImagePlus size={18} />{photoBusy ? '正在处理照片…' : '添加物品照片（可选）'}<input aria-label="添加物品照片" type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhoto} disabled={photoBusy || saving} /></label><small>JPG / PNG / WebP，最多 5 MB；自动缩小后保存在本机。</small></div>
      {draft.image && <div className="community-photo-preview"><img src={draft.image} alt="待发布的物品照片" /><button type="button" disabled={saving} onClick={() => change('image', '')}>移除照片</button></div>}
      </>}
      {error && <p className="community-error" role="alert">{error}</p>}
      {!editingId && <label className="information-consent"><input type="checkbox" checked={syncToCloud} disabled={saving} onChange={(e) => setSyncToCloud(e.target.checked)} />同步到云端，交给 AI 分析匹配。信息与照片对登录用户可见；联系方式和照片不发送模型。</label>}
      {!currentUserId && syncToCloud && <small>云端发布需要先登录，登录后可继续提交。</small>}
      <button className="community-primary community-submit" type="submit" disabled={photoBusy || photoDraft.busy || saving}>{saving ? '正在保存…' : editingId ? '保存修改' : syncToCloud ? '发布到校园社区' : '仅保存在本机'}</button>
    </form>}
    <div className="community-chip-strip" aria-label="失物信息类型">{[{ id: 'all', label: '全部' }, { id: 'lost', label: '寻物' }, { id: 'found', label: '招领' }, { id: 'mine', label: '我的发布' }].map((item) => <button type="button" key={item.id} className={filter === item.id ? 'is-active' : ''} aria-pressed={filter === item.id} onClick={() => onFilterChange(item.id)}>{item.label}</button>)}</div>
    <div className="community-search-row"><label className="community-search"><Search size={16} /><input aria-label="搜索失物信息" type="search" value={query} placeholder="搜索物品或特征" onChange={(event) => setQuery(event.target.value)} /></label><select aria-label="失物处理状态" value={status} onChange={(event) => setStatus(event.target.value)}><option value="active">寻找中</option><option value="resolved">已完成</option><option value="all">全部状态</option></select></div>
    <label className="community-map-toggle"><input type="checkbox" checked={showMapMarkers} onChange={(event) => onMapMarkersChange(event.target.checked)} />在地图显示寻找中的发布</label>
    <div className="community-list-heading"><h3>{filter === 'mine' ? '我的发布' : '物品信息'}</h3><span>{visible.length} 条</span></div>
    {visible.length ? visible.map((post) => {
      const location = byId.get(post.locationId)
      const mine = post.authorId === LOCAL_AUTHOR_ID || post.authorId === currentUserId
      const doneLabel = post.type === 'lost' ? '已找回' : '已归还'
      return <article className={`community-card lost-found-card${post.status === 'resolved' ? ' is-resolved' : ''}`} key={post.id}>
        <div className="lost-found-card-heading"><div className={`lost-found-thumbnail lost-found-thumbnail--${post.type}`}>{post.image ? <img src={post.image} alt={campusDisplayText(post.title)} /> : post.type === 'lost' ? <PackageSearch size={27} /> : <KeyRound size={27} />}</div><div><div className="community-card-top"><span className={`community-tag community-tag--${post.type}`}>{post.type === 'lost' ? '寻物' : '招领'}</span><small>{post.isDemo ? '示例' : mine ? '我的发布' : '校园发布'}</small>{post.status === 'resolved' && <span className="community-tag">{doneLabel}</span>}</div><h3>{campusDisplayText(post.title)}</h3><span className="community-meta">{getRegionLabel(post.regionId)} · {displayTime(post.occurredAt)}</span></div></div>
        <p className="community-description">{campusDisplayText(post.description)}</p><div className="community-meta"><MapPin size={13} />{location?.name ?? '地点未收录'}{post.locationDetail ? ` · ${campusDisplayText(post.locationDetail)}` : ''}</div>
        <PostImageGallery paths={post.imagePaths} viewerId={currentUserId} label="物品照片" />
        <details className="community-details"><summary>查看照片与联系方式</summary>{post.image && <img className="lost-found-detail-photo" src={post.image} alt={`${campusDisplayText(post.title)}的详细照片`} />}<p><strong>联系／领取方式</strong><br />{campusDisplayText(post.contact)}</p>{post.isDemo && <small>这是一条示例信息，无真实物品和联系人。</small>}</details>
        <div className="community-card-actions"><button type="button" disabled={!location} onClick={() => onSelectLocation(post.locationId)}><MapPin size={14} />查看地点</button><button type="button" disabled={!location} onClick={() => onPlanRouteToLocation(post.locationId)}><Navigation size={14} />去这里</button></div>
        {mine && <div className="community-owner-actions">{!post.cloudReportId && <button type="button" disabled={saving} onClick={() => openForm(post)}><Pencil size={13} />编辑</button>}{(!post.cloudReportId || post.status === 'active') && <button type="button" disabled={saving} onClick={() => updateStatus(post)}><Check size={13} />{post.status === 'active' ? `标记${doneLabel}` : '重新开启'}</button>}<button type="button" disabled={saving} onClick={() => setDeleteId(post.id)} aria-label={`撤回${campusDisplayText(post.title)}`}><Trash2 size={13} /></button></div>}
        {deleteId === post.id && <div className="community-delete-confirm"><span>删除后无法恢复</span><button type="button" onClick={() => remove(post.id)}>确认删除</button><button type="button" onClick={() => setDeleteId(null)}>取消</button></div>}
      </article>
    }) : <div className="community-empty"><PackageSearch size={32} /><strong>{filter === 'mine' ? '还没有符合筛选的发布' : '暂时没有符合条件的物品'}</strong><p>可以调整地区、关键词或状态，也可以发布一条信息。</p><button className="community-primary" type="button" onClick={() => openForm()}>发布失物信息</button></div>}
  </div>
}
import { useBackLayer } from '../../app/useBackLayer.js'
