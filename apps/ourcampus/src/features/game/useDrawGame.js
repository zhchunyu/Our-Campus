import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../data/supabaseClient.js'
import { isCorrectGuess, pickWord } from './words.js'
import { MAX_GUESS_LENGTH, REACTION_KINDS, ROUND_SECONDS, addFeed, applyCorrectGuess } from './drawGame.js'

const EMPTY_STATE = {
  status: 'idle',
  players: [],
  phase: 'lobby',
  drawerId: null,
  drawerName: '',
  word: '',
  wordLength: 0,
  endsAt: 0,
  scores: {},
  feed: [],
  strokes: [],
  revealed: '',
  roundNo: 0,
  drawerLeft: false,
  reactions: {},
  lastReaction: null,
  error: '',
}

const CHANNEL_PREFIX = 'campus-draw'

function sanitizeStroke(payload) {
  const pts = Array.isArray(payload?.pts) ? payload.pts : []
  const points = pts
    .filter((point) => Array.isArray(point) && point.length === 2)
    .slice(0, 40)
    .map(([x, y]) => [
      Math.min(1000, Math.max(0, Math.round(Number(x) || 0))),
      Math.min(1000, Math.max(0, Math.round(Number(y) || 0))),
    ])
  if (points.length < 2) return null
  return {
    c: typeof payload.c === 'string' && /^#[0-9a-f]{6}$/i.test(payload.c) ? payload.c : '#2f3b32',
    w: Math.min(24, Math.max(2, Math.round(Number(payload.w) || 6))),
    pts: points,
  }
}

