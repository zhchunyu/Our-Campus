import { useEffect, useMemo, useRef, useState } from 'react'
import { Eraser, Play, RotateCcw, Send, Users } from 'lucide-react'
import { getAvatarUrl } from '../../data/memberProfiles.js'
import { DrawCanvas } from './DrawCanvas.jsx'
import { useDrawGame } from './useDrawGame.js'
import { DRAW_COLORS, ROUND_SECONDS, formatClock, rankPlayers, remainingSeconds } from './drawGame.js'
import './drawGame.css'

const WIDTHS = [
  { value: 4, label: '细' },
  { value: 7, label: '中' },
  { value: 12, label: '粗' },
]

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
  const inputRef = useRef(null)

  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), 500)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => { setDraft('') }, [game.phase, game.roundNo])

  const remaining = remainingSeconds(game.endsAt, tick)
  const progress = game.phase === 'playing' ? Math.min(100, Math.max(0, (remaining / ROUND_SECONDS) * 100)) : 0
  const ranking = useMemo(() => rankPlayers(game.players, game.scores), [game.players, game.scores])
  const myScore = game.scores?.[user?.id] ?? 0

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
    <section className="draw-game" aria-label="你画我猜">
      <header className="draw-game__head">
        <div>
          <h3>你画我猜 · {regionLabel}</h3>
          <p><span className={`draw-game__dot draw-game__dot--${game.status === 'live' ? 'live' : 'wait'}`} />{STATUS_TEXT[game.status] ?? '未连接'} · 第 {game.roundNo || 0} 局</p>
        </div>
        <span className="draw-game__count" title="牌桌在线人数"><Users size={13} />{game.players.length || 1}</span>
      </header>

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

      <footer className="draw-game__scores">
        <span>本局得分</span>
        <div>
          <span className="draw-game__me">我 {myScore}</span>
          {ranking.filter((player) => player.user_id !== user.id).slice(0, 5).map((player) => (
            <span key={player.user_id}>{player.name} {game.scores?.[player.user_id] ?? 0}</span>
          ))}
          {ranking.length === 0 && <span>等你来开第一局</span>}
        </div>
      </footer>
    </section>
  )
}
