import { useEffect, useState } from 'react'

const previewUrl = new URL(window.location.href)
previewUrl.searchParams.set('preview', 'mobile')
// Keep email-confirmation/recovery fragments when the desktop shell opens its phone iframe.
const previewIframePath = `/${previewUrl.search}${previewUrl.hash}`

const getPreviewScale = () => Math.max(
  0.2,
  Math.min(1, (window.innerWidth - 40) / 430, (window.innerHeight - 40) / 880),
)

export function PhonePreviewShell() {
  const [scale, setScale] = useState(getPreviewScale)

  useEffect(() => {
    const resizePreview = () => setScale(getPreviewScale())
    window.addEventListener('resize', resizePreview)
    return () => window.removeEventListener('resize', resizePreview)
  }, [])

  return (
    <main className="phone-preview-shell">
      <div
        className="phone-preview-device-wrap"
        style={{ width: `${430 * scale}px`, height: `${880 * scale}px` }}
      >
        <div className="phone-preview-device" style={{ transform: `scale(${scale})` }} aria-label="手机尺寸预览">
          <span className="phone-preview-speaker" aria-hidden="true" />
          <div className="phone-preview-screen">
            <iframe
              title="数字校园手机界面预览"
              src={previewIframePath}
              loading="eager"
            />
          </div>
        </div>
      </div>
    </main>
  )
}
