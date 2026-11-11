import { createAuvHandler } from '../supabase/functions/_shared/auv.js'

export function createAuvMiddleware(env) {
  const handle = createAuvHandler(env)
  return async (req, res, next) => {
    if (req.url?.split('?')[0] !== '/api/auv-assistant') { next?.(); return }
    let size = 0
    const chunks = []
    try {
      for await (const chunk of req) {
        size += chunk.length
        if (size > 16_000) { res.writeHead(413, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { message: '请求过长，请缩短内容。' } })); return }
        chunks.push(chunk)
      }
      const controller = new AbortController()
      const abort = () => { if (!res.writableEnded) controller.abort() }
      res.once('close', abort)
      const request = new Request('http://localhost/api/auv-assistant', { method: req.method, headers: { authorization: req.headers.authorization ?? '', 'Content-Type': 'application/json' }, ...(req.method === 'POST' ? { body: Buffer.concat(chunks).toString('utf8') } : {}), signal: controller.signal })
      const response = await handle(request)
      if (!res.destroyed) { res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(await response.text()) }
      res.removeListener('close', abort)
    } catch { if (!res.destroyed) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'AI 服务处理失败，请稍后重试。' } })) } }
  }
}

export function auvDevPlugin(env) {
  return { name: 'campus-auv-gateway', configureServer(server) { server.middlewares.use(createAuvMiddleware(env)) } }
}
