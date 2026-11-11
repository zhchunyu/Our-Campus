// Read-only parser for the school's BIFF8 XLS export. No macros or formulas execute.
const fail = () => { throw new Error('无法完整识别这份课表，请使用支持的教务格式导出的学生个人课表 .xls 文件') }

function readBiff(buffer) {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  if (view.getUint32(0, true) !== 0xe011cfd0 || view.getUint32(4, true) !== 0xe11ab1a1) fail()
  const size = 2 ** view.getUint16(30, true)
  if (![512, 4096].includes(size)) fail()
  const sectorCount = Math.ceil(bytes.length / size) - 1
  const readSector = (id) => { if (id >= sectorCount) fail(); return bytes.slice((id + 1) * size, (id + 2) * size) }
  const ints = (data) => { const v = new DataView(data.buffer, data.byteOffset, data.byteLength); return Array.from({ length: Math.floor(data.length / 4) }, (_, i) => v.getUint32(i * 4, true)) }
  const fatIds = Array.from({ length: 109 }, (_, i) => view.getUint32(76 + i * 4, true)).filter((id) => id < 0xfffffffa)
  let difatId = view.getUint32(68, true)
  const difatCount = view.getUint32(72, true)
  if (difatCount > sectorCount) fail()
  const difatSeen = new Set()
  for (let i = 0; i < difatCount; i++) {
    if (difatSeen.has(difatId)) fail()
    difatSeen.add(difatId)
    const entries = ints(readSector(difatId))
    fatIds.push(...entries.slice(0, -1).filter((id) => id < 0xfffffffa))
    difatId = entries.at(-1)
  }
  if (fatIds.length > sectorCount || new Set(fatIds).size !== fatIds.length) fail()
  const fat = fatIds.flatMap((id) => ints(readSector(id)))
  const chain = (id, table, getSector) => {
    const parts = [], seen = new Set()
    let total = 0
    while (id < 0xfffffffa) {
      if (seen.has(id) || id >= table.length) fail()
      seen.add(id)
      const part = getSector(id)
      total += part.length
      if (total > 8 * 1024 * 1024) fail()
      parts.push(part); id = table[id]
    }
    const result = new Uint8Array(total)
    let offset = 0
    for (const part of parts) { result.set(part, offset); offset += part.length }
    return result
  }
  const directory = chain(view.getUint32(48, true), fat, readSector)
  const entries = []
  for (let offset = 0; offset + 128 <= directory.length; offset += 128) {
    const entry = new DataView(directory.buffer, offset, 128)
    const length = entry.getUint16(64, true)
    if (length < 2 || length > 64) continue
    const streamSize = entry.getUint32(120, true)
    if (entry.getUint32(124, true) || streamSize > 8 * 1024 * 1024) fail()
    entries.push({ name: new TextDecoder('utf-16le').decode(directory.slice(offset, offset + length - 2)), type: entry.getUint8(66), start: entry.getUint32(116, true), size: streamSize })
  }
  const workbook = entries.find((entry) => ['Workbook', 'Book'].includes(entry.name))
  if (!workbook) fail()
  let stream
  if (workbook.size < view.getUint32(56, true)) {
    const root = entries.find((entry) => entry.type === 5)
    if (!root) fail()
    const mini = chain(root.start, fat, readSector).slice(0, root.size)
    const miniFat = ints(chain(view.getUint32(60, true), fat, readSector))
    const miniSize = 2 ** view.getUint16(32, true)
    if (miniSize !== 64) fail()
    stream = chain(workbook.start, miniFat, (id) => { if (id * miniSize >= mini.length) fail(); return mini.slice(id * miniSize, (id + 1) * miniSize) })
  } else stream = chain(workbook.start, fat, readSector)
  stream = stream.slice(0, workbook.size)
  const records = []
  for (let offset = 0; offset + 4 <= stream.length;) {
    const v = new DataView(stream.buffer, offset)
    const kind = v.getUint16(0, true), length = v.getUint16(2, true)
    if (offset + 4 + length > stream.length) fail()
    records.push({ offset, kind, data: stream.slice(offset + 4, offset + 4 + length) }); offset += length + 4
  }
  const decodeString = (data, offset) => {
    const v = new DataView(data.buffer, data.byteOffset, data.byteLength)
    const count = v.getUint16(offset, true), flags = v.getUint8(offset + 2)
    offset += 3
    const rich = flags & 8 ? v.getUint16(offset, true) : 0
    if (flags & 8) offset += 2
    const extension = flags & 4 ? v.getUint32(offset, true) : 0
    if (flags & 4) offset += 4
    const length = count * (flags & 1 ? 2 : 1)
    const end = offset + length + rich * 4 + extension
    if (end > data.length) fail() // Continuations are rejected rather than silently losing courses.
    const raw = data.slice(offset, offset + length)
    const text = flags & 1 ? new TextDecoder('utf-16le').decode(raw) : Array.from(raw, (code) => String.fromCharCode(code)).join('')
    return { text, end }
  }
  const strings = [], sheets = []
  for (let i = 0; i < records.length; i++) {
    const record = records[i], v = new DataView(record.data.buffer)
    if (record.kind === 0x2f) throw new Error('课表已加密，请导出未加密的课表再导入')
    if (record.kind === 0xfc) {
      if (records[i + 1]?.kind === 0x3c) fail()
      const count = v.getUint32(4, true)
      if (count > 20000) fail()
      let offset = 8
      for (let j = 0; j < count; j++) { const parsed = decodeString(record.data, offset); strings.push(parsed.text); offset = parsed.end }
    }
    if (record.kind === 0x85) sheets.push(v.getUint32(0, true))
  }
  return sheets.map((start, i) => {
    const cells = [], stop = sheets[i + 1] ?? stream.length
    for (const { offset, kind, data } of records) {
      if (offset < start || offset >= stop) continue
      const v = new DataView(data.buffer)
      let text
      if (kind === 0xfd) { text = strings[v.getUint32(6, true)]; if (text === undefined) fail() }
      else if (kind === 0x204) text = decodeString(data, 6).text
      else if (kind === 0x203) text = String(v.getFloat64(6, true))
      else if ([0x6, 0x27e, 0xbd, 0x205, 0xd6].includes(kind)) fail()
      if (text !== undefined) cells.push({ row: v.getUint16(0, true) + 1, col: v.getUint16(2, true) + 1, text })
    }
    return cells
  })
}

