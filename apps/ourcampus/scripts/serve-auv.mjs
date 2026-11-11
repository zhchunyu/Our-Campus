import { createServer } from 'node:http'
import { createAuvMiddleware } from '../server/auvMiddleware.js'

const middleware = createAuvMiddleware(process.env)
const port = Number(process.env.AUV_GATEWAY_PORT || 8787)
const host = process.env.AUV_GATEWAY_HOST || '127.0.0.1'
createServer((req, res) => middleware(req, res, () => { res.writeHead(404); res.end('Not found') })).listen(port, host, () => console.log(`AUV gateway: http://${host}:${port}/api/auv-assistant`))
