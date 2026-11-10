import React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LostFoundPanel } from './LostFoundPanel.jsx'

const user = '11111111-1111-4111-8111-111111111111'
const path = `${user}/22222222-2222-4222-8222-222222222222.jpg`
const post = { id: 'test-cloud', authorId: user, cloudReportId: 'test-cloud', type: 'found', title: '测试耳机',
  description: '白色外壳', contact: '前台', locationDetail: '一楼', locationId: 'library', regionId: 'teaching',
  occurredAt: '2026-10-25T04:00:00Z', createdAt: '2026-10-25T04:00:00Z', status: 'active', image: '', imagePaths: [path] }
const render = (posts) => renderToStaticMarkup(<LostFoundPanel posts={posts}
  locations={[{ id: 'library', name: '图书馆', category: 'learning' }]} regionId="all" filter="mine"
  currentUserId={user} cloudReady onFilterChange={() => {}} onRegionChange={() => {}} />)

describe('lost/found cloud photos', () => {
  it('renders a private photo gallery for cloud records on a second device', () => {
    const html = render([post])
    expect(html).toContain('aria-label="物品照片"')
    expect(html).toContain('正在加载照片')
    expect(html).not.toContain('object/public/post-images')
  })
  it('keeps legacy local single-photo records visible', () => {
    const html = render([{ ...post, cloudReportId: undefined, authorId: 'local-device', imagePaths: [], image: 'data:image/jpeg;base64,YWJj' }])
    expect(html).toContain('data:image/jpeg;base64,YWJj')
    expect(html).toContain('编辑')
  })
})
