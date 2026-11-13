import { useEffect, useRef, useState } from 'react'
import { createPostImageUploadSession, POST_IMAGE_LIMIT } from '../../data/postImages.js'
import { prepareReviewPhoto, reviewPhotoPayload } from './reviewPhotos.js'

export function useReviewPhotoDraft(ownerId) {
  const owner = useRef(ownerId); owner.current = ownerId
  const generation = useRef(0)
  const items = useRef([])
  const processing = useRef(false)
  const session = useRef(createPostImageUploadSession())
  const [state, setState] = useState({ ownerId, items: [], busy: false, error: '' })
  useEffect(() => {
    generation.current += 1
    items.current = []; processing.current = false
    session.current = createPostImageUploadSession()
    setState({ ownerId, items: [], busy: false, error: '' })
    return () => { generation.current += 1; items.current = []; processing.current = false }
  }, [ownerId])
  const add = async (files) => {
    const selected = Array.from(files ?? [])
    if (!selected.length || processing.current) return
    if (items.current.length + selected.length > POST_IMAGE_LIMIT) { setState((current) => ({ ...current, error: '每条评价最多添加 3 张照片，请减少后重选' })); return }
    const ticket = ++generation.current
    const actor = owner.current
    processing.current = true
    setState((current) => ({ ...current, busy: true, error: '' }))
    try {
      const prepared = []
      for (const file of selected) prepared.push(await prepareReviewPhoto(file))
      if (ticket !== generation.current || actor !== owner.current) return
      items.current = [...items.current, ...prepared]
      setState({ ownerId: actor, items: items.current, busy: false, error: '' })
    } catch (error) {
      if (ticket === generation.current && actor === owner.current) setState((current) => ({ ...current, busy: false, error: error.message || '照片读取失败，请重试' }))
    } finally { if (ticket === generation.current) processing.current = false }
  }
  const remove = (id) => {
    if (processing.current) return
    generation.current += 1
    items.current = items.current.filter((item) => item.id !== id)
    setState({ ownerId: owner.current, items: items.current, busy: false, error: '' })
  }
  const upload = async () => {
    if (processing.current) throw new Error('照片正在处理，请稍候')
    const actor = owner.current; const ticket = generation.current
    const selected = [...items.current]
    if (!selected.length) return []
    return session.current.upload(actor, selected, () => actor === owner.current && ticket === generation.current)
  }
  const visible = state.ownerId === ownerId ? state : { items: [], busy: false, error: '' }
  const snapshot = () => {
    if (processing.current) throw new Error('照片正在处理，请稍候')
    return { images: reviewPhotoPayload(items.current), uploadPhotos: upload }
  }
  return { ...visible, add, remove, upload, snapshot, images: reviewPhotoPayload(visible.items) }
}
