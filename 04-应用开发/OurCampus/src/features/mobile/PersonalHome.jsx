import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bell, CalendarDays, Camera, Check, ChevronRight, FileText, ImagePlus, LockKeyhole, LogOut, Pencil, Route, Settings2, Star, X } from 'lucide-react'
import { describeServerError } from '../../data/supabaseClient.js'
import { DEFAULT_PERSONAL_ARTWORK, loadPersonalHome, resizePersonalImage } from '../../data/personalHome.js'
import { getAvatarUrl } from '../../data/memberProfiles.js'
import { describeAppearanceError, savePersonalAppearance } from '../../data/personalAppearance.js'
import { ProfileAvatar } from './ProfileAvatar.jsx'
import { useBackLayer } from '../../app/useBackLayer.js'
import { CampusSticker } from './CampusSticker.jsx'

const THEMES = [
  ['forest', '森林绿'], ['coral', '珊瑚橙'], ['sunny', '奶油黄'], ['lavender', '浅紫'],
]

function Cover({ home, children }) {
  return <div className={`personal-cover personal-theme--${home.theme}${home.motion ? ' has-motion' : ''}`}>
    <img src={home.cover || DEFAULT_PERSONAL_ARTWORK} alt={home.cover ? '个人主页封面' : '向日葵与小猫默认封面'} style={{ objectPosition: `${home.coverX}% ${home.coverY}%` }} />
    {children}
  </div>
}

