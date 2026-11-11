import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { networkInterfaces } from 'node:os'
import { resolve } from 'node:path'

const apkPath = resolve('android/app/build/outputs/apk/debug/app-debug.apk')
const port = Number(process.env.ANDROID_APK_PORT || 4174)

const server = createServer((request, response) => {
  if (request.method !== 'GET' || request.url !== '/CampusTwin.apk') {
    response.writeHead(404).end('Not found')
    return
  }

  if (!existsSync(apkPath)) {
    response.writeHead(404).end('Run npm run android:apk to build the APK first.')
    return
  }

  const { size } = statSync(apkPath)
  response.writeHead(200, {
    'Content-Type': 'application/vnd.android.package-archive',
    'Content-Disposition': 'attachment; filename="CampusTwin.apk"',
    'Content-Length': size,
    'Cache-Control': 'no-store',
  })
  createReadStream(apkPath).pipe(response)
})

server.listen(port, '0.0.0.0', () => {
  const addresses = Object.values(networkInterfaces())
    .flatMap((entries) => entries ?? [])
    .filter((entry) => (entry.family === 'IPv4' || entry.family === 4) && !entry.internal && !entry.address.startsWith('169.254.'))
    .map((entry) => entry.address)
  console.log(`APK download server is ready on port ${port}.`)
  for (const address of addresses) console.log(`Phone on the same Wi-Fi: http://${address}:${port}/CampusTwin.apk`)
})

server.on('error', (error) => {
  console.error(`Could not start APK download server: ${error.message}`)
  process.exitCode = 1
})
