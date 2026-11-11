import { SearchX } from 'lucide-react'

export function EmptyState({ title = '没有找到匹配地点', description = '试试换一个关键词或清除筛选。', onReset }) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon"><SearchX size={18} /></div>
      <strong>{title}</strong>
      <p>{description}</p>
      {onReset && <button className="text-button" type="button" onClick={onReset}>清除筛选</button>}
    </div>
  )
}
