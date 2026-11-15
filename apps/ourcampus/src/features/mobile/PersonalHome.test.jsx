import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import * as personal from './PersonalHome.jsx'
import { DEFAULT_PERSONAL_ARTWORK, EMPTY_PERSONAL_HOME } from '../../data/personalHome.js'

vi.mock('../../app/useBackLayer.js', () => ({ useBackLayer: () => {} }))

describe('Along saved local appearance preview', () => {
  it('shows saved local appearance with its audience and no private tools or account fields', () => {
    expect(personal.PersonalLocalPreviewContent).toBeTypeOf('function')
    const home = { ...EMPTY_PERSONAL_HOME, cover: 'data:image/jpeg;base64,YWJj', bio: '今天想去跑步', tags: ['摄影'] }
    const html = renderToStaticMarkup(<personal.PersonalLocalPreviewContent home={home} name="青禾" avatar="/public-avatar.webp" />)
    expect(html).toContain('本机效果预览 · 他人不可见')
    expect(html).toContain('data:image/jpeg;base64,YWJj')
    expect(html).toContain('今天想去跑步')
    expect(html).toContain('摄影')
    expect(html).toContain('/public-avatar.webp')
    expect(html).not.toMatch(/我的课表|我的收藏|常用路线|我的发布|登录邮箱|type="file"|<input/)
  })

  it('uses the botanical default only when no custom cover was saved', () => {
    const fallback = renderToStaticMarkup(<personal.Cover home={EMPTY_PERSONAL_HOME} />)
    expect(fallback).toContain(`src="${DEFAULT_PERSONAL_ARTWORK}"`)
    const html = renderToStaticMarkup(<personal.Cover home={{ ...EMPTY_PERSONAL_HOME, cover: 'data:image/png;base64,YWJj', coverX: 25, coverY: 75 }} />)
    expect(html).toContain('src="data:image/png;base64,YWJj"')
    expect(html).toContain('object-position:25% 75%')
    expect(html).not.toContain(DEFAULT_PERSONAL_ARTWORK)
  })
})
