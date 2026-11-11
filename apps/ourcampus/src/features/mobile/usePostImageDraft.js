import { useEffect, useRef, useState } from 'react'
import { createPostImageUploadSession, POST_IMAGE_LIMIT, preparePostImage } from '../../data/postImages.js'
export function usePostImageDraft(ownerId) {
  const ownerRef = useRef(ownerId); ownerRef.current = ownerId
  const generation = useRef(0)
  const itemsRef = useRef([])
  const uploadSession = useRef(createPostImageUploadSession())
  const [state, setState] = useState({ ownerId, items: [], busy: false, error: '' })
  const reset = () => {
    generation.current += 1
    for (const item of itemsRef.current) URL.revokeObjectURL(item.preview)
    itemsRef.current = []; uploadSession.current = createPostImageUploadSession()
    setState({ ownerId: ownerRef.current, items: [], busy: false, error: '' })
  }
  useEffect(() => { reset(); return () => { generation.current += 1; itemsRef.current.forEach((item) => URL.revokeObjectURL(item.preview)); itemsRef.current = [] } }, [ownerId])
  const add = async (files) => {
    const selected = [...files]
    if (!selected.length) return
    if (itemsRef.current.length + selected.length > POST_IMAGE_LIMIT) { setState((old) => ({ ...old, error: '每条信息最多添加 3 张照片' })); return }
    const ticket = ++generation.current
    const actor = ownerRef.current
    setState((old) => ({ ...old, busy: true, error: '' }))
    const prepared = []
    try {
      for (const file of selected) prepared.push(await preparePostImage(file))
      if (ticket !== generation.current || actor !== ownerRef.current) { prepared.forEach((item) => URL.revokeObjectURL(item.preview)); return }
      itemsRef.current = [...itemsRef.current, ...prepared]
      setState({ ownerId: actor, items: itemsRef.current, busy: false, error: '' })
    } catch (error) {
      prepared.forEach((item) => URL.revokeObjectURL(item.preview))
      if (ticket === generation.current && actor === ownerRef.current) setState((old) => ({ ...old, busy: false, error: error.message || '照片读取失败，请重试' }))
    }
  }
  const remove = (id) => {
    const item = itemsRef.current.find((entry) => entry.id === id)
    if (item) URL.revokeObjectURL(item.preview)
    itemsRef.current = itemsRef.current.filter((entry) => entry.id !== id)
    setState((old) => ({ ...old, items: itemsRef.current, error: '' }))
  }
  const upload = async () => {
    const actor = ownerRef.current; const ticket = generation.current
    if (!itemsRef.current.length) return []
    return uploadSession.current.upload(actor, itemsRef.current, () => actor === ownerRef.current && ticket === generation.current)
  }
  return { ...(state.ownerId === ownerId ? state : { items: [], busy: false, error: '' }), add, remove, reset, upload }
}
