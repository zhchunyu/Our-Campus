import { House, LayoutGrid, UsersRound, UserRound } from 'lucide-react'

const tabs = [
  { id: 'map', label: '首页', Icon: House },
  { id: 'explore', label: '服务', Icon: LayoutGrid },
  { id: 'hall', label: '社区', Icon: UsersRound },
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
          <Icon size={24} strokeWidth={activeTab === id ? 2 : 1.6} aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  )
}
