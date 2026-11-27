import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { evaluateLocationInterest } from './policy.mjs'

const fixturePath = process.argv[2] ?? new URL('./fixtures.json', import.meta.url)
const raw = await readFile(fixturePath)
const cases = JSON.parse(raw)
assert(Array.isArray(cases) && cases.length > 0, 'A labeled fixture array is required')

const nowOrScheduled = new Set(['now','digest'])
const allowed = new Set([...nowOrScheduled,'inbox','skip'])
const ids = new Set()
const distinctEvents = new Map()
const actions = { now:0, digest:0, inbox:0, skip:0 }
const scheduledKinds = { delayed_individual:0, digest:0 }
const mismatches = []
const critical = []
let hard = 0, hardLeaks = 0, planned = 0, sound = 0, expectedImmediate = 0, immediateHits = 0
for (const row of cases) {
  assert(typeof row.id === 'string' && row.id.length && !ids.has(row.id), 'Duplicate or invalid case ID')
  assert(typeof row.eventId === 'string' && row.eventId.length, row.id)
  assert(typeof row.hardCase === 'boolean' && typeof row.description === 'string', row.id)
  assert(allowed.has(row.expected.action) && typeof row.expected.reason === 'string', row.id)
  ids.add(row.id)
  const eventKey = JSON.stringify(Object.fromEntries(Object.entries(row.event).sort()))
  if (distinctEvents.has(row.eventId)) assert.equal(distinctEvents.get(row.eventId),eventKey,'Event fields vary for '+row.eventId)
  else distinctEvents.set(row.eventId,eventKey)

  const result = evaluateLocationInterest(row.event,row.user)
  assert.notEqual(result.reason,'invalid_input',row.id)
  actions[result.action]++
  if (result.scheduleKind) scheduledKinds[result.scheduleKind]++
  if (row.hardCase) hard++
  if (result.action !== row.expected.action || result.reason !== row.expected.reason) {
    mismatches.push({ id:row.id, expected:row.expected, actual:result })
  }
  if (row.expected.action === 'now') {
    expectedImmediate++
    if (result.action === 'now') immediateHits++
  }
  if (nowOrScheduled.has(result.action)) {
    planned++
    if (result.action === row.expected.action) sound++
    if (row.hardCase) hardLeaks++
    if (!row.user.canView || !row.user.optedIn || row.user.isAuthor || row.user.alreadyRead || row.user.duplicate
        || row.event.provenance === 'public' || row.event.usefulUntil === null
        || !['active','upcoming'].includes(row.event.state) || !row.user.systemEnabled
        || !(row.user.subscribed || row.user.favoriteOptIn) || row.user.interestSendsToday >= 2
        || row.user.deliveryMode === 'inbox'
        || result.plannedInMinutes < Math.max(0, row.user.quietUntil ?? 0)
        || result.plannedInMinutes >= row.event.usefulUntil) {
      critical.push(row.id)
    }
  }
}
const rate = (correct,total) => total === 0 ? null : correct/total
const precision = rate(sound,planned)
const immediateRecall = rate(immediateHits,expectedImmediate)
const result = {
  policyVersion:'location-interest-shadow-v1',
  fixtureFile:typeof fixturePath === 'string' ? fixturePath : fileURLToPath(fixturePath).split(/[\\/]/).pop(),
  fixtureSha256:createHash('sha256').update(raw).digest('hex'),
  evidence:'synthetic_policy_replay',
  samples:cases.length, distinctEvents:distinctEvents.size, difficultNegativeCases:hard,
  observedActions:actions, scheduledKinds, plannedSystemNotifications:planned,
  systemActionAgreement:precision, systemActionsMatchingLabel:sound,
  immediateRecall, expectedImmediate, immediateHits,
  hardNegativeSystemLeaks:hardLeaks, criticalGateViolations:critical,
  labelAgreement:rate(cases.length-mismatches.length,cases.length), mismatches,
  syntheticThresholdsMet:cases.length >= 200 && hard >= 50 && planned >= 60 &&
    precision >= .95 && immediateRecall >= .80 && critical.length === 0 && hardLeaks === 0,
  productionRolloutEligible:false,
  evidenceLimit:'Synthetic labels and structured inputs exercise the rule policy. They do not test AI extraction, representative factual accuracy, Android reception, or a production send.',
}
console.log(JSON.stringify(result,null,2))
if (!result.syntheticThresholdsMet || mismatches.length) process.exitCode=1
