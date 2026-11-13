import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prepareReviewPhoto } from './reviewPhotos.js'
const photo = 'data:image/jpeg;base64,YWJj'
let canvas
let decode
beforeEach(() => {
  decode = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('Image', class { naturalWidth = 4000; naturalHeight = 3000; decode = decode })
  const context = { fillRect: vi.fn(), drawImage: vi.fn() }
  canvas = { getContext: () => context, toDataURL: vi.fn().mockReturnValue(photo) }
  vi.stubGlobal('document', { createElement: () => canvas })
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fixture')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('restaurant image preparation', () => {
  it('re-encodes a large camera photo to a bounded JPEG for cloud and device history', async () => {
    const result = await prepareReviewPhoto({ type: 'image/jpeg', size: 8 * 1024 * 1024 })
    expect(canvas.width).toBe(1000)
    expect(canvas.height).toBe(750)
    expect(result.blob.type).toBe('image/jpeg')
    expect(result.preview).toBe(photo)
    expect(await result.blob.text()).toBe('abc')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fixture')
  })
  it('reduces dimensions and retries when the first JPEG exceeds the device budget', async () => {
    canvas.toDataURL.mockReturnValueOnce('data:image/jpeg;base64,' + 'a'.repeat(180000))
    const result = await prepareReviewPhoto({ type: 'image/png', size: 1024 })
    expect(canvas.toDataURL).toHaveBeenCalledTimes(2)
    expect(canvas.width).toBe(820)
    expect(result.preview).toBe(photo)
  })
  it('revokes the source URL when decoding or compression fails', async () => {
    decode.mockRejectedValueOnce(new Error('图片损坏'))
    await expect(prepareReviewPhoto({ type: 'image/jpeg', size: 1024 })).rejects.toThrow('图片损坏')
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)
    canvas.toDataURL.mockReturnValue('data:image/jpeg;base64,' + 'a'.repeat(180000))
    await expect(prepareReviewPhoto({ type: 'image/jpeg', size: 1024 })).rejects.toThrow('照片')
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2)
  })
  it('rejects unsupported/oversized originals before opening any object URL', async () => {
    await expect(prepareReviewPhoto({ type: 'image/svg+xml', size: 1 })).rejects.toThrow()
    await expect(prepareReviewPhoto({ type: 'image/jpeg', size: 11 * 1024 * 1024 })).rejects.toThrow()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })
})