export function normalizeTimetable(cells) {
  const weekdays = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日']
  const header = cells.find((cell) => cell.text.trim() === '星期一')
  if (!header || !weekdays.every((label, i) => cells.some((cell) => cell.row === header.row && cell.col === header.col + i && cell.text.trim() === label))) fail()
  const semester = cells.map((cell) => cell.text).join('\n').match(/学年学期[：:]\s*(\d{4}-\d{4}-\d)/)?.[1]
  if (!semester) fail()
  const slots = cells.filter((cell) => cell.row > header.row && cell.col === header.col - 1).flatMap((cell) => {
    const parsed = cell.text.match(/\((\d+),(\d+)\)\s*(\d{2}:\d{2})-(\d{2}:\d{2})/)
    return parsed ? [{ row: cell.row, periods: [Number(parsed[1]), Number(parsed[2])], startTime: parsed[3], endTime: parsed[4] }] : []
  })
  if (!slots.length || slots.length > 12) fail()
  const courses = []
  for (const slot of slots) for (let weekday = 1; weekday <= 7; weekday++) {
    const cell = cells.find((cell) => cell.row === slot.row && cell.col === header.col + weekday - 1)
    if (!cell?.text.trim()) continue
    const lines = cell.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    if (lines.length % 4) fail()
    for (let i = 0; i < lines.length; i += 4) {
      const [name, teacher, rule, classroom] = lines.slice(i, i + 4)
      const match = rule.match(/^([\d,，\-]+)\(\[周\]\)\[(\d+)-(\d+)节\]$/)
      if (!match || name.length > 100 || teacher.length > 80 || classroom.length > 100) fail()
      const periods = [Number(match[2]), Number(match[3])]
      if (periods.some((value, index) => value !== slot.periods[index])) fail()
      const weeks = []
      for (const part of match[1].split(/[,，]/)) {
        const [first, last = first] = part.split('-').map(Number)
        if (first < 1 || first > last || last > 30) fail()
        for (let week = first; week <= last; week++) weeks.push(week)
      }
      const sourceCell = `${String.fromCharCode(64 + cell.col)}${cell.row}`
      courses.push({ id: `import-${sourceCell}-${i / 4}`, name, teacher, weekday, weeks: [...new Set(weeks)].sort((a,b) => a-b), periods, startTime: slot.startTime, endTime: slot.endTime, classroom, sourceCell })
    }
  }
  if (!courses.length || courses.length > 200) fail()
  const notes = cells.filter((cell) => cell.row > Math.max(...slots.map((slot) => slot.row))).map((cell) => cell.text).join(';')
  const unscheduled = []
  for (const item of notes.split(/[;；]/).map((item) => item.replace(/^[：:\s]+/, '').trim()).filter(Boolean)) {
    if (!/\d.*周/.test(item)) continue
    const name = item.split(/\s+/)[0]
    if (!courses.some((course) => course.name === name) && !unscheduled.some((course) => course.name === name)) unscheduled.push({ name: name.slice(0, 100), note: item.slice(0, 200) })
  }
  return { version: 1, semester, courses, unscheduled, importedAt: new Date().toISOString(), termStart: '', dateConfirmed: false }
}

export function parseTimetableBuffer(buffer) {
  try {
    if (buffer.byteLength < 64 || buffer.byteLength > 4 * 1024 * 1024) throw new Error('请选择有效的课表文件，大小不超过 4 MB')
    const sheets = readBiff(buffer)
    const cells = sheets.find((cells) => cells.some((cell) => cell.text.trim() === '星期一'))
    if (!cells) fail()
    return normalizeTimetable(cells)
  } catch (error) { if (error instanceof RangeError || error instanceof TypeError) fail(); throw error }
}

export async function importTimetableFile(file) {
  if (!file || !/\.xls$/i.test(file.name)) throw new Error('首版支持教务导出的 .xls 个人课表，请选择该格式')
  if (file.size > 4 * 1024 * 1024) throw new Error('课表文件不能超过 4 MB')
  return parseTimetableBuffer(await file.arrayBuffer())
}
