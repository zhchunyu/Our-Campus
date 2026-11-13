import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
    .map((line) => { const i = line.indexOf('='); return [line.slice(0, i).trim(), line.slice(i + 1).trim()] }),
)

const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY
const room = `campus-draw:selftest-${Date.now()}`

const a = createClient(url, key)
const b = createClient(url, key)

const done = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('timeout: no broadcast/presence in 15s')), 15000)
  const channelA = a.channel(room, { config: { broadcast: { self: false }, presence: { key: 'user-a' } } })
  const channelB = b.channel(room, { config: { broadcast: { self: false }, presence: { key: 'user-b' } } })
  let gotStroke = false
  let gotGuess = false
  let presenceCount = 0

  channelB.on('broadcast', { event: 'stroke' }, ({ payload }) => {
    gotStroke = payload?.pts?.length > 0
  })
  channelA.on('broadcast', { event: 'guess' }, ({ payload }) => {
    gotGuess = payload?.text === '谷园餐厅'
  })

  const maybeFinish = () => {
    if (gotStroke && gotGuess && presenceCount >= 2) {
      clearTimeout(timer)
      resolve()
    }
  }

  channelB.on('presence', { event: 'sync' }, () => {
    presenceCount = Object.values(channelB.presenceState()).flat().length
    maybeFinish()
  })

  channelB.subscribe((status) => {
    if (status !== 'SUBSCRIBED') return
    channelB.track({ user_id: 'user-b', joined_at: 2 })
    channelA.subscribe(async (state) => {
      if (state !== 'SUBSCRIBED') return
      await channelA.track({ user_id: 'user-a', joined_at: 1 })
      await channelA.send({ type: 'broadcast', event: 'stroke', payload: { c: '#2f3b32', w: 7, pts: [[100, 100], [200, 200]] } })
      await channelB.send({ type: 'broadcast', event: 'guess', payload: { id: 'g1', by: 'user-b', name: '小禾', text: '谷园餐厅' } })
      setTimeout(maybeFinish, 1200)
    })
  })
})

try {
  await done
  console.log('REALTIME OK: broadcast + presence work on', room)
} finally {
  await new Promise((resolve) => setTimeout(resolve, 500))
  process.exit(0)
}