export function PersonalHome({ auth, onBeforeLogout, onOpenLogin, onOpenMessages, unreadCount = 0, onOpenTimetable, onOpenMyPublications, onOpenFavorites, onOpenRoutes, activeCollection, collectionPanelId, onOpenMemberProfile }) {
  const userId = auth.user?.id ?? null
  const [home, setHome] = useState(() => loadPersonalHome(userId))
  const [draft, setDraft] = useState(home)
  const [avatarDraft, setAvatarDraft] = useState(null)
  const [sheet, setSheet] = useState(null)
  const [nickname, setNickname] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [discardPrompt, setDiscardPrompt] = useState(false)
  const dialogRef = useRef(null)
  const ownerRef = useRef(userId)
  const mountedRef = useRef(true)
  ownerRef.current = userId
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])
  const isCurrent = () => mountedRef.current && ownerRef.current === userId
  const cloudAvatar = userId ? getAvatarUrl(auth.profile?.avatar_path) : ''
  const avatarReady = Boolean(auth.profile?.user_id === userId)
  const name = auth.profile?.nickname || auth.user?.user_metadata?.nickname || (userId ? '校园同学' : '')
  const hasDraftChanges = sheet === 'decorate' && (avatarDraft !== null || JSON.stringify({ ...draft, avatar: '' }) !== JSON.stringify({ ...home, avatar: '' }))

  const closeSheet = () => {
    if (busy) return
    if (discardPrompt) { setDiscardPrompt(false); return }
    if (hasDraftChanges) { setDiscardPrompt(true); return }
    setSheet(null)
    setDiscardPrompt(false)
    setNotice('')
  }
  useBackLayer(Boolean(sheet), closeSheet, 125)

  useEffect(() => {
    if (!sheet) return undefined
    const previousFocus = document.activeElement
    const root = document.getElementById('root')
    const wasInert = root?.inert
    if (root) root.inert = true
    dialogRef.current?.focus()
    const trapFocus = (event) => {
      if (event.key !== 'Tab') return
      const elements = [...(dialogRef.current?.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex="0"]') ?? [])].filter((element) => element.getClientRects().length > 0)
      if (!elements.length) { event.preventDefault(); return }
      const first = elements[0]
      const last = elements.at(-1)
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', trapFocus)
    return () => {
      document.removeEventListener('keydown', trapFocus)
      if (root) root.inert = wasInert
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [sheet])

  useEffect(() => {
    const updateVisibility = () => document.documentElement.toggleAttribute('data-personal-home-hidden', document.hidden)
    document.addEventListener('visibilitychange', updateVisibility)
    updateVisibility()
    return () => { document.removeEventListener('visibilitychange', updateVisibility); document.documentElement.removeAttribute('data-personal-home-hidden') }
  }, [])

  const openDecorate = () => {
    if (!userId) { onOpenLogin(); return }
    setDraft(home)
    setAvatarDraft(null)
    setNotice('')
    setDiscardPrompt(false)
    setSheet('decorate')
  }
  const openAccount = () => {
    if (!userId) { onOpenLogin(); return }
    setNickname(name)
    setNotice('')
    setSheet('account')
  }
  const saveAvatar = async (image) => {
    if (busy || !avatarReady) return
    setBusy(true)
    setNotice('')
    try {
      const result = await savePersonalAppearance({ userId, home, avatarImage: image, updateAvatar: auth.updateAvatar, isCurrent })
      if (!isCurrent()) return
      setHome(result.home)
      setNotice(image ? '头像已同步到大厅和公开主页' : '头像已恢复默认并同步')
    } catch (error) {
      if (isCurrent()) setNotice(describeAppearanceError(error, '头像未能同步，请重试'))
    } finally { if (isCurrent()) setBusy(false) }
  }
  const readImage = async (file, kind, staged) => {
    if (!file || busy || (kind === 'avatar' && !avatarReady)) return
    setBusy(true)
    setNotice('')
    try {
      const image = await resizePersonalImage(file, kind === 'avatar' ? 480 : 1280)
      if (!isCurrent()) return
      if (staged) {
        if (kind === 'avatar') setAvatarDraft(image)
        else setDraft((value) => ({ ...value, [kind]: image }))
      } else {
        const result = await savePersonalAppearance({ userId, home, avatarImage: image, updateAvatar: auth.updateAvatar, isCurrent })
        if (!isCurrent()) return
        setHome(result.home)
        setNotice('头像已同步到大厅和公开主页')
      }
    } catch (error) { if (isCurrent()) setNotice(describeAppearanceError(error, '图片处理或同步失败，请重试')) }
    finally { if (isCurrent()) setBusy(false) }
  }
  const saveDecor = async () => {
    if (busy || (avatarDraft !== null && !avatarReady)) return
    setBusy(true)
    setNotice('')
    try {
      const result = await savePersonalAppearance({ userId, home: draft, avatarImage: avatarDraft, updateAvatar: auth.updateAvatar, isCurrent })
      if (!isCurrent()) return
      setHome(result.home)
      setAvatarDraft(null)
      setSheet(null)
      setDiscardPrompt(false)
      setNotice(result.avatarSynced ? '头像已同步，其他装扮保存在本机' : '装扮已保存在本机')
    } catch (error) {
      if (isCurrent()) {
        if (error.avatarSynced) { setAvatarDraft(null); setDraft((value) => ({ ...value, avatar: '' })) }
        setNotice(describeAppearanceError(error, '保存失败，请重试'))
      }
    } finally { if (isCurrent()) setBusy(false) }
  }
  const changeNickname = async (event) => {
    event.preventDefault()
    if (!nickname.trim() || [...nickname.trim()].length > 40) { setNotice('昵称请填写 1–40 个字'); return }
    setBusy(true)
    setNotice('')
    try { await auth.updateNickname(nickname); setNotice('昵称已更新') }
    catch (error) { setNotice(describeServerError(error, '昵称保存失败，请重试')) }
    finally { setBusy(false) }
  }
  const logout = async () => {
    setBusy(true)
    setNotice('')
    try { await onBeforeLogout?.(); await auth.logout(); setSheet(null) }
    catch (error) { setNotice(describeServerError(error, '退出失败，请重试')) }
    finally { setBusy(false) }
  }

  return <>
    <header className="personal-topbar"><div><strong>OurCampus</strong><span>我的</span></div><div className="personal-topbar__actions"><button type="button" aria-label="打开消息中心" onClick={onOpenMessages}><Bell size={22} />{unreadCount > 0 && <i aria-label={`${unreadCount}条未读消息`} />}</button><button type="button" aria-label="账户设置" onClick={openAccount}><Settings2 size={22} /></button></div></header>
    <div className={`personal-home personal-theme--${home.theme}`}>
      <Cover home={home}><button className="personal-cover__change" type="button" onClick={openDecorate}><Pencil size={15} />更换封面</button></Cover>
      <div className="personal-identity">
        <ProfileAvatar src={cloudAvatar} name={name} className="personal-avatar personal-identity__avatar" />
        <div className="personal-identity__row"><div><h2>{userId ? name : '你的校园空间'}</h2><p>{userId ? home.bio || '写一句话，介绍现在的自己。' : '登录后设置头像、封面和签名。'}</p></div>{userId && <button className="personal-identity__decorate" type="button" onClick={openDecorate}>装扮主页</button>}</div>
        {userId && home.tags.length > 0 && <div className="personal-tags">{home.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
        <div className="personal-identity__foot">{userId ? <><span><LockKeyhole size={14} />封面与签名 · 仅自己可见</span><button type="button" onClick={() => onOpenMemberProfile?.(userId)}>查看公开主页 <ChevronRight size={15} /></button></> : <button className="personal-login-button" type="button" onClick={onOpenLogin}>登录 / 注册 <ChevronRight size={17} /></button>}</div>
      </div>

      {userId && home.avatar && !auth.profile?.avatar_path && <div className="personal-local-avatar"><p>旧版头像仍保存在此设备，可同步到大厅。</p><button type="button" disabled={busy || !avatarReady} onClick={() => saveAvatar(home.avatar)}>同步本机头像</button></div>}

      <section className="personal-private" aria-label="个人快捷入口"><div className="personal-section-label"><LockKeyhole size={14} />只对自己可见</div><div className="personal-shortcuts">
        <button type="button" onClick={onOpenTimetable}><CampusSticker Icon={CalendarDays} tone="sunny" /><span>我的课表</span></button>
        <button type="button" onClick={onOpenMyPublications}><CampusSticker Icon={FileText} tone="coral" /><span>我的发布</span></button>
        <button type="button" onClick={onOpenFavorites} aria-expanded={activeCollection === 'favorites'} aria-controls={activeCollection === 'favorites' ? collectionPanelId : undefined}><CampusSticker Icon={Star} tone="mint" /><span>我的收藏</span></button>
        <button type="button" onClick={onOpenRoutes} aria-expanded={activeCollection === 'routes'} aria-controls={activeCollection === 'routes' ? collectionPanelId : undefined}><CampusSticker Icon={Route} tone="lavender" /><span>常用路线</span></button>
      </div></section>

    </div>

    {!sheet && (notice || auth.error) && <p className="personal-home__notice" role="status">{notice || auth.error}{auth.error && <button type="button" onClick={() => auth.refreshProfile().catch(() => setNotice('资料加载失败，请稍后重试'))}>重试</button>}</p>}
    {sheet && createPortal(<div className="personal-sheet-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeSheet() }}><section ref={dialogRef} tabIndex={-1} className={`personal-sheet personal-sheet--${sheet}`} role="dialog" aria-modal="true" aria-label={sheet === 'decorate' ? '装扮主页' : '账户设置'}>
      <>

        <header className="personal-sheet__header"><span className="personal-sheet__handle" aria-hidden="true" /><h2>{sheet === 'decorate' ? '装扮主页' : '账户设置'}</h2><button type="button" aria-label="关闭" onClick={closeSheet}><X size={22} /></button></header>
        {sheet === 'decorate' ? <><div className="personal-sheet__scroll" inert={busy}><Cover home={draft}><ProfileAvatar src={avatarDraft === null ? cloudAvatar : avatarDraft} name={name} className="personal-avatar personal-sheet__preview-avatar" /></Cover><div className="personal-sheet__photo-actions"><label><ImagePlus size={19} />选择封面<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => { readImage(event.target.files?.[0], 'cover', true); event.target.value = '' }} /></label><label><Camera size={19} />设置头像<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || !avatarReady} onChange={(event) => { readImage(event.target.files?.[0], 'avatar', true); event.target.value = '' }} /></label></div><div className="personal-sheet__text-actions">{draft.cover && <button type="button" onClick={() => setDraft({ ...draft, cover: '' })}>恢复默认封面</button>}{(avatarDraft === null ? auth.profile?.avatar_path : avatarDraft) && <button type="button" onClick={() => setAvatarDraft('')}>恢复默认头像</button>}</div>{draft.cover && <div className="personal-focus"><label>封面横向焦点 <input type="range" min="0" max="100" value={draft.coverX} onChange={(event) => setDraft({ ...draft, coverX: Number(event.target.value) })} /></label><label>封面纵向焦点 <input type="range" min="0" max="100" value={draft.coverY} onChange={(event) => setDraft({ ...draft, coverY: Number(event.target.value) })} /></label></div>}<p className="personal-sheet__hint">头像保存后同步到大厅与公开主页。封面按 2:1 展示，仅保存在本机。</p>
          <div className="personal-sheet__group"><h3>个人资料</h3><label>签名<input type="text" maxLength={40} value={draft.bio} placeholder="写一句现在的你" onChange={(event) => setDraft({ ...draft, bio: event.target.value })} /></label><label>兴趣标签 <small>最多 3 个，用逗号分开</small><input type="text" maxLength={32} value={draft.tags.join('，')} placeholder="例如：校园漫游，图书馆" onChange={(event) => setDraft({ ...draft, tags: event.target.value.split(/[，,、]/).map((tag) => tag.trim()).slice(0, 3) })} /></label><p className="personal-sheet__hint">昵称可在账户设置中修改。</p></div>
          <div className="personal-sheet__group"><h3>我的配色</h3><div className="personal-theme-list">{THEMES.map(([id, label]) => <button type="button" className={`personal-theme-choice personal-theme-choice--${id}${draft.theme === id ? ' is-active' : ''}`} aria-pressed={draft.theme === id} key={id} onClick={() => setDraft({ ...draft, theme: id })}><span>{draft.theme === id && <Check size={18} />}</span><small>{label}</small></button>)}</div></div>
          <div className="personal-sheet__group"><h3>封面动效</h3><div className="personal-motion-options"><button type="button" className={!draft.motion ? 'is-active' : ''} aria-pressed={!draft.motion} onClick={() => setDraft({ ...draft, motion: false })}>静止<small>保持原图</small></button><button type="button" className={draft.motion ? 'is-active' : ''} aria-pressed={draft.motion} onClick={() => setDraft({ ...draft, motion: true })}>轻浮<small>缓慢浮动，不影响阅读</small></button></div></div>
          <div className="personal-sheet__group personal-sheet__privacy"><h3>谁可以访问</h3><p><LockKeyhole size={17} />装扮仅自己可见</p><small>公开主页展示昵称、云端头像和未撤回的大厅发言；封面、签名和兴趣标签仅保存在本机。</small></div>{notice && <p className="personal-sheet__notice" role="status">{notice}</p>}</div><div className="personal-sheet__footer"><button type="button" disabled={busy} onClick={closeSheet}>取消</button><button type="button" disabled={busy || (avatarDraft !== null && !avatarReady)} onClick={saveDecor}>{busy ? '保存中…' : '保存装扮'}</button></div></> : <div className="personal-sheet__scroll personal-account" inert={busy}><div className="personal-account__avatar"><ProfileAvatar src={cloudAvatar} name={name} className="personal-avatar" /><div><strong>头像</strong><small>同步到大厅和公开主页</small></div><label>设置头像<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || !avatarReady} onChange={(event) => { readImage(event.target.files?.[0], 'avatar', false); event.target.value = '' }} /></label></div>{(auth.profile?.avatar_path || home.avatar) && <button className="personal-account__remove" type="button" disabled={busy || !avatarReady} onClick={() => saveAvatar('')}>恢复默认头像</button>}{home.avatar && !auth.profile?.avatar_path && <div className="personal-local-avatar"><ProfileAvatar src={home.avatar} name={name} className="personal-avatar" /><p>这台设备有旧版头像，尚未同步。</p><button type="button" disabled={busy || !avatarReady} onClick={() => saveAvatar(home.avatar)}>同步本机头像</button></div>}<form className="personal-account__nickname" onSubmit={changeNickname}><label htmlFor="personal-nickname">昵称</label><div><input id="personal-nickname" maxLength={40} value={nickname} disabled={busy} onChange={(event) => setNickname(event.target.value)} /><button type="submit" disabled={busy}><Pencil size={15} />保存昵称</button></div></form><div className="personal-account__email"><small>登录邮箱</small><span>{auth.user?.email}</span></div>{(notice || auth.error) && <p className="personal-sheet__notice" role="status">{notice || auth.error}</p>}<button type="button" className="personal-account__logout" disabled={busy} onClick={logout}><LogOut size={18} />退出登录</button></div>}
      </>
      {discardPrompt && <div className="personal-discard"><p>装扮还没有保存，要放弃本次修改吗？</p><div><button type="button" onClick={() => setDiscardPrompt(false)}>继续编辑</button><button type="button" onClick={() => { setDiscardPrompt(false); setSheet(null); setNotice('') }}>放弃修改</button></div></div>}
    </section></div>, document.body)}
  </>
}
