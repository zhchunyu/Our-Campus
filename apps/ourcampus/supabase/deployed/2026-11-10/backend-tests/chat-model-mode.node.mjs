import test from 'node:test'
import assert from 'node:assert/strict'
import { createAuvHandler } from '../backend/_shared/auv.js'

for (const model of ['qwen3.7-flash', 'qwen3.7-flash-2026-07-15', 'qwen2.5-14b-instruct-custom']) {
  test(`聊天模型 ${model} 使用正确的推理参数`, async () => {
    let body
    const handler = createAuvHandler({ SUPABASE_URL: 'https://campus.example', SUPABASE_ANON_KEY: 'public-key', AUV_BASE_URL: 'https://model.example/v1', AUV_API_KEY: 'private-key', AUV_PERSONA_MODEL: model }, async (url, options) => {
      if (url.includes('/auth/v1/user')) return Response.json({ id: 'user-a' })
      if (url.includes('/rest/v1/')) return Response.json([])
      body = JSON.parse(options.body)
      return Response.json({ choices: [{ message: { content: '可以先休息十分钟，再决定下一步安排。' } }] })
    })
    const response = await handler(new Request('https://gateway.example/api', { method: 'POST', headers: { authorization: 'Bearer user-token' }, body: JSON.stringify({ mode: 'chat', text: '学习累了，给我一点建议。' }) }))
    assert.equal(response.status, 200)
    assert.equal(body.model, model)
    if (model.startsWith('qwen3.7-flash')) assert.equal(body.enable_thinking, false)
    else assert.equal(Object.hasOwn(body, 'enable_thinking'), false)
  })
}
