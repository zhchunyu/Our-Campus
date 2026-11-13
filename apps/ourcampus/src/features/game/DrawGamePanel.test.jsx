import React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DrawGamePanel } from './DrawGamePanel.jsx'

const auth = { user: { id: '11111111-1111-4111-8111-111111111111' }, profile: { nickname: '小禾', avatar_path: null } }

describe('draw game panel', () => {
  it('asks guests to log in first', () => {
    const html = renderToStaticMarkup(<DrawGamePanel regionId="all" regionLabel="全部地区" auth={{ user: null, profile: null }} onOpenLogin={() => {}} />)
    expect(html).toContain('你画我猜')
    expect(html).toContain('登录 / 注册')
  })

  it('renders the table shell for a logged-in player', () => {
    const html = renderToStaticMarkup(<DrawGamePanel regionId="teaching" regionLabel="教学区" auth={auth} onOpenLogin={() => {}} />)
    expect(html).toContain('你画我猜 · 教学区')
    expect(html).toContain('还没有开始')
    expect(html).toContain('猜对的同学会上榜')
    expect(html).toContain('aria-label="画布：观战"')
  })
})
