// 你画我猜的纯逻辑：不碰网络、不碰 DOM，方便单测和后续替换传输层。
export const ROUND_SECONDS = 90
export const STROKE_FLUSH_MS = 110
export const FEED_LIMIT = 8
export const MAX_GUESS_LENGTH = 24
export const DRAW_COLORS = Object.freeze(['#2f3b32', '#d0563f', '#2f6fb0', '#c9a227', '#7b5ea7'])
export const CANVAS_SIZE = 600
export const REACTION_KINDS = Object.freeze(['like', 'egg', 'bomb'])
export const REACTION_EMOJI = Object.freeze({ like: '👍', egg: '🥚', bomb: '💣' })

export function formatClock(seconds) {
  const safe = Math.max(0, Math.floor(seconds))
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`
}

export function remainingSeconds(endsAt, now = Date.now()) {
  if (!endsAt) return 0
  return Math.max(0, Math.ceil((endsAt - now) / 1000))
}

export function applyCorrectGuess(scores = {}, guesserId, drawerId) {
  const next = { ...scores }
  if (guesserId) next[guesserId] = (next[guesserId] ?? 0) + 1
  if (drawerId && drawerId !== guesserId) next[drawerId] = (next[drawerId] ?? 0) + 1
  return next
}

export function rankPlayers(players = [], scores = {}) {
  return players
    .slice()
    .sort((a, b) => (scores[b.user_id] ?? 0) - (scores[a.user_id] ?? 0) || (a.joined_at ?? 0) - (b.joined_at ?? 0))
}

export function addFeed(feed = [], entry, limit = FEED_LIMIT) {
  if (entry?.id && feed.some((item) => item.id === entry.id)) return feed
  return [...feed, entry].slice(-limit)
}
