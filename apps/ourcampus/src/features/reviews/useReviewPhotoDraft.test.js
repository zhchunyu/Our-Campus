import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ hooks: [], index: 0, effects: [], prepare: vi.fn(), upload: vi.fn() }))
vi.mock('react', () => ({
  useRef: (value) => { const index = mocks.index++; return mocks.hooks[index] ??= { current: value } },
  useState: (initial) => {
    const index = mocks.index++; const hook = mocks.hooks[index] ??= { value: initial }
    return [hook.value, (value) => { hook.value = typeof value === 'function' ? value(hook.value) : value }]
  },
  useEffect: (effect, deps) => {
    const index = mocks.index++; const previous = mocks.hooks[index]
    if (!previous || deps.some((value, position) => value !== previous.deps[position])) mocks.effects.push(() => {
      previous?.cleanup?.(); mocks.hooks[index] = { deps, cleanup: effect() }
    })
  },
}))
vi.mock('../../data/postImages.js', () => ({ POST_IMAGE_LIMIT: 3, createPostImageUploadSession: () => ({ upload: mocks.upload }) }))
vi.mock('./reviewPhotos.js', () => ({ prepareReviewPhoto: mocks.prepare, reviewPhotoPayload: (items) => items.map((item) => item.preview) }))
import { useReviewPhotoDraft } from './useReviewPhotoDraft.js'
const owner = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const item = (id) => ({ id, preview: `data:image/jpeg;base64,${id}`, blob: new Blob(['photo']) })
function render(actor = owner) {
  mocks.index = 0
  const result = useReviewPhotoDraft(actor)
  mocks.effects.splice(0).forEach((effect) => effect())
  return result
}
beforeEach(() => { mocks.hooks = []; mocks.index = 0; mocks.effects = []; mocks.prepare.mockReset().mockImplementation(async (file) => item(file.id)); mocks.upload.mockReset().mockResolvedValue(['private-path']) })
afterEach(() => mocks.hooks.forEach((hook) => hook.cleanup?.()))

describe('review photo draft lifecycle', () => {
  it('does nothing when the device chooser is cancelled', async () => {
    await render().add([])
    expect(mocks.prepare).not.toHaveBeenCalled()
    expect(render().images).toEqual([])
  })
  it('blocks immediate submission while decoding, even before a state rerender', async () => {
    let finish
    mocks.prepare.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
    const draft = render()
    const pending = draft.add([{ id: 'one' }])
    expect(() => draft.snapshot()).toThrow('处理')
    await expect(draft.upload()).rejects.toThrow('处理')
    finish(item('one')); await pending
    expect(render().snapshot().images).toHaveLength(1)
  })
  it('preserves order, supports removal and rejects a fourth photo without losing the draft', async () => {
    await render().add([{ id: 'one' }, { id: 'two' }, { id: 'three' }])
    await render().add([{ id: 'four' }])
    expect(render().items.map((entry) => entry.id)).toEqual(['one', 'two', 'three'])
    expect(render().error).toContain('3 张')
    render().remove('two')
    expect(render().snapshot().images).toEqual([item('one').preview, item('three').preview])
  })
  it('keeps existing photos if any file in an added batch fails', async () => {
    await render().add([{ id: 'existing' }])
    mocks.prepare.mockResolvedValueOnce(item('new')).mockRejectedValueOnce(new Error('照片损坏'))
    await render().add([{ id: 'new' }, { id: 'bad' }])
    expect(render().items.map((entry) => entry.id)).toEqual(['existing'])
    expect(render().error).toContain('损坏')
  })
  it('discards a late decoded batch after an account switch', async () => {
    let finish
    mocks.prepare.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
    const pending = render().add([{ id: 'private' }])
    render(other)
    finish(item('private')); await pending
    expect(render(other).snapshot().images).toEqual([])
  })
  it('passes a stable upload snapshot and rejects its continuation when the account changes', async () => {
    await render().add([{ id: 'one' }])
    await render().upload()
    const [actor, files, current] = mocks.upload.mock.calls[0]
    expect(actor).toBe(owner)
    expect(files.map((entry) => entry.id)).toEqual(['one'])
    expect(current()).toBe(true)
    render(other)
    expect(current()).toBe(false)
  })
})
