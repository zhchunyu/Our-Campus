const tabs = [
  { id: 'canvas', label: '首页' },
  { id: 'explore', label: '办事' },
  { id: 'hall', label: '社区' },
  { id: 'me', label: '我的' },
]

export function MobileTabBar({ activeTab, onChange }) {
  return (
    <nav className="mobile-tab-bar" aria-label="主导航">
      {tabs.map(({ id, label }) => (
        <button
          className={`mobile-tab-bar__item${activeTab === id ? ' is-active' : ''}`}
          type="button"
          key={id}
          aria-current={activeTab === id ? 'page' : undefined}
          onClick={() => onChange(id)}
        >
          <span>{label}</span>
        </button>
      ))}
    </nav>
  )
}
