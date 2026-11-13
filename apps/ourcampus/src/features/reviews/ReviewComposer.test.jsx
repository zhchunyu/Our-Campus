import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
vi.mock('../../app/useBackLayer.js', () => ({ useBackLayer: () => {} }))
import { ReviewComposer } from './ReviewComposer.jsx'
const props = { restaurant: { name: '谷园' }, windows: [{ id: 'window', name: '面馆', number: '01', cloudStored: true }], initialWindowId: 'window', onClose: () => {}, onSubmit: () => {} }
describe('review photo chooser contract', () => {
  it('uses the Android-supported multiple file chooser and documents compression limits', () => {
    const html = renderToStaticMarkup(<ReviewComposer {...props} />)
    expect(html).toContain('type="file" multiple="" accept="image/jpeg,image/png,image/webp"')
    expect(html).toContain('aria-label="添加用餐照片"')
    expect(html).toContain('最多 3 张')
    expect(html).toContain('单张原图不超过 10 MB')
    expect(html).not.toContain('capture=')
    expect(html).toContain('保存在当前设备')
  })
  it('explains the cloud photo audience while preserving the public text review action', () => {
    const html = renderToStaticMarkup(<ReviewComposer {...props} cloud userId="11111111-1111-4111-8111-111111111111" />)
    expect(html).toContain('照片随评价发布，登录同学可查看')
    expect(html).toContain('发布评价')
  })
})
