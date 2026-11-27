const kinds = new Set(['closure', 'opening', 'other'])
const sources = new Set(['official', 'reviewed', 'public'])
const states = new Set(['active', 'upcoming', 'unknown', 'historical', 'negated', 'withdrawn'])
const modes = new Set(['immediate', 'digest', 'inbox'])
const inactiveStates = new Set(['historical', 'negated', 'withdrawn'])
const booleanPreferences = [
  'canView', 'optedIn', 'isAuthor', 'subscribed', 'favoriteOptIn', 'weakMatch',
  'systemEnabled', 'alreadyRead', 'duplicate',
]

function decision(action, reason, plannedInMinutes = null) {
  return { action, reason, plannedInMinutes }
}

function nullableTime(value) {
  return value === null || Number.isFinite(value)
}

function valid(event, user) {
  return event && user
    && kinds.has(event.kind) && sources.has(event.provenance) && states.has(event.state)
    && typeof event.timeSensitive === 'boolean' && nullableTime(event.usefulUntil)
    && modes.has(user.deliveryMode) && nullableTime(user.quietUntil) && nullableTime(user.digestAt)
    && Number.isSafeInteger(user.interestSendsToday) && user.interestSendsToday >= 0
    && booleanPreferences.every(name => typeof user[name] === 'boolean')
}

/**
 * Returns a shadow-only decision from server-verified fields. Authorization and
 * provenance must already be resolved by a trusted reader of the business data.
 * All times are minutes from a common decision clock. No I/O occurs here.
 */
export function evaluateLocationInterest(event, user) {
  if (!valid(event, user)) return decision('skip', 'invalid_input')
  if (event.kind === 'other') return decision('skip', 'out_of_scope')
  if (!user.canView) return decision('skip', 'not_visible')
  if (!user.optedIn) return decision('skip', 'not_opted_in')
  if (user.isAuthor) return decision('skip', 'self_authored')
  if (user.alreadyRead) return decision('skip', 'already_read')
  if (user.duplicate) return decision('skip', 'duplicate')
  if (inactiveStates.has(event.state)) return decision('skip', 'inactive_source')
  if (event.usefulUntil !== null && event.usefulUntil <= 0) return decision('skip', 'expired')

  const explicitlyRelated = user.subscribed || user.favoriteOptIn
  if (!explicitlyRelated && !user.weakMatch) return decision('skip', 'no_match')
  if (event.provenance === 'public' || event.state === 'unknown' || event.usefulUntil === null) {
    return decision('inbox', 'unverified_or_unclear')
  }
  if (!explicitlyRelated) return decision('inbox', 'weak_match')
  if (!user.systemEnabled || user.deliveryMode === 'inbox') return decision('inbox', 'user_inbox_only')
  if (user.interestSendsToday >= 2) return decision('inbox', 'daily_limit')

  const quietEndsIn = Math.max(0, user.quietUntil ?? 0)
  const prefersImmediate = user.deliveryMode === 'immediate' && event.timeSensitive
  if (prefersImmediate && quietEndsIn === 0) return decision('now', 'timely_explicit_match', 0)
  const slot = prefersImmediate ? quietEndsIn : (
    user.digestAt === null || user.digestAt < 0 ? null : Math.max(user.digestAt, quietEndsIn)
  )
  if (slot !== null && slot < event.usefulUntil) {
    return {
      ...decision('digest', 'scheduled', slot),
      scheduleKind: prefersImmediate ? 'delayed_individual' : 'digest',
    }
  }
  return decision('inbox', 'no_useful_window')
}
