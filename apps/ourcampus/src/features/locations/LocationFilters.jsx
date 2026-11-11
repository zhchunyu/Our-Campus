import { Filter, Search } from 'lucide-react'
import { CATEGORIES, CATEGORY_LABELS } from '../../domain/campus.js'

const categories = [
  CATEGORIES.ALL,
  CATEGORIES.LEARNING,
  CATEGORIES.DINING,
  CATEGORIES.LIVING,
  CATEGORIES.SERVICE,
  CATEGORIES.TRANSPORT,
]

export function LocationFilters({ query, category, onQueryChange, onCategoryChange }) {
  return (
    <div className="filter-block">
      <div className="filter-block__topline">
        <div>
          <div className="eyebrow"><Filter size={13} /> 地点索引</div>
          <h2>找到校园里的每个去处</h2>
        </div>
        <span className="shortcut-hint">⌘ K</span>
      </div>

      <label className="search-field">
        <Search size={18} aria-hidden="true" />
        <span className="sr-only">搜索校园地点</span>
        <input
          type="search"
          placeholder="搜索地点、服务或关键词"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
        {query && (
          <button className="search-clear" type="button" onClick={() => onQueryChange('')} aria-label="清除搜索">
            ×
          </button>
        )}
      </label>

      <div className="category-strip" aria-label="地点分类">
        {categories.map((categoryOption) => (
          <button
            className={`category-button ${category === categoryOption ? 'is-active' : ''}`}
            key={categoryOption}
            type="button"
            onClick={() => onCategoryChange(categoryOption)}
          >
            {CATEGORY_LABELS[categoryOption]}
          </button>
        ))}
      </div>
    </div>
  )
}
