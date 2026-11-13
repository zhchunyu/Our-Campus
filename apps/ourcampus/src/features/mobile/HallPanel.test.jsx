import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { HallPanel } from './HallPanel.jsx'

const me = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const imagePath = `${me}/33333333-3333-4333-8333-333333333333.jpg`
const noop = () => {}
const defaults = {
  messages: [], selectedRegionId: 'all', onRegionChange: noop, onSendMessage: noop,
  activeSection: 'chat', onSectionChange: noop, onCloseSection: noop,
  locations: [{ id: 'library', name: '图书馆', category: 'learning' }], hotspots: [], posts: [],
  lostFoundFilter: 'all', onLostFoundFilterChange: noop, onSubmitPost: noop,
  onPostStatusChange: noop, onDeletePost: noop, onSelectLocation: noop, onPlanRouteToLocation: noop,
  onOpenRestaurantReviews: noop, showLostFound: true, onLostFoundMapChange: noop,
  auth: { user: { id: me }, status: 'ready' },
  chat: { historyStatus: 'ready', connectionStatus: 'live', hasMore: false, retry: noop, loadOlder: noop },
  onOpenLogin: noop, information: { status: 'ready' }, onPublishInformation: noop,
  onSubmitAsInformation: noop, onStartLostFound: noop, onOpenMemberProfile: noop,
}
const render = (props = {}) => renderToStaticMarkup(<HallPanel {...defaults} {...props} />)
const message = (id, authorId, content, imagePaths = []) => ({ id, authorId,
  author: authorId === me ? '我的昵称' : '另一位同学', content, imagePaths,
  regionId: 'library', createdAt: '2026-11-12T06:00:00Z', time: '14:00' })

describe('community canvas presentation contracts', () => {
  it('keeps all community entry points and actual photo content without a decorative cover', () => {
    const html = render({ hotspots: [{ id: 'event-photo', title: '同学的校园照片', locationId: 'library',
      type: 'activity', startAt: '2026-11-12T04:00:00Z', imagePaths: [imagePath], isCloud: true }] })
    expect(html).toContain('aria-label="社区功能"')
    for (const label of ['聊天', '校园动态', '失物招领', '餐厅评价']) expect(html).toContain(label)
    expect(html).toContain('同学的校园照片')
    expect(html).toContain('aria-label="校园动态照片"')
    expect(html).toContain('正在加载照片')
    expect(html).not.toContain('campus-community-mood')
    expect(html).not.toContain('hall-life-card')
  })

  it('keeps guest chat gated and both text and image input disabled', () => {
    const html = render({ isFullscreen: true, auth: { user: null, status: 'ready' } })
    expect(html).toContain('登录后查看历史消息')
    expect(html).toContain('aria-label="添加聊天照片" disabled=""')
    expect(html).toMatch(/id="mobile-hall-message"[^>]*disabled=""/)
    expect(html).toContain('type="submit" disabled=""')
    expect(html).not.toContain('提交为动态')
  })

  it('preserves long text, photo galleries, and owner-only message actions', () => {
    const html = render({ isFullscreen: true, messages: [
      message('other', other, '第一行\n第二行 <script>'),
      message('mine', me, '', [imagePath]),
    ] })
    expect(html).toContain('第一行\n第二行 &lt;script&gt;')
    expect(html).toContain('is-own has-attachments')
    expect(html).toContain('aria-label="聊天照片"')
    expect(html).toContain('aria-label="查看另一位同学的主页"')
    expect(html.match(/>提交为动态<\/button>/g)).toHaveLength(1)
    expect(html.match(/>撤回<\/button>/g)).toHaveLength(1)
  })

  it('retains reconnect feedback and history pagination', () => {
    const html = render({ isFullscreen: true, chat: { ...defaults.chat, connectionStatus: 'reconnecting',
      error: '连接暂时中断', hasMore: true, loadingOlder: true } })
    expect(html).toContain('实时连接重试中，消息仍会定时同步')
    expect(html).toContain('连接暂时中断')
    expect(html).toContain('disabled="">加载中…</button>')
    expect(html).toContain('>重试</button>')
  })
})
