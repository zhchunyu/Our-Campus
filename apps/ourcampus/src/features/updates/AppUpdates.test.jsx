import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AppUpdateNotice } from './AppUpdateNotice.jsx'
import { AppUpdateSettings } from './AppUpdateSettings.jsx'

const release = { versionCode: 118, versionName: '1.18', notes: ['头像同步修复', '<script>not executable</script>'], sizeBytes: 45 * 1024 * 1024 }
const available = { supported: true, current: { versionCode: 117, versionName: '1.17' }, release, status: 'available', error: '', noticeVisible: true, busy: false, checkNow: vi.fn(), dismiss: vi.fn(), download: vi.fn() }
function elements(node, type) {
  if (!node || typeof node !== 'object') return []
  const children = Array.isArray(node) ? node : node.props?.children
  return [...(node.type === type ? [node] : []), ...(Array.isArray(children) ? children.flatMap((child) => elements(child, type)) : elements(children, type))]
}

describe('nonblocking app update presentation', () => {
  it('shows the version and release notes with later and download actions', () => {
    const html = renderToStaticMarkup(<AppUpdateNotice updates={available} />)
    expect(html).toContain('1.18')
    expect(html).toContain('头像同步修复')
    expect(html).toContain('稍后')
    expect(html).toContain('下载更新')
    expect(html).not.toContain('role="dialog"')
    expect(html).not.toContain('aria-modal')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
  })
  it('hides the banner for web previews, covered app pages, and dismissed releases', () => {
    expect(renderToStaticMarkup(<AppUpdateNotice updates={{ ...available, supported: false }} />)).toBe('')
    expect(renderToStaticMarkup(<AppUpdateNotice updates={available} covered />)).toBe('')
    expect(renderToStaticMarkup(<AppUpdateNotice updates={{ ...available, noticeVisible: false }} />)).toBe('')
    expect(renderToStaticMarkup(<AppUpdateNotice />)).toBe('')
  })
  it('binds user actions and disables repeat taps while busy', () => {
    const actions = { ...available, dismiss: vi.fn(), download: vi.fn() }
    const buttons = elements(AppUpdateNotice({ updates: actions }), 'button')
    buttons[0].props.onClick(); buttons[1].props.onClick()
    expect(actions.dismiss).toHaveBeenCalledTimes(1)
    expect(actions.download).toHaveBeenCalledTimes(1)
    expect(elements(AppUpdateNotice({ updates: { ...actions, busy: true } }), 'button').every((button) => button.props.disabled)).toBe(true)
  })
  it('keeps update controls out of website settings', () => {
    expect(renderToStaticMarkup(<AppUpdateSettings updates={{ ...available, supported: false }} />)).toBe('')
    expect(renderToStaticMarkup(<AppUpdateSettings />)).toBe('')
  })
  it('shows installed and available versions plus a manual check action', () => {
    const html = renderToStaticMarkup(<AppUpdateSettings updates={available} />)
    expect(html).toContain('1.17')
    expect(html).toContain('1.18')
    expect(html).toContain('检查更新')
    expect(html).toContain('下载更新')
    const actions = { ...available, checkNow: vi.fn(), download: vi.fn() }
    const buttons = elements(AppUpdateSettings({ updates: actions }), 'button')
    buttons[0].props.onClick(); buttons[1].props.onClick()
    expect(actions.checkNow).toHaveBeenCalledTimes(1)
    expect(actions.download).toHaveBeenCalledTimes(1)
  })
  it.each([
    ['checking', '正在检查'], ['current', '当前没有可用更新'], ['error', '检查失败，请重试'],
  ])('shows the manual %s result', (status, text) => {
    const updates = { ...available, status, release: null, error: status === 'error' ? text : '', busy: status === 'checking' }
    const html = renderToStaticMarkup(<AppUpdateSettings updates={updates} />)
    expect(html).toContain(text)
    expect(html).toContain('role="status"')
    if (updates.busy) expect(elements(AppUpdateSettings({ updates }), 'button')[0].props.disabled).toBe(true)
  })
  it('keeps download errors visible beside a retryable release', () => {
    const updates = { ...available, error: '无法打开更新下载，请重试' }
    const html = renderToStaticMarkup(<AppUpdateSettings updates={updates} />)
    expect(html).toContain(updates.error)
    expect(html).toContain('下载更新')
  })
})
