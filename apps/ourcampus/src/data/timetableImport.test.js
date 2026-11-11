import { describe, expect, it } from 'vitest'
import { normalizeTimetable } from './timetableImport.js'

function cells(semester = '2026-2027-1') {
  return [
    { row: 1, col: 1, text: '学年学期：' + semester },
    ...['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'].map((text, index) => ({ row: 2, col: index + 2, text })),
    { row: 3, col: 1, text: '(1,2) 08:00-09:40' },
    { row: 3, col: 2, text: '课程A\n教师\n1-4,6([周])[1-2节]\n教室' },
  ]
}

describe('timetable calendar import defaults', () => {
  it.each(['2026-2027-1', '2026-2027-2', '2027-2028-1'])('does not silently prefill an unverified start date for %s', (semester) => {
    expect(normalizeTimetable(cells(semester))).toMatchObject({ semester, termStart: '', dateConfirmed: false })
  })
  it('preserves parsed course scheduling while removing the date guess', () => {
    expect(normalizeTimetable(cells()).courses[0]).toMatchObject({ name: '课程A', weekday: 1, weeks: [1, 2, 3, 4, 6], periods: [1, 2], startTime: '08:00', endTime: '09:40' })
  })
})
