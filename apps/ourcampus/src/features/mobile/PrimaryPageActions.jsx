import { Bell, Flower2, Sparkles } from 'lucide-react'

export function PrimaryPageActions({ showAssistant, unread = 0, onOpenAssistant, onOpenMessages }) {
  const messages = <button className="primary-message" type="button" onClick={onOpenMessages} aria-label={`校园消息${unread ? `，${unread} 条未读` : ''}`}><Bell size={20} />{unread > 0 && <span>{unread > 99 ? '99+' : unread}</span>}</button>
  return <div className={`primary-page-actions${showAssistant ? ' primary-page-actions--map' : ''}`} aria-label="校园快捷入口">
    {showAssistant && <><div className="campus-map-brand"><strong>OurCampus</strong><span>首页</span></div><p className="campus-map-welcome"><Flower2 size={17} aria-hidden="true" />把校园走成喜欢的样子。</p></>}
    {showAssistant && <button className="primary-assistant" type="button" onClick={onOpenAssistant}><Sparkles size={17} />问问 AI</button>}
    {messages}
  </div>
}
