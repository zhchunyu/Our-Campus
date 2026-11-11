// Only user-facing chat fields are rendered. Metadata never authorizes facts.
const metadataKeys = new Set(['source', 'queried_at'])
const chatKeys = new Set(['answer', 'options', ...metadataKeys])
const hasInternalFields = (text) => /"(?:source|queried_at)"\s*:/.test(text)
const invalid = () => { throw new Error('invalid_chat_output') }

export function formatChatReply(value) {
  let raw = String(value ?? '').trim()
  if (!raw || raw.length > 16000) invalid()
  if (raw.startsWith('```')) {
    const fence = raw.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i)
    if (!fence) invalid()
    raw = fence[1].trim()
  }
  if (!/^[{\[]/.test(raw)) {
    if (hasInternalFields(raw) || raw.includes('```')) invalid()
    return raw
  }

  let parsed
  try { parsed = JSON.parse(raw) }
  catch {
    // Compatibility for complete comma-separated objects, as seen in the app.
    // Parsing the entire sequence rejects truncated objects and trailing prose.
    try { parsed = JSON.parse('[' + raw + ']') } catch { invalid() }
  }
  const records = Array.isArray(parsed) ? parsed : [parsed]
  if (!records.length || records.length > 6) invalid()
  const answers = new Map()
  for (const record of records) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) invalid()
    const keys = Object.keys(record)
    if (!keys.length || keys.some(key => !chatKeys.has(key))) invalid()
    for (const key of metadataKeys) {
      if (Object.hasOwn(record, key) && typeof record[key] !== 'string') invalid()
    }
    if (!Object.hasOwn(record, 'answer')) {
      if (keys.some(key => !metadataKeys.has(key))) invalid()
      continue
    }
    if (typeof record.answer !== 'string' || !record.answer.trim()) invalid()
    if (record.options !== undefined && (!Array.isArray(record.options) || record.options.length > 6 || record.options.some(option => typeof option !== 'string' || !option.trim() || option.length > 1000))) invalid()
    const answer = record.answer.trim()
    const options = [...new Set((record.options ?? []).map(option => option.trim()))].filter(option => option !== answer)
    const normalized = { answer, options }
    answers.set(JSON.stringify(normalized), normalized)
  }
  if (answers.size !== 1) invalid()
  const { answer, options } = [...answers.values()][0]
  const visible = [answer, ...options.map(option => '- ' + option)].join('\n')
  if (hasInternalFields(visible)) invalid()
  return visible
}
