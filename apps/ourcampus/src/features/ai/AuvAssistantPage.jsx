import '../mobile/inner-canvas.css'
import { campusDisplayText } from '../../data/campusPresentation.js'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ArrowUp, ChevronRight, LogIn, MapPin, Navigation, RotateCcw, Sparkles, X } from 'lucide-react'
import { requestAuv } from '../../data/auvClient.js'

const typeLabels = { safety: '安全隐患', congestion: '人流拥挤', service: '设施与服务', notice: '校园通知' }
const prompts = { chat: ['查询图书馆开放时间', '查看谷园餐厅服务信息', '查询校园办事入口'].map(campusDisplayText), extract: ['谷园餐厅现在排队很久', '崇学楼门前正在施工', '9号公寓楼下路灯坏了'].map(campusDisplayText) }

export function AuvAssistantPage({ auth, locations, getContext, initialLocationId = '', initialPurpose = '', initialDraft = '', onClose, onOpenLogin, onSelectLocation, onPlanRouteToLocation }) {
  useBackLayer(true, onClose, 80)
  const [mode, setMode] = useState('chat')
  const timetablePlanning = initialPurpose === 'timetable'
  const [draft, setDraft] = useState(initialDraft)
  const initialTarget = locations.some((location) => location.id === initialLocationId) ? initialLocationId : ''
  const [locationId, setLocationId] = useState(initialTarget)
  const [messages, setMessages] = useState([])
  const [busy, setBusy] = useState(false)
  const [pendingText, setPendingText] = useState('')
  const [error, setError] = useState('')
  const pageRef = useRef(null)
  const backRef = useRef(null)
  const feedRef = useRef(null)
  const controllerRef = useRef(null)
  const requestVersion = useRef(0)
  const userId = auth.user?.id
  useEffect(() => { setLocationId(initialTarget) }, [userId, initialTarget])

  useEffect(() => {
    requestVersion.current++
    controllerRef.current?.abort()
    setMessages([]); setDraft(initialDraft); setError(''); setBusy(false); setPendingText('')
  }, [userId, initialDraft])
  useEffect(() => {
    const previous = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    backRef.current?.focus()
    return () => { requestVersion.current++; controllerRef.current?.abort(); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus?.() }
  }, [])
  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
      if (event.key !== 'Tab') return
      const controls = [...(pageRef.current?.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled)') ?? [])]
      const first = controls[0]; const last = controls.at(-1)
      if (!first || !last) return
      if (event.shiftKey && (document.activeElement === first || !pageRef.current.contains(document.activeElement))) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (document.activeElement === last || !pageRef.current.contains(document.activeElement))) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])
  useEffect(() => { if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight }, [messages, busy, error])

  const send = async (event) => {
    event.preventDefault()
    if (!draft.trim() || busy || !userId) return
    const text = draft.trim()
    const version = ++requestVersion.current
    const controller = new AbortController()
    controllerRef.current = controller
    setBusy(true); setError(''); setPendingText(text)
    try {
      const result = await requestAuv({ text, mode, locationId, context: getContext?.(), expectedUserId: userId, history: messages.filter((item) => item.mode === 'chat').slice(-6).map(({ role, content }) => ({ role, content: content.slice(0, 600) })) }, controller.signal)
      if (version !== requestVersion.current || controller.signal.aborted) return
      setMessages((current) => [...current, { id: `${version}-user`, role: 'user', content: text, mode }, { id: `${version}-assistant`, role: 'assistant', content: result.text, mode, result }])
      setDraft('')
    } catch (failure) { if (version === requestVersion.current && !controller.signal.aborted) setError(failure.message || '请求失败，请稍后重试。') }
    finally { if (version === requestVersion.current) { setBusy(false); setPendingText('') } }
  }
  const cancel = () => { requestVersion.current++; controllerRef.current?.abort(); setBusy(false); setPendingText('') }

  return createPortal(<section className="auv-page" ref={pageRef} role="dialog" aria-modal="true" aria-labelledby="auv-title">
    <div className="auv-page__frame">
      <header className="auv-page__header">
        <button ref={backRef} type="button" aria-label="返回上一页" onClick={onClose}><ArrowLeft size={21} /></button>
        <div><h1 id="auv-title">AUV 校园助手</h1><span>校园信息建议 · 事件分析</span></div>
        <button type="button" aria-label="开始新对话" disabled={busy || !messages.length} onClick={() => { setMessages([]); setError('') }}><RotateCcw size={18} /></button>
      </header>
      <div className="auv-mode-switch" role="group" aria-label="AI 功能选择">{[{ id: 'chat', label: '校园建议' }, { id: 'extract', label: '事件分析' }].map((item) => <button key={item.id} type="button" disabled={busy} aria-pressed={mode === item.id} className={mode === item.id ? 'is-active' : ''} onClick={() => { setMode(item.id); setError('') }}>{item.label}</button>)}</div>
      <main className="auv-feed" ref={feedRef} aria-label="与校园助手的对话">
        {!messages.length && !busy && <section className="auv-welcome"><span><Sparkles size={30} /></span><h2>{timetablePlanning && mode === 'chat' ? '课表规划' : mode === 'extract' ? '整理事件草稿' : '校园信息查询'}</h2><p>{mode === 'extract' ? '填写地点及排队、施工或故障情况，生成待确认的事件草稿。' : timetablePlanning ? '发送时关联当前课表，可补充学习目标或时间要求。' : '输入地点、服务或校园情况，获取相关信息和建议。'}</p>{(!timetablePlanning || mode !== 'chat') && <div>{prompts[mode].map((prompt) => <button type="button" key={prompt} disabled={!userId} onClick={() => setDraft(prompt)}>{prompt}<ChevronRight size={15} /></button>)}</div>}</section>}
        {!userId && <div className="auv-login"><LogIn size={22} /><strong>登录后开始对话</strong><p>使用你已有的校园软件账号。</p><button type="button" disabled={auth.status === 'loading'} onClick={onOpenLogin}>登录 / 注册</button></div>}
        <div className="auv-messages" aria-live="polite">{messages.map((message) => <article key={message.id} className={`auv-message auv-message--${message.role}`}>
          <span className="auv-message__author">{message.role === 'user' ? '我' : (message.result.generated_by === 'auv' || message.result.generated_by === 'greeting_rule') ? 'AUV' : message.result.kind === 'emergency' ? '应急提示' : '功能提示'}</span>
          <p>{campusDisplayText(message.content)}</p>
          {message.result?.event && <div className="auv-event"><strong>事件分析草稿 · {typeLabels[message.result.event.type]}</strong><span>地点：{campusDisplayText(message.result.event.building_name) ?? (message.result.event.location_status === 'ambiguous' ? '涉及多个地点，请手动选择' : '未确认，可在下方关联地点')}</span>{message.result.event.floor && <span>楼层：{message.result.event.floor}</span>}{message.result.event.advice && <p>{campusDisplayText(message.result.event.advice)}</p>}<small>基于你的描述整理，尚未发布或核实。</small></div>}
          {message.result?.locations?.map((candidate) => {
            const location = locations.find((item) => item.id === candidate.id)
            if (!location) return null
            return <div className="auv-place" key={location.id}><strong><MapPin size={14} />{location.name}</strong><div><button type="button" onClick={() => onSelectLocation(location.id)}>查看地点</button><button type="button" onClick={() => onPlanRouteToLocation(location.id)}><Navigation size={13} />去这里</button></div></div>
          })}
          {message.result?.live_context_available === false && <small className="auv-context-note">当前未能取得已核实的校园动态。</small>}
          {message.result?.personal_context_available && <small className="auv-context-note">已参考当前可获取的校园发布和个人相关信息。</small>}
        </article>)}</div>
        {busy && <><article className="auv-message auv-message--user"><span className="auv-message__author">我</span><p>{campusDisplayText(pendingText)}</p></article><p className="auv-pending" role="status"><Sparkles size={15} />正在生成回复…</p></>}
        {error && <p className="auv-error" role="alert">{error} 输入内容已保留。</p>}
      </main>
      <form className={`auv-composer${timetablePlanning && mode === 'chat' ? ' auv-composer--timetable' : ''}`} onSubmit={send}>
        <label className="auv-location-label" htmlFor="auv-location">关联地点（可选）<select id="auv-location" value={locationId} disabled={!userId || busy} onChange={(event) => setLocationId(event.target.value)}><option value="">由文字匹配地点</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
        <div className="auv-input-row"><label className="sr-only" htmlFor="auv-input">发送给校园助手的内容</label><textarea id="auv-input" rows={2} maxLength={1000} disabled={!userId || busy} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={mode === 'extract' ? '描述地点和发生的情况…' : '输入校园相关问题…'} />{busy ? <button type="button" className="auv-send" aria-label="取消等待" onClick={cancel}><X size={21} /></button> : <button type="submit" className="auv-send" disabled={!userId || !draft.trim()} aria-label="发送给 AUV"><ArrowUp size={21} /></button>}</div>
        <p>AI 建议供参考；缺少数据时无法确认实时人流与开放时间。</p>
      </form>
    </div>
  </section>, document.body)
}
import { useBackLayer } from '../../app/useBackLayer.js'
