import { describe, expect, it } from 'vitest'
import { addFeed, applyCorrectGuess, formatClock, rankPlayers, remainingSeconds, REACTION_EMOJI, REACTION_KINDS } from './drawGame.js'
import { DRAW_WORDS, isCorrectGuess, maskWord, normalizeGuess, pickWord } from './words.js'

describe('draw game words', () => {
  it('keeps a stable, duplicate-free word list', () => {
    expect(DRAW_WORDS).toHaveLength(48)
    expect(new Set(DRAW_WORDS).size).toBe(48)
    expect(DRAW_WORDS).toContain('谷园餐厅')
  })

  it('normalises guesses before comparing', () => {
    expect(normalizeGuess('  谷 园！ ')).toBe('谷园')
    expect(normalizeGuess('ＱＵＩＺ')).toBe('quiz')
    expect(isCorrectGuess(' 谷园餐厅 ', '谷园餐厅')).toBe(true)
    expect(isCorrectGuess('谷园', '谷园餐厅')).toBe(false)
    expect(isCorrectGuess('', '谷园餐厅')).toBe(false)
  })

  it('masks every character so guessers know the length', () => {
    expect(maskWord('图书馆')).toBe('＿ ＿ ＿')
  })

  it('picks words from the pool', () => {
    expect(pickWord(() => 0)).toBe(DRAW_WORDS[0])
    expect(pickWord(() => 0.999999)).toBe(DRAW_WORDS.at(-1))
    expect(DRAW_WORDS).toContain(pickWord(() => 0.37))
  })
})

describe('draw game helpers', () => {
  const players = [
    { user_id: 'a', joined_at: 1 },
    { user_id: 'b', joined_at: 2 },
    { user_id: 'c', joined_at: 3 },
  ]

  it('scores both the guesser and the drawer', () => {
    expect(applyCorrectGuess({}, 'b', 'a')).toEqual({ b: 1, a: 1 })
    expect(applyCorrectGuess({ b: 2 }, 'b', 'b')).toEqual({ b: 3 })
  })

  it('ranks players by score and keeps join order on ties', () => {
    const ranked = rankPlayers(players, { a: 1, c: 3 })
    expect(ranked.map((player) => player.user_id)).toEqual(['c', 'a', 'b'])
  })

  it('dedupes feed entries by id and keeps the newest ones', () => {
    const feed = addFeed([], { id: '1', text: 'a' })
    expect(addFeed(feed, { id: '1', text: 'a' })).toHaveLength(1)
    const many = Array.from({ length: 12 }, (_, index) => addFeed([], { id: String(index), text: String(index) }))
      .reduce((accumulator, entry) => addFeed(accumulator, entry[0]), [])
    expect(many).toHaveLength(8)
    expect(many.at(-1).id).toBe('11')
  })

  it('formats the countdown', () => {
    expect(formatClock(90)).toBe('1:30')
    expect(formatClock(0)).toBe('0:00')
    expect(remainingSeconds(1000, 0)).toBe(1)
    expect(remainingSeconds(0, 5000)).toBe(0)
  })

  it('exposes the three reactions with their emoji', () => {
    expect(REACTION_KINDS).toEqual(['like', 'egg', 'bomb'])
    expect(REACTION_EMOJI.like).toBe('👍')
    expect(REACTION_EMOJI.egg).toBe('🥚')
    expect(REACTION_EMOJI.bomb).toBe('💣')
  })
})