// 纯前端房间：走 Realtime Broadcast + Presence，不写数据库、不新增表和函数。
export function useDrawGame({ roomId, user, enabled = true }) {
  const [state, setState] = useState(EMPTY_STATE)
  const channelRef = useRef(null)
  const strokesRef = useRef([])
  const gameRef = useRef({ phase: 'lobby', drawerId: null, drawerName: '', word: '', endsAt: 0, scores: {}, roundNo: 0, solved: false })
  const nameRef = useRef('同学')
  const userId = user?.id ?? null
  const displayName = user?.name || '同学'
  nameRef.current = displayName

  const broadcast = useCallback((event, payload) => {
    const channel = channelRef.current
    if (!channel || channel.state !== 'joined') return false
    channel.send({ type: 'broadcast', event, payload }).catch(() => {})
    return true
  }, [])

  const startRound = useCallback(() => {
    if (!userId) return
    const game = gameRef.current
    const word = pickWord()
    game.phase = 'playing'
    game.drawerId = userId
    game.drawerName = nameRef.current
    game.word = word
    game.endsAt = Date.now() + ROUND_SECONDS * 1000
    game.solved = false
    game.roundNo += 1
    strokesRef.current = []
    setState((current) => ({
      ...current,
      phase: 'playing',
      drawerId: userId,
      drawerName: nameRef.current,
      word,
      wordLength: Array.from(word).length,
      endsAt: game.endsAt,
      strokes: [],
      feed: [],
      revealed: '',
      roundNo: game.roundNo,
      drawerLeft: false,
    }))
    broadcast('state', {
      phase: game.phase, drawerId: game.drawerId, drawerName: game.drawerName,
      wordLength: Array.from(word).length, endsAt: game.endsAt, scores: game.scores, roundNo: game.roundNo,
    })
    broadcast('clear', { roundNo: game.roundNo })
  }, [broadcast, userId])

  const endRound = useCallback(() => {
    const game = gameRef.current
    if (game.phase !== 'playing' || game.drawerId !== userId) return
    const answer = game.word
    game.phase = 'reveal'
    game.word = ''
    setState((current) => ({ ...current, phase: 'reveal', word: '', revealed: answer }))
    broadcast('end', { word: answer, scores: game.scores, reason: 'ended' })
  }, [broadcast, userId])

  const sendStroke = useCallback((stroke) => {
    const game = gameRef.current
    if (game.phase !== 'playing' || game.drawerId !== userId) return
    const clean = sanitizeStroke(stroke)
    if (!clean) return
    strokesRef.current = [...strokesRef.current, clean]
    setState((current) => ({ ...current, strokes: strokesRef.current }))
    broadcast('stroke', clean)
  }, [broadcast, userId])

  const clearBoard = useCallback(() => {
    if (gameRef.current.drawerId !== userId) return
    strokesRef.current = []
    setState((current) => ({ ...current, strokes: [] }))
    broadcast('clear', { roundNo: gameRef.current.roundNo })
  }, [broadcast, userId])

  const sendGuess = useCallback((value) => {
    const text = String(value ?? '').trim().slice(0, MAX_GUESS_LENGTH)
    const game = gameRef.current
    if (!text || game.phase !== 'playing' || game.drawerId === userId) return
    const entry = { id: crypto.randomUUID(), kind: 'guess', name: nameRef.current, text, mine: true }
    setState((current) => ({ ...current, feed: addFeed(current.feed, entry) }))
    broadcast('guess', { id: entry.id, by: userId, name: nameRef.current, text })
  }, [broadcast, userId])

  const lastReactionAt = useRef(0)
  const applyReaction = useCallback((reaction) => {
    if (!reaction?.target || !REACTION_KINDS.includes(reaction.kind)) return
    setState((current) => {
      const counts = current.reactions[reaction.target] ?? {}
      return {
        ...current,
        reactions: {
          ...current.reactions,
          [reaction.target]: { ...counts, [reaction.kind]: (counts[reaction.kind] ?? 0) + 1 },
        },
        lastReaction: { ...reaction, at: Date.now() },
      }
    })
  }, [])

  const sendReaction = useCallback((kind, targetId) => {
    if (!userId || !targetId || !REACTION_KINDS.includes(kind)) return false
    const now = Date.now()
    if (now - lastReactionAt.current < 700) return false
    lastReactionAt.current = now
    const reaction = { id: crypto.randomUUID(), kind, target: targetId, from: userId, fromName: nameRef.current }
    applyReaction(reaction)
    broadcast('reaction', reaction)
    return true
  }, [applyReaction, broadcast, userId])

  useEffect(() => {
    setState(EMPTY_STATE)
    gameRef.current = { phase: 'lobby', drawerId: null, drawerName: '', word: '', endsAt: 0, scores: {}, roundNo: 0, solved: false }
    strokesRef.current = []
    if (!enabled || !userId || !roomId || !supabase) return undefined

    let disposed = false
    const channel = supabase.channel(`${CHANNEL_PREFIX}:${roomId}`, {
      config: { broadcast: { self: false }, presence: { key: userId } },
    })
    channelRef.current = channel

    const update = (changes) => { if (!disposed) setState((current) => ({ ...current, ...changes })) }
    const pushFeed = (entry) => { if (!disposed) setState((current) => ({ ...current, feed: addFeed(current.feed, entry) })) }

    channel
      .on('broadcast', { event: 'state' }, ({ payload }) => {
        if (!payload) return
        const game = gameRef.current
        game.phase = payload.phase === 'playing' ? 'playing' : payload.phase === 'reveal' ? 'reveal' : 'lobby'
        game.drawerId = payload.drawerId ?? null
        game.drawerName = payload.drawerName ?? ''
        game.endsAt = Number(payload.endsAt) || 0
        game.scores = payload.scores && typeof payload.scores === 'object' ? payload.scores : {}
        game.roundNo = Number(payload.roundNo) || 0
        game.solved = false
        if (game.phase !== 'playing') {
          game.word = ''
          strokesRef.current = []
        }
        update({
          phase: game.phase, drawerId: game.drawerId, drawerName: game.drawerName,
          wordLength: Number(payload.wordLength) || 0, endsAt: game.endsAt, scores: game.scores,
          roundNo: game.roundNo, strokes: strokesRef.current, drawerLeft: false,
        })
      })
      .on('broadcast', { event: 'stroke' }, ({ payload }) => {
        const clean = sanitizeStroke(payload)
        if (!clean) return
        strokesRef.current = [...strokesRef.current, clean]
        update({ strokes: strokesRef.current })
      })
      .on('broadcast', { event: 'clear' }, () => {
        strokesRef.current = []
        update({ strokes: [] })
      })
      .on('broadcast', { event: 'guess' }, ({ payload }) => {
        if (!payload?.text) return
        const game = gameRef.current
        const text = String(payload.text).slice(0, MAX_GUESS_LENGTH)
        if (game.phase !== 'playing' || game.drawerId !== userId || game.solved) return
        if (!isCorrectGuess(text, game.word)) {
          pushFeed({ id: String(payload.id ?? `g-${Date.now()}`), kind: 'guess', name: String(payload.name ?? '同学'), text })
          broadcast('wrong', { id: payload.id, name: String(payload.name ?? '同学'), text })
          return
        }
        game.solved = true
        game.scores = applyCorrectGuess(game.scores, payload.by, game.drawerId)
        const answer = game.word
        game.phase = 'reveal'
        game.word = ''
        update({ scores: game.scores, phase: 'reveal', revealed: answer, word: '' })
        pushFeed({ id: `ok-${Date.now()}`, kind: 'correct', name: String(payload.name ?? '同学'), text: answer })
        broadcast('correct', { word: answer, name: String(payload.name ?? '同学'), scores: game.scores, by: payload.by })
      })
      .on('broadcast', { event: 'wrong' }, ({ payload }) => {
        if (!payload?.text) return
        pushFeed({ id: String(payload.id ?? `w-${Date.now()}`), kind: 'guess', name: String(payload.name ?? '同学'), text: String(payload.text) })
      })
      .on('broadcast', { event: 'correct' }, ({ payload }) => {
        const game = gameRef.current
        game.phase = 'reveal'
        game.solved = true
        game.scores = payload?.scores && typeof payload.scores === 'object' ? payload.scores : game.scores
        game.word = ''
        update({ phase: 'reveal', revealed: String(payload?.word ?? ''), word: '', scores: game.scores })
        pushFeed({ id: `ok-${Date.now()}`, kind: 'correct', name: String(payload?.name ?? '同学'), text: String(payload?.word ?? '') })
      })
      .on('broadcast', { event: 'end' }, ({ payload }) => {
        const game = gameRef.current
        game.phase = 'reveal'
        game.word = ''
        game.solved = true
        game.scores = payload?.scores && typeof payload.scores === 'object' ? payload.scores : game.scores
        update({ phase: 'reveal', revealed: String(payload?.word ?? ''), word: '', scores: game.scores })
      })
      .on('broadcast', { event: 'hello' }, () => {
        const game = gameRef.current
        if (game.phase !== 'playing' || game.drawerId !== userId) return
        broadcast('state', {
          phase: game.phase, drawerId: game.drawerId, drawerName: game.drawerName,
          wordLength: Array.from(game.word).length, endsAt: game.endsAt, scores: game.scores, roundNo: game.roundNo,
        })
        broadcast('snapshot', { strokes: strokesRef.current })
      })
      .on('broadcast', { event: 'snapshot' }, ({ payload }) => {
        if (!Array.isArray(payload?.strokes)) return
        strokesRef.current = payload.strokes.map(sanitizeStroke).filter(Boolean)
        update({ strokes: strokesRef.current })
      })
      .on('broadcast', { event: 'reaction' }, ({ payload }) => {
        if (!payload?.target || !REACTION_KINDS.includes(payload.kind)) return
        applyReaction({
          id: String(payload.id ?? `r-${Date.now()}`),
          kind: payload.kind,
          target: String(payload.target),
          from: payload.from,
          fromName: String(payload.fromName ?? '同学'),
        })
      })
      .on('presence', { event: 'sync' }, () => {
        const raw = Object.values(channel.presenceState()).flat()
        const seen = new Map()
        for (const player of raw) {
          if (!player?.user_id || seen.has(player.user_id)) continue
          seen.set(player.user_id, player)
        }
        const players = [...seen.values()].sort((a, b) => (a.joined_at ?? 0) - (b.joined_at ?? 0))
        const game = gameRef.current
        const drawerLeft = game.phase === 'playing' && Boolean(game.drawerId) && !seen.has(game.drawerId)
        update({ players, drawerLeft })
      })
      .subscribe((status) => {
        if (disposed) return
        if (status === 'SUBSCRIBED') {
          update({ status: 'live', error: '' })
          channel.track({ user_id: userId, name: displayName, avatar_url: user?.avatarUrl ?? null, joined_at: Date.now() })
          channel.send({ type: 'broadcast', event: 'hello', payload: {} })
        } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
          update({ status: 'connecting' })
        }
      })

    const timer = setInterval(() => {
      const game = gameRef.current
      if (game.phase !== 'playing' || !game.endsAt || Date.now() < game.endsAt) return
      if (game.drawerId !== userId) return
      const answer = game.word
      game.phase = 'reveal'
      game.word = ''
      update({ phase: 'reveal', revealed: answer, word: '' })
      broadcast('end', { word: answer, scores: game.scores, reason: 'timeout' })
    }, 500)

    return () => {
      disposed = true
      clearInterval(timer)
      channelRef.current = null
      try { channel.untrack?.() } catch { /* 通道已关闭时忽略 */ }
      supabase.removeChannel(channel)
    }
  }, [applyReaction, broadcast, displayName, enabled, roomId, userId, user?.avatarUrl])

  return {
    ...state,
    isDrawer: Boolean(userId) && state.drawerId === userId,
    startRound,
    endRound,
    sendGuess,
    sendReaction,
    sendStroke,
    clearBoard,
  }
}
