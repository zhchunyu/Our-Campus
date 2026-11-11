export async function prepareCommunityPhoto(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('请选择 JPG、PNG 或 WebP 照片')
  if (file.size > 5 * 1024 * 1024) throw new Error('照片不能超过 5 MB')
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const scale = Math.min(1, 720 / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('当前设备无法处理照片')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const data = canvas.toDataURL('image/jpeg', 0.66)
    if (data.length > 180000) throw new Error('照片细节过多，请选择更小的照片')
    return data
  } finally { URL.revokeObjectURL(url) }
}
