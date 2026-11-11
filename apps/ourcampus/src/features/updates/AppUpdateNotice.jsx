import { Download } from 'lucide-react'
import './appUpdates.css'

export function AppUpdateNotice({ updates, covered = false }) {
  if (!updates?.supported || !updates.noticeVisible || !updates.release || covered) return null
  const { release, busy, error, dismiss, download } = updates
  return (
    <aside className="app-update-notice" aria-label="应用更新">
      <div className="app-update-notice__heading" role="status" aria-live="polite"><Download size={18} aria-hidden="true" /><strong>发现新版本 {release.versionName}</strong></div>
      {release.notes.length > 0 && <ul className="app-update-notes">{release.notes.map((note, index) => <li key={index}>{note}</li>)}</ul>}
      <p className="app-update-hint">下载后按系统提示安装</p>
      {error && <p className="app-update-error" role="status">{error}</p>}
      <div className="app-update-actions">
        <button type="button" className="app-update-secondary" disabled={busy} onClick={dismiss}>稍后</button>
        <button type="button" className="app-update-primary" disabled={busy} onClick={download}>{busy ? '正在打开…' : '下载更新'}</button>
      </div>
    </aside>
  )
}
