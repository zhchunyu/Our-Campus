import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ upload: vi.fn(), sign: vi.fn() }))
vi.mock('./supabaseClient.js', () => ({ requireSupabase: () => ({ storage: { from: (bucket) => { expect(bucket).toBe('post-images'); return { upload: state.upload, createSignedUrls: state.sign } } } }) }))
import { normalizePostImagePaths, createPostImageUploadSession, signPostImages, validatePostImageFile } from './postImages.js'
const owner = '11111111-1111-4111-8111-111111111111'
const id = '22222222-2222-4222-8222-222222222222'
const path = `${owner}/${id}.jpg`
beforeEach(() => { state.upload.mockReset().mockResolvedValue({ error: null }); state.sign.mockReset() })
describe('private post image lifecycle', () => {
 it('accepts only bounded canonical owner paths and rejects external/data/traversal URLs', () => {
   expect(normalizePostImagePaths([path])).toEqual([path])
   for (const invalid of [[`https://other.test/${path}`], ['data:image/jpeg;base64,AAAA'], [`${owner}/../${id}.jpg`], [path, path], Array(4).fill(path), null]) expect(() => normalizePostImagePaths(invalid)).toThrow()
   expect(() => normalizePostImagePaths([path], id)).toThrow()
 })
 it('reuses successful uploads and stable paths after a later upload fails', async () => {
   const session = createPostImageUploadSession()
   const item = { id, blob: new Blob(['photo'], { type: 'image/jpeg' }) }
   expect(await session.upload(owner, [item])).toEqual([path])
   expect(await session.upload(owner, [item])).toEqual([path])
   expect(state.upload).toHaveBeenCalledTimes(1)
   expect(state.upload.mock.calls[0][2]).toMatchObject({ upsert: false, contentType: 'image/jpeg' })
 })
 it('retains the same storage path for an ambiguous failure and retries without replacement', async () => {
   state.upload.mockResolvedValueOnce({ error: { message: 'network' } })
   const session = createPostImageUploadSession()
   const item = { id, blob: new Blob(['photo'], { type: 'image/jpeg' }) }
   await expect(session.upload(owner, [item])).rejects.toThrow()
   await expect(session.upload(owner, [item])).resolves.toEqual([path])
   expect(state.upload.mock.calls.map(([key]) => key)).toEqual([path, path])
 })
 it('stops an account-switched upload before a parent record can be submitted', async () => {
   let current = owner
   state.upload.mockImplementation(async () => { current = id; return { error: null } })
   await expect(createPostImageUploadSession().upload(owner, [{ id, blob: new Blob(['x']) }], () => current === owner)).rejects.toThrow('账号')
 })
 it('uses short-lived signed URLs and never treats an arbitrary URL as media', async () => {
   state.sign.mockResolvedValue({ data: [{ path, signedUrl: 'https://project.supabase.co/storage/v1/object/sign/post-images/' + path + '?token=x' }], error: null })
   expect(await signPostImages([path])).toHaveLength(1)
   expect(state.sign).toHaveBeenCalledWith([path], 300)
   state.sign.mockResolvedValue({ data: [{ path, signedUrl: 'javascript:alert(1)' }], error: null })
   await expect(signPostImages([path])).rejects.toThrow()
 })
 it('rejects unsupported formats and excessive input size before decoding', () => {
   expect(() => validatePostImageFile({ type: 'image/svg+xml', size: 4 })).toThrow()
   expect(() => validatePostImageFile({ type: 'image/jpeg', size: 11 * 1024 * 1024 })).toThrow()
   expect(() => validatePostImageFile({ type: 'image/png', size: 1024 })).not.toThrow()
 })
})

it('recovers a timed-out upload reported as the legacy duplicate response without accepting unrelated 400 errors', async () => {
 const item = { id, blob: new Blob(['photo'], { type: 'image/jpeg' }) }
 state.upload.mockResolvedValueOnce({ error: { statusCode: '400', message: 'The resource already exists' } })
 state.sign.mockResolvedValueOnce({ data: [{ path, signedUrl: 'https://project.supabase.co/storage/v1/object/sign/post-images/' + path + '?token=x' }], error: null })
 await expect(createPostImageUploadSession().upload(owner, [item])).resolves.toEqual([path])
 state.upload.mockResolvedValueOnce({ error: { statusCode: '400', message: 'Invalid mime type' } })
 await expect(createPostImageUploadSession().upload(owner, [item])).rejects.toThrow()
})
