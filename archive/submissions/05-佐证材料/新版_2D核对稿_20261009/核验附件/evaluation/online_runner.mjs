import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateExtractedEvent } from 'file:///D:/project/college/26_10_8_college/04-应用开发/OurCampus/supabase/functions/_shared/auv.js'

const here = path.dirname(fileURLToPath(import.meta.url))
if (!process.argv.includes('--execute')) {
  console.log('未发起任何在线请求。用法：node online_runner.mjs --execute；先按README准备专用测试配置、模型身份和二审标准答案。')
  process.exit(0)
}
const configFile = process.env.AUV_EVAL_CONFIG_FILE
if (!configFile) throw new Error('请通过 AUV_EVAL_CONFIG_FILE 指定本机私有JSON配置；配置不得加入公开交付包。')
const config = JSON.parse(fs.readFileSync(configFile, 'utf8'))
if (!config.base_url?.startsWith('https://') || !config.api_key || !config.gold_reviewed || !config.model_identity) throw new Error('需要HTTPS地址、密钥、真实模型版本和已完成二审的标记。')
if (!['direct_model', 'app_gateway'].includes(config.mode)) throw new Error('mode必须为direct_model或app_gateway')
if (config.mode === 'app_gateway' && !config.access_token) throw new Error('网关模式需要专用测试账号的访问令牌。')
const file = config.cases_file ?? path.join(here, 'online_quality_cases.json')
const cases = JSON.parse(fs.readFileSync(file, 'utf8'))
const resultFile = path.join(here, `online_run_${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`)
const stream = fs.createWriteStream(resultFile, { flags: 'wx' })
let passed = 0, comparable = 0
for (const c of cases) {
  const start = performance.now()
  const row = { id: c.id, model_identity: config.model_identity, mode: config.mode, input: c.text, expected: c.expected, started_at: new Date().toISOString() }
  try {
    const direct = config.mode === 'direct_model'
    const url = direct ? config.base_url.replace(/\/+$/, '') + '/v1/chat/completions' : config.base_url
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${direct ? config.api_key : config.access_token}` }
    if (!direct && config.publishable_key) headers.apikey = config.publishable_key
    const body = direct ? { model: c.mode === 'extract' ? config.extract_model ?? 'extract' : config.persona_model ?? 'persona', temperature: 0, stream: false, max_tokens: 600, messages: [{ role: 'system', content: 'You are a helpful assistant.' }, { role: 'user', content: c.instruction + '\n' + c.text }] } : { mode: c.mode, text: c.text, locationId: c.selectedLocationId ?? null, history: [] }
    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(65000) })
    row.http_status = response.status
    const raw = await response.text()
    if (!response.ok) row.error_code = `http_${response.status}`
    else {
      const data = JSON.parse(raw), text = direct ? data.choices?.[0]?.message?.content : data.text
      row.output = text
      if (c.mode === 'extract' && c.expected?.type) {
        if (direct) {
          try {
            const start=text.indexOf('{'),end=text.lastIndexOf('}')
            const rawFields=JSON.parse(text.slice(start,end+1));row.raw_model_fields=rawFields
            row.raw_model_checks={ type_correct:rawFields.type===c.expected.type,place_correct:rawFields.building_id===c.expected.building_id }
          } catch { row.raw_model_checks={parseable:false} }
        }
        const accepted = direct ? validateExtractedEvent(text, c.text, c.selectedLocationId) : data.event
        row.accepted_event = accepted
        row.checks = { type_correct: accepted?.type === c.expected.type, place_correct: accepted?.building_id === c.expected.building_id, location_status_correct: accepted?.location_status === c.expected.location_status }
        comparable++; if (Object.values(row.checks).every(Boolean)) passed++
      } else row.manual_review_required = true
    }
  } catch (error) { row.error_code = error.name ?? 'request_failure' }
  row.elapsed_ms = Math.round(performance.now() - start)
  stream.write(JSON.stringify(row) + '\n')
  // Respect the current eight-requests-per-minute gateway policy. Do not retry to select good outputs.
  await new Promise(resolve => setTimeout(resolve, Math.max(8000, config.interval_ms ?? 8000)))
}
await new Promise(resolve => stream.end(resolve))
console.log(JSON.stringify({ result_file: resultFile, executed: cases.length, comparable, strict_checks_passed: passed, warning: '此汇总仅供核对；问答内容、原始模型字段与失败请求必须另行审阅，不能用accepted_event分数替代原始模型准确率。' }))
