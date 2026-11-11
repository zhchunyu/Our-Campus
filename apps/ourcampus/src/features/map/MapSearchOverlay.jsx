import { MapPin, Megaphone, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react'
import { CATEGORIES, CATEGORY_LABELS } from '../../domain/campus.js'

const categoryOptions = Object.values(CATEGORIES)
const SEARCH_RESULT_LIMIT = 8

function SearchResultIcon({ kind }) {
  if (kind === 'event') return <Megaphone size={13} />
  if (kind === 'service' || kind === 'activity') return <Sparkles size={13} />
  return <MapPin size={13} />
}

export function MapSearchOverlay({ query, category, results = [], onQueryChange, onCategoryChange, onSelectResult }) {
  const showResults = Boolean(query.trim())
  const visibleResults = results.slice(0, SEARCH_RESULT_LIMIT)

  return (
    <div className="map-search-overlay">
      <div className="map-search-stack">
        <div className={`map-search-control${query ? ' has-clear' : ''}`}>
          <label className="map-search-field">
            <Search size={17} aria-hidden="true" />
            <span className="sr-only">搜索校园地点</span>
            <input
              type="search"
              placeholder="搜索地点、服务或校园动态"
              value={query}
              onKeyDown={(event) => {
                if (event.key === 'Escape') onQueryChange('')
              }}
              onChange={(event) => onQueryChange(event.target.value)}
            />
            {!query && <span className="map-search-shortcut">⌘ K</span>}
          </label>
          {query && <button className="map-search-clear" type="button" onClick={() => onQueryChange('')} aria-label="清空搜索"><X size={14} /></button>}
        </div>
        {showResults && (
          <div className="map-search-results" role="listbox" aria-label="校园搜索结果">
            {visibleResults.length > 0 ? visibleResults.map((result) => (
              <button
                className="map-search-result"
                type="button"
                role="option"
                aria-selected="false"
                key={result.id}
                onClick={() => onSelectResult(result)}
              >
                <span className="map-search-result__icon"><SearchResultIcon kind={result.kind} /></span>
                <span className="map-search-result__copy"><strong>{result.title}</strong><small>{result.subtitle}</small></span>
              </button>
            )) : (
              <div className="map-search-empty" role="status">
                <strong>没有匹配结果</strong>
                <span>试试地点别名、服务关键词或校园热点名称。</span>
                <button type="button" onClick={() => onQueryChange('')}>清空搜索</button>
              </div>
            )}
            {results.length > SEARCH_RESULT_LIMIT && <small className="map-search-more">显示前 {SEARCH_RESULT_LIMIT} 项，请继续输入缩小范围。</small>}
          </div>
        )}
      </div>
      <label className="map-filter-select">
        <SlidersHorizontal size={15} aria-hidden="true" />
        <span className="sr-only">地点分类</span>
        <select value={category} onChange={(event) => onCategoryChange(event.target.value)}>
          {categoryOptions.map((option) => <option value={option} key={option}>{CATEGORY_LABELS[option]}</option>)}
        </select>
      </label>
    </div>
  )
}
