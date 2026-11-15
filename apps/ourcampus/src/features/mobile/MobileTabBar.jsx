import { House, MapPin, MessageCircle, UserRound } from 'lucide-react'

const tabs = [
  { id: 'canvas', label: '今天', Icon: House },
  { id: 'explore', label: '校园', Icon: MapPin },
  { id: 'hall', label: '社区', Icon: MessageCircle },
  { id: 'me', label: '我的', Icon: UserRound },
]

export function MobileTabBar({ activeTab, onChange }) {
  return (
    <nav className="mobile-tab-bar" aria-label="主导航">
      {tabs.map(({ id, label, Icon }) => (
        <button
          className={`mobile-tab-bar__item${activeTab === id ? ' is-active' : ''}`}
          type="button"
          key={id}
          aria-current={activeTab === id ? 'page' : undefined}
          onClick={() => onChange(id)}
        >
          <Icon aria-hidden="true" /><span>{label}</span>
        </button>
      ))}
    </nav>
  )
}
