import { ImagePlus, X } from 'lucide-react'
import { POST_IMAGE_LIMIT } from '../../data/postImages.js'
import './post-images.css'
export function PostImagePicker({ draft, disabled = false, label = '添加照片' }) {
  return <div className="post-image-picker">
    <label className={`post-image-picker__add${disabled || draft.busy || draft.items.length >= POST_IMAGE_LIMIT ? ' is-disabled' : ''}`}><ImagePlus size={18} /><span>{draft.busy ? '正在处理照片…' : `${label} ${draft.items.length}/${POST_IMAGE_LIMIT}`}</span><input type="file" multiple accept="image/jpeg,image/png,image/webp" aria-label={label} disabled={disabled || draft.busy || draft.items.length >= POST_IMAGE_LIMIT} onChange={(event) => { const files = [...event.target.files]; event.target.value = ''; void draft.add(files) }} /></label>
    {draft.items.length > 0 && <div className="post-image-picker__previews">{draft.items.map((item, index) => <div key={item.id}><img src={item.preview} alt={`待发布照片 ${index + 1}`} /><button type="button" disabled={disabled || draft.busy} aria-label={`移除照片 ${index + 1}`} onClick={() => draft.remove(item.id)}><X size={15} /></button></div>)}</div>}
    <small>最多 3 张，单张原图不超过 10 MB，自动压缩后上传。</small>
    {draft.error && <p className="post-image-error" role="alert">{draft.error}</p>}
  </div>
}
