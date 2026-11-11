import { RefreshCw } from 'lucide-react'
import './appUpdates.css'

export function AppUpdateSettings({ updates }) {
  if (!updates?.supported) return null
  const { current, release, status, busy, error, checkNow, download } = updates
  const message = status === 'checking' ? '正在检查更新…'
    : status === 'current' ? '当前没有可用更新'
      : status === 'available' && release ? `发现新版本 ${release.versionName}`
        : status === 'error' ? error || '检查失败，请重试'
          : '可主动检查是否有可用的新版本'
  return (
    <section className="app-update-settings" aria-label="版本与更新">
      <div className="app-update-settings__heading"><RefreshCw size={17} aria-hidden="true" /><strong>版本与更新</strong></div>
      <p className="app-update-installed">{current ? `当前版本 ${current.versionName}` : '本机版本暂未读取'}</p>
      <p className="app-update-result" role="status" aria-live="polite">{message}</p>
      {release && status === 'available' && release.notes.length > 0 && <ul className="app-update-notes">{release.notes.map((note, index) => <li key={index}>{note}</li>)}</ul>}
      {error && status !== 'error' && <p className="app-update-error" role="status">{error}</p>}
      <div className="app-update-actions">
        <button type="button" className="app-update-secondary" disabled={busy} onClick={checkNow}>{status === 'checking' ? '正在检查…' : status === 'error' ? '重试检查' : '检查更新'}</button>
        {release && status === 'available' && <button type="button" className="app-update-primary" disabled={busy} onClick={download}>{busy ? '正在打开…' : '下载更新'}</button>}
      </div>
    </section>
  )
}
