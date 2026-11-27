import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateLocationInterest } from './policy.mjs'

const event = { kind: 'closure', provenance: 'official', state: 'upcoming', usefulUntil: 60, timeSensitive: true }
const user = {
  canView: true, optedIn: true, isAuthor: false, subscribed: true,
  favoriteOptIn: false, weakMatch: false, systemEnabled: true, alreadyRead: false,
  duplicate: false, interestSendsToday: 0, quietUntil: null, digestAt: null, deliveryMode: 'immediate',
}

const cases = [
  ['exact match with a useful deadline', {}, {}, 'now', 'timely_explicit_match', 0],
  ['subscribed but cannot see source', {}, { canView: false }, 'skip', 'not_visible'],
  ['disabled interest retains privacy boundary', {}, { optedIn: false }, 'skip', 'not_opted_in'],
  ['crowd rumor stays in inbox', { provenance: 'public' }, {}, 'inbox', 'unverified_or_unclear'],
  ['negated change does not become a rumor candidate', { state: 'negated' }, {}, 'skip', 'inactive_source'],
  ['already at latest useful time', { usefulUntil: 0 }, {}, 'skip', 'expired'],
  ['quiet ends before deadline', {}, { quietUntil: 45 }, 'digest', 'scheduled', 45, 'delayed_individual'],
  ['quiet ends exactly at deadline', {}, { quietUntil: 60 }, 'inbox', 'no_useful_window'],
  ['digest cannot start inside quiet time', {}, { quietUntil: 40, digestAt: 20, deliveryMode: 'digest' }, 'digest', 'scheduled', 40, 'digest'],
  ['preferred digest is due now', {}, { digestAt: 0, deliveryMode: 'digest' }, 'digest', 'scheduled', 0, 'digest'],
  ['past digest does not schedule a catch-up', {}, { digestAt: -3, quietUntil: 15, deliveryMode: 'digest' }, 'inbox', 'no_useful_window'],
  ['same event sent before', {}, { duplicate: true }, 'skip', 'duplicate'],
  ['third interest alert becomes inbox', {}, { interestSendsToday: 2 }, 'inbox', 'daily_limit'],
  ['explicit favorite follows venue', {}, { subscribed: false, favoriteOptIn: true }, 'now', 'timely_explicit_match', 0],
  ['semantic alone is quiet', {}, { subscribed: false, weakMatch: true }, 'inbox', 'weak_match'],
  ['device delivery disabled', {}, { systemEnabled: false }, 'inbox', 'user_inbox_only'],
  ['out of pilot scope', { kind: 'other' }, {}, 'skip', 'out_of_scope'],
]
for (const [name, changes, preference, action, reason, plannedInMinutes = null, scheduleKind = null] of cases) {
  test(name, () => assert.deepEqual(evaluateLocationInterest({ ...event, ...changes }, { ...user, ...preference }), {
    action, reason, plannedInMinutes, ...(scheduleKind ? { scheduleKind } : {}),
  }))
}

test('malformed time, provenance, boolean or counter fail closed', () => {
  for (const [inputEvent,inputUser] of [
    [{ ...event, usefulUntil: '60' }, user],
    [{ ...event, provenance: 'officially' }, user],
    [event, { ...user, canView: 'true' }],
    [event, { ...user, interestSendsToday: -1 }],
    [{ ...event, usefulUntil: Infinity }, user],
    [null, user],
  ]) assert.deepEqual(evaluateLocationInterest(inputEvent,inputUser), { action:'skip', reason:'invalid_input', plannedInMinutes:null })
})
