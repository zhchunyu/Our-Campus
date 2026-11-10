import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { HallPanel } from './HallPanel.jsx'
import { PersonalHome } from './PersonalHome.jsx'
import { MePanel } from './MePanel.jsx'
import { DEFAULT_SETTINGS } from '../../data/appSettings.js'

vi.mock('../../app/useBackLayer.js', () => ({ useBackLayer: () => {}, requestAppBack: () => {} }))
const userId = '11111111-1111-4111-8111-111111111111'
const authorId = '22222222-2222-4222-8222-222222222222'
const avatarUrl = 'https://example.supabase.co/storage/v1/object/public/avatars/22222222-2222-4222-8222-222222222222/avatar.jpg'
const hallProps = {
  messages: [{ id: 'message-1', authorId, author: '白云同学', authorAvatarUrl: avatarUrl, content: '你好', regionId: 'living', createdAt: '2026-10-21T08:00:00Z', time: '16:00' }],
  activeSection: 'chat', selectedRegionId: 'all', isFullscreen: true,
  auth: { user: { id: userId }, status: 'ready' },
  chat: { historyStatus: 'ready', connectionStatus: 'live', hasMore: false },
  information: { unread: 0 }, locations: [], hotspots: [], posts: [],
  onOpenMemberProfile: () => {},
}

afterEach(() => { vi.unstubAllGlobals() })
describe('shared public profile presentation', () => {
  it('renders the author image and an accessible profile entry in hall messages', () => {
    const html = renderToStaticMarkup(<HallPanel {...hallProps} />)
    expect(html).toContain(`src="${avatarUrl}"`)
    expect(html).toContain('aria-label="查看白云同学的主页"')
  })

  it('does not present the old local avatar as an already synced account avatar', () => {
    const legacy = 'data:image/jpeg;base64,bG9jYWwtYXZhdGFy'
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ avatar: legacy, bio: '仅本机签名' }) })
    const html = renderToStaticMarkup(<PersonalHome auth={{ user: { id: userId }, profile: { user_id: userId, nickname: '同学', avatar_path: null } }} />)
    const identity = html.match(/<span[^>]*personal-identity__avatar[^>]*>[\s\S]*?<\/span>/)?.[0] ?? ''
    expect(identity).not.toContain(legacy)
    expect(html).toContain('同步本机头像')
    expect(html).toContain('查看公开主页')
  })
})

const meProps = {
  role: 'student', settings: DEFAULT_SETTINGS, locations: [], events: [],
  auth: { user: { id: userId }, profile: { user_id: userId, nickname: '同学', avatar_path: null } },
  updates: { supported: true, current: { versionName: '1.18' }, status: 'current' },
}

describe('compact personal home', () => {
  it('keeps four real shortcuts without repeated content placeholders', () => {
    const html = renderToStaticMarkup(<MePanel {...meProps} />)
    const shortcuts = html.match(/<section[^>]*aria-label="个人快捷入口"[\s\S]*?<\/section>/)?.[0] ?? ''
    expect((shortcuts.match(/<button/g) ?? [])).toHaveLength(4)
    for (const label of ['我的课表', '我的发布', '我的收藏', '常用路线']) expect(shortcuts).toContain(label)
    expect(html).not.toContain('主页内容分类')
    expect(html).not.toContain('看看你发布过什么')
    expect(html).not.toContain('aria-label="收藏和常用路线"')
    expect(html).toContain('aria-label="常用工具"')
  })

  it('keeps updates and map settings while restricting management to managers', () => {
    const ordinary = renderToStaticMarkup(<MePanel {...meProps} />)
    expect(ordinary).toContain('检查更新')
    expect(ordinary).toContain('默认路线策略')
    expect(ordinary).not.toContain('校园信息审核')
    expect(ordinary).not.toContain('餐厅窗口管理')
    const manager = renderToStaticMarkup(<MePanel {...meProps} role="manager" />)
    expect(manager).toContain('校园信息审核')
    expect(manager).toContain('餐厅窗口管理')
    expect(manager).toContain('地点维护')
  })
})
