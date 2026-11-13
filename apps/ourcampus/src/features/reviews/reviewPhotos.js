import { validatePostImageFile } from '../../data/postImages.js'
import { normalizeReviewPhotos, REVIEW_PHOTO_MAX_LENGTH } from '../../data/restaurantReviews.js'

// A bounded JPEG is usable both in device history and in the private image bucket.
// Canvas re-encoding also drops the original photo's embedded metadata.
export async function prepareReviewPhoto(file) {
  validatePostImageFile(file)
  const source = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = source
    await image.decode()
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('照片无法读取，请重新选择')
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) throw new Error('当前设备无法处理照片')
    const scale = Math.min(1, 1000 / Math.max(image.naturalWidth, image.naturalHeight))
    let data = ''
    for (let attempt = 0; attempt < 5; attempt += 1) {
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale * .82 ** attempt))
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale * .82 ** attempt))
      context.fillStyle = '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      data = canvas.toDataURL('image/jpeg', .76 - attempt * .06)
      if (data.length <= REVIEW_PHOTO_MAX_LENGTH) break
    }
    normalizeReviewPhotos([data])
    const bytes = Uint8Array.from(atob(data.slice(data.indexOf(',') + 1)), (character) => character.charCodeAt(0))
    return { id: crypto.randomUUID(), blob: new Blob([bytes], { type: 'image/jpeg' }), preview: data }
  } catch (error) {
    throw new Error(error.message || '照片读取失败，请重新选择 JPG、PNG 或 WebP 照片')
  } finally { URL.revokeObjectURL(source) }
}

export function reviewPhotoPayload(items) {
  return normalizeReviewPhotos(items.map((item) => item.preview))
}
