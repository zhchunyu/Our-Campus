import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import * as reviews from './RestaurantReviewsPage.jsx'

vi.mock('../../app/useBackLayer.js', () => ({ useBackLayer: () => {} }))
vi.mock('../../data/memberProfiles.js', () => ({ getAvatarUrl: (path) => path ? `https://campus.test/${path}` : '', listMemberProfiles: vi.fn() }))

const authorId = '22222222-2222-4222-8222-222222222222'
const profile = { user_id: authorId, nickname: '新昵称', avatar_path: `${authorId}/new.webp` }
const review = { id: 'review-1', authorId, author: '旧昵称', isCloud: true, isExample: false, createdAt: '2026-10-21T00:00:00Z', rating: 4, content: '很好吃', tags: [], price: null }
const render = (props) => renderToStaticMarkup(<reviews.ReviewItem review={review} onDelete={() => {}} onOpenMemberProfile={() => {}} {...props} />)

describe('restaurant review author identity', () => {
  it('uses the shared avatar and current nickname for a cloud author with a profile entry', () => {
    expect(reviews.ReviewItem).toBeTypeOf('function')
    const html = render({ profile })
    expect(html).toContain(`src="https://campus.test/${profile.avatar_path}"`)
    expect(html).toContain('aria-label="查看新昵称的主页"')
    expect(html).toContain('<strong>新昵称</strong>')
    expect(html).not.toContain('旧昵称')
  })

  it.each([
    ['local', { isCloud: false }],
    ['example', { isExample: true }],
    ['invalid author', { authorId: 'local-author' }],
  ])('keeps %s reviews outside account profile navigation', (_label, changes) => {
    expect(reviews.ReviewItem).toBeTypeOf('function')
    const html = render({ review: { ...review, ...changes }, profile })
    expect(html).not.toContain('https://campus.test/')
    expect(html).not.toContain('的主页')
    expect(html).toContain('<strong>旧昵称</strong>')
  })

  it('uses the author snapshot as the fallback while a public profile is unavailable', () => {
    expect(reviews.ReviewItem).toBeTypeOf('function')
    const html = render({ profile: null })
    expect(html).toContain('aria-label="查看旧昵称的主页"')
    expect(html).toContain('profile-avatar')
    expect(html).toContain('<strong>旧昵称</strong>')
  })
})

describe('restaurant review photos', () => {
  it('renders persisted device photos as buttons that open a photo viewer', () => {
    const html = render({ review: { ...review, isCloud: false, images: ['data:image/jpeg;base64,YWJj', 'data:image/png;base64,YWJj'] } })
    expect(html).toContain('aria-label="放大用餐照片 1"')
    expect(html).toContain('aria-label="放大用餐照片 2"')
    expect(html).toContain('src="data:image/jpeg;base64,YWJj"')
  })
  it('asks a guest to log in for private cloud photos instead of leaking an URL', () => {
    const html = render({ review: { ...review, imagePaths: [`${authorId}/33333333-3333-4333-8333-333333333333.jpg`] } })
    expect(html).toContain('登录后可查看 1 张用餐照片')
    expect(html).not.toContain('33333333-3333-4333-8333-333333333333.jpg')
  })
})
