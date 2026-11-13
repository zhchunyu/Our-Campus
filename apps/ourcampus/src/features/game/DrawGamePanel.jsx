import { useEffect, useMemo, useRef, useState } from 'react'
import { Eraser, Play, RotateCcw, Send, Users } from 'lucide-react'
import { getAvatarUrl } from '../../data/memberProfiles.js'
import { DrawCanvas } from './DrawCanvas.jsx'
import { useDrawGame } from './useDrawGame.js'
import { DRAW_COLORS, REACTION_EMOJI, REACTION_KINDS, ROUND_SECONDS, formatClock, rankPlayers, remainingSeconds } from './drawGame.js'
import './drawGame.css'

const WIDTHS = [
  { value: 4, label: '细' },
  { value: 7, label: '中' },
  { value: 12, label: '粗' },
]

const REACTION_LABELS = { like: '点赞', egg: '扔鸡蛋', bomb: '扔炸弹' }

const STATUS_TEXT = {
  idle: '未连接',
  connecting: '正在连接牌桌…',
  live: '已连上牌桌',
}

function maskByLength(length) {
  return Array.from({ length: Math.max(1, length) }).map(() => '＿').join(' ')
}

export function DrawGamePanel({ regionId, regionLabel, auth, onOpenLogin }) {
  const profile = auth?.profile
  const user = auth?.user
    ? { id: auth.user.id, name: profile?.nickname || '同学', avatarUrl: getAvatarUrl(profile?.avatar_path) }
    : null
  const game = useDrawGame({ roomId: regionId, user })
  const [draft, setDraft] = useState('')
  const [color, setColor] = useState(DRAW_COLORS[0])
  const [width, setWidth] = useState(7)
  const [tick, setTick] = useState(() => Date.now())
  const [targetId, setTargetId] = useState(null)
  const [fx, setFx] = useState(null)
  const [cooling, setCooling] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), 500)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => { setDraft('') }, [game.phase, game.roundNo])

  useEffect(() => {
    const reaction = game.lastReaction
    if (!reaction) return undefined
    setFx(reaction)
    const timer = setTimeout(() => setFx(null), 900)
    return () => clearTimeout(timer)
  }, [game.lastReaction])

  useEffect(() => {
    if (!targetId) return
    if (!game.players.some((player) => player.user_id === targetId)) setTargetId(null)
  }, [game.players, targetId])

  useEffect(() => {
    if (!cooling) return undefined
    const timer = setTimeout(() => setCooling(false), 800)
    return () => clearTimeout(timer)
  }, [cooling])

  const remaining = remainingSeconds(game.endsAt, tick)
  const progress = game.phase === 'playing' ? Math.min(100, Math.max(0, (remaining / ROUND_SECONDS) * 100)) : 0
  const ranking = useMemo(() => rankPlayers(game.players, game.scores), [game.players, game.scores])

  if (!user) {
    return (
      <section className="draw-game draw-game--gate" aria-label="你画我猜">
        <div className="draw-game__gate">
          <h3>你画我猜</h3>
          <p>登录后就能和同地区的同学开一局：一个人画，其他人猜。</p>
          <button type="button" className="draw-game__primary" onClick={onOpenLogin}>登录 / 注册</button>
        </div>
      </section>
    )
  }

  const roster = game.players.length ? game.players : [{ user_id: user.id, name: user.name, avatar_url: user.avatarUrl, joined_at: 0 }]
  const target = targetId ?? game.drawerId ?? roster[0]?.user_id ?? null
  const reactions = game.reactions ?? {}

  const submitGuess = (event) => {
    event.preventDefault()
    const text = draft.trim()
    if (!text) return
    game.sendGuess(text)
    setDraft('')
    inputRef.current?.focus()
  }

  const canDraw = game.phase === 'playing' && game.isDrawer
  const canGuess = game.phase === 'playing' && !game.isDrawer
  const showLobby = game.phase === 'lobby'
  const showReveal = game.phase === 'reveal'

  return (
    <section className={`draw-game${fx?.kind === 'bomb' ? ' is-shaking' : ''}`} aria-label="你画我猜">
      <header className="draw-game__head">
        <div>
          <h3>你画我猜 · {regionLabel}</h3>
          <p><span className={`draw-game__dot draw-game__dot--${game.status === 'live' ? 'live' : 'wait'}`} />{STATUS_TEXT[game.status] ?? '未连接'} · 第 {game.roundNo || 0} 局</p>
        </div>
        <span className="draw-game__count" title="牌桌在线人数"><Users size={13} />{roster.length}</span>
      </header>

      <div className="draw-game__players" role="group" aria-label="在线玩家">
        {roster.map((player) => {
          const score = game.scores?.[player.user_id] ?? 0
          const counts = reactions[player.user_id] ?? {}
          const isDrawer = player.user_id === game.drawerId
          const isTarget = player.user_id === target
          const received = [counts.egg ? `🥚${counts.egg}` : '', counts.bomb ? `💣${counts.bomb}` : '', counts.like ? `👍${counts.like}` : ''].filter(Boolean).join(' ')
          return (
            <button
              key={player.user_id}
              type="button"
              className={`draw-game__player${isTarget ? ' is-target' : ''}${isDrawer ? ' is-drawer' : ''}${fx?.target === player.user_id ? ' is-hit' : ''}`}
              aria-pressed={isTarget}
              aria-label={`${player.name}，${score} 分${isDrawer ? '，正在画' : ''}`}
              onClick={() => setTargetId(player.user_id)}
            >
              <span className="draw-game__avatar">
                {player.avatar_url ? <img src={player.avatar_url} alt="" /> : <i aria-hidden="true">{[...String(player.name ?? '同')][0]}</i>}
                {isDrawer && <b className="draw-game__drawer-badge">画</b>}
              </span>
              <strong>{player.user_id === user.id ? '我' : player.name}</strong>
              <small>{score} 分</small>
              {received && <em className="draw-game__received">{received}</em>}
              {fx?.target === player.user_id && <span key={fx.id} className={`draw-game__fx draw-game__fx--${fx.kind}`} aria-hidden="true">{REACTION_EMOJI[fx.kind]}</span>}
            </button>
          )
        })}
      </div>

      <div className="draw-game__reactions" role="group" aria-label="互动">
        {REACTION_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            className="draw-game__reaction"
            disabled={game.status !== 'live' || !target || cooling}
            onClick={() => { if (game.sendReaction(kind, target)) setCooling(true) }}
            aria-label={REACTION_LABELS[kind]}
          >
            <span aria-hidden="true">{REACTION_EMOJI[kind]}</span>{REACTION_LABELS[kind]}
          </button>
        ))}
        <small className="draw-game__reaction-target">对 {roster.find((player) => player.user_id === target)?.name ?? '…'}</small>
      </div>

      <div className="draw-game__stage">
        <DrawCanvas
          strokes={game.strokes}
          drawing={canDraw}
          onStroke={game.sendStroke}
          color={color}
          width={width}
        />
        {game.status !== 'live' && <div className="draw-game__overlay"><p>正在连接牌桌…</p></div>}
        {game.status === 'live' && showLobby && (
          <div className="draw-game__overlay">
            <h4>牌桌已就绪</h4>
            <p>点一下开始，你就是这一局的画手；其他人直接猜。</p>
            <button type="button" className="draw-game__primary" onClick={game.startRound}><Play size={15} />我来画</button>
          </div>
        )}
        {game.status === 'live' && game.phase === 'playing' && game.drawerLeft && (
          <div className="draw-game__overlay">
            <h4>画手离开了牌桌</h4>
            <p>重新开一局，换个人来画。</p>
            <button type="button" className="draw-game__primary" onClick={game.startRound}><Play size={15} />重新开始</button>
          </div>
        )}
        {game.status === 'live' && showReveal && (
          <div className="draw-game__overlay draw-game__overlay--result">
            <h4>本局答案：{game.revealed || '—'}</h4>
            <p>{ranking.slice(0, 3).map((player) => `${player.name} ${game.scores?.[player.user_id] ?? 0}`).join(' · ') || '还没有人得分'}</p>
            <button type="button" className="draw-game__primary" onClick={game.startRound}><RotateCcw size={15} />再来一局</button>
          </div>
        )}
      </div>

      <div className="draw-game__word">
        {canDraw && <><small>你要画</small><strong>{game.word}</strong></>}
        {canGuess && <><small>答案 {game.wordLength} 个字</small><strong className="draw-game__mask">{maskByLength(game.wordLength)}</strong></>}
        {!canDraw && !canGuess && <><small>{showReveal ? '本局答案' : '准备开始'}</small><strong className="draw-game__mask">{showReveal ? (game.revealed || '—') : '还没有开始'}</strong></>}
        <span className="draw-game__timer-text">{game.phase === 'playing' ? formatClock(remaining) : '—'}</span>
      </div>
      <div className="draw-game__timer" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>

      <ol className="draw-game__feed" aria-live="polite">
        {game.feed.length === 0 && <li className="draw-game__feed-empty">{game.phase === 'playing' ? '还没有人猜，输入你的答案试试。' : '猜对的同学会上榜。'}</li>}
        {game.feed.map((entry) => (
          <li key={entry.id} className={entry.kind === 'correct' ? 'is-correct' : ''}>
            {entry.kind === 'correct' ? <><strong>{entry.name}</strong> 猜对了：{entry.text}</> : <><strong>{entry.name}</strong>：{entry.text}</>}
          </li>
        ))}
      </ol>

      {canGuess && (
        <form className="draw-game__guess" onSubmit={submitGuess}>
          <label className="sr-only" htmlFor="draw-game-guess">输入答案</label>
          <input
            id="draw-game-guess"
            ref={inputRef}
            type="text"
            maxLength={24}
            value={draft}
            placeholder="输入你猜的词…"
            onChange={(event) => setDraft(event.target.value)}
          />
          <button type="submit" disabled={!draft.trim()}><Send size={15} />发送</button>
        </form>
      )}

      {canDraw && (
        <div className="draw-game__tools">
          <div className="draw-game__colors" role="group" aria-label="画笔颜色">
            {DRAW_COLORS.map((value) => (
              <button
                key={value}
                type="button"
                className={`draw-game__color${color === value ? ' is-active' : ''}`}
                style={{ background: value }}
                aria-label={`颜色 ${value}`}
                aria-pressed={color === value}
                onClick={() => setColor(value)}
              />
            ))}
          </div>
          <div className="draw-game__widths" role="group" aria-label="画笔粗细">
            {WIDTHS.map((item) => (
              <button key={item.value} type="button" className={width === item.value ? 'is-active' : ''} onClick={() => setWidth(item.value)}>{item.label}</button>
            ))}
          </div>
          <button type="button" className="draw-game__ghost" onClick={game.clearBoard}><Eraser size={14} />清空</button>
          <button type="button" className="draw-game__ghost" onClick={game.endRound}>结束本局</button>
        </div>
      )}
    </section>
  )
}
