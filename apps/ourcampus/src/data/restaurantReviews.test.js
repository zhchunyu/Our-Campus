import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalRestaurantReview, loadLocalRestaurantReviews, saveLocalRestaurantReviews } from './restaurantReviews.js'

const photo = 'data:image/jpeg;base64,YWJj'
const input = { restaurantId: 'canteen', windowId: 'window-01', rating: 4, content: '面条很有嚼劲', tags: ['口味好'], price: '12', images: [photo] }
let saved
beforeEach(() => {
  saved = ''
  vi.stubGlobal('localStorage', { getItem: () => saved, setItem: (_key, value) => { saved = value } })
})

describe('restaurant review photo persistence', () => {
  it('keeps up to three compressed photos after saving and reopening', () => {
    const review = createLocalRestaurantReview(input)
    expect(review.images).toEqual([photo])
    saveLocalRestaurantReviews([review])
    expect(loadLocalRestaurantReviews()).toEqual([review])
  })
  it('loads text-only version-one history and preserves valid text when photo data is damaged', () => {
    const review = createLocalRestaurantReview(input)
    const { images, ...old } = review
    saved = JSON.stringify({ version: 1, reviews: [old, { ...review, id: 'broken', images: ['https://external.test/photo.jpg'] }] })
    expect(loadLocalRestaurantReviews().map((entry) => entry.images)).toEqual([[], []])
  })
  it.each([[Array(4).fill(photo)], [['https://external.test/a.jpg']], [['data:image/svg+xml;base64,YWJj']], [['data:image/jpeg;base64,' + 'a'.repeat(180000)]]])('rejects invalid photos before saving: %j', (images) => {
    expect(() => createLocalRestaurantReview({ ...input, images })).toThrow('照片')
  })
  it('reopens photo history larger than the old 500KB threshold', () => {
    const largePhoto = 'data:image/jpeg;base64,' + 'a'.repeat(170000)
    const review = createLocalRestaurantReview({ ...input, images: [largePhoto, largePhoto, largePhoto] })
    saveLocalRestaurantReviews([review])
    expect(saved.length).toBeGreaterThan(500000)
    expect(loadLocalRestaurantReviews()[0].images).toHaveLength(3)
  })
  it('rejects an oversized save without overwriting existing history', () => {
    saveLocalRestaurantReviews([createLocalRestaurantReview(input)])
    const previous = saved
    const large = createLocalRestaurantReview({ ...input, images: Array(3).fill('data:image/jpeg;base64,' + 'a'.repeat(170000)) })
    expect(() => saveLocalRestaurantReviews(Array.from({ length: 5 }, (_, index) => ({ ...large, id: `large-${index}` })))).toThrow('照片')
    expect(saved).toBe(previous)
  })
})
