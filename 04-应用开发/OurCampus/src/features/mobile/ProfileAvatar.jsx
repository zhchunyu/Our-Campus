import { useState } from 'react'
import './profile-avatar.css'

export function ProfileAvatar({ src, name = '校园同学', className = '' }) {
  const [failedSrc, setFailedSrc] = useState(null)
  const showImage = Boolean(src && failedSrc !== src)
  return <span className={`profile-avatar ${className}`} aria-label={`${name || '校园同学'}的头像`}>
    {showImage ? <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailedSrc(src)} /> : <span aria-hidden="true">{[...(name || '校园同学')][0]}</span>}
  </span>
}
