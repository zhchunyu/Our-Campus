import { campusDisplayText } from '../../data/campusPresentation.js'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, CalendarDays, Check, FileUp, Settings2, Sparkles } from 'lucide-react'
import { importTimetableFile } from '../../data/timetableImport.js'
import { calibrateTimetable, canUseCalendar, createTimetablePrompt, currentTeachingWeek, dateAnchor, DAY_NAMES, getMaxTeachingWeek, loadTimetable, saveTimetable, scheduleConflicts, validTimetable } from '../../data/timetable.js'
import { useBackLayer } from '../../app/useBackLayer.js'
import { useTimetableNavigation } from './useTimetableNavigation.js'
import { getTermPosition, NextClassCard, TimetableDayView, TimetableWeekNavigation } from './TimetableDayView.jsx'
import './timetable.css'

export function TimetablePage({ userId, cloudTimetable, cloudSynced = false, cloudReadReady = false, onSaveCloud, onClose, onAskAi }) {
  const [timetable, setTimetable] = useState(() => validTimetable(cloudTimetable) ? cloudTimetable : loadTimetable(userId))
  const { week, weekday, now, preview, navigation } = useTimetableNavigation({ userId, timetable })
  const [startDate, setStartDate] = useState(() => timetable?.termStart || '')
  const [calibrationWeek, setCalibrationWeek] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const fileRef = useRef(null), backRef = useRef(null), frameRef = useRef(null), contentRef = useRef(null), settingsRef = useRef(null), calibrationRef = useRef(null)
  const handledCloudRef = useRef(Symbol('unread-cloud'))
  const requestRef = useRef(0), ownerRef = useRef(userId), mountedRef = useRef(true), sawCloud = useRef(cloudSynced)
  ownerRef.current = userId
  const shown = preview || timetable
  const termPosition = getTermPosition(timetable, now)
  const maxWeek = getMaxTeachingWeek(shown)
  const conflicts = shown ? scheduleConflicts(shown) : new Set()
  const subjectCount = new Set(shown?.courses.map(course => course.name) ?? []).size
  const isCurrent = (version, owner) => mountedRef.current && requestRef.current === version && ownerRef.current === owner
  const cancelPreview = () => { navigation.cancelPreview(); setStartDate(timetable?.termStart || ''); setError(''); setNotice('') }
  const goBack = () => { if (!busy) { if (preview) cancelPreview(); else onClose() } }
  useBackLayer(true, goBack, 70)

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; requestRef.current++ } }, [])
  useEffect(() => {
    if (preview || busy || !cloudReadReady || handledCloudRef.current === cloudTimetable) return
    handledCloudRef.current = cloudTimetable
    if (validTimetable(cloudTimetable)) { sawCloud.current = true; setTimetable(cloudTimetable); setStartDate(cloudTimetable.termStart) }
    else if (sawCloud.current) { sawCloud.current = false; setTimetable(null); setStartDate('') }
  }, [cloudTimetable, cloudReadReady, preview, busy])
  useEffect(() => {
    const previous = document.activeElement, overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'; backRef.current?.focus()
    const key = event => {
      if (event.defaultPrevented || event.key !== 'Tab') return
      const items = [...(frameRef.current?.querySelectorAll('button:not(:disabled),input:not(:disabled):not([type=file]),select:not(:disabled),summary') || [])].filter(item => item.getClientRects().length > 0)
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus() }
      else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0]?.focus() }
    }
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus?.() }
  }, [])

  const readFile = async event => {
    const file = event.target.files?.[0]; event.target.value = ''
    if (!file || busy) return
    const version = ++requestRef.current, owner = userId
    setBusy(true); setError(''); setNotice('')
    try {
      const parsed = await importTimetableFile(file)
      if (!isCurrent(version, owner)) return
      navigation.startPreview(parsed); setStartDate(parsed.termStart || ''); contentRef.current?.scrollTo?.({ top: 0 })
    } catch (failure) { if (isCurrent(version, owner)) setError(failure.message || '课表读取失败，请重新选择文件') }
    finally { if (isCurrent(version, owner)) setBusy(false) }
  }
  const persist = async (next, message) => {
    if (busy) return
    const version = ++requestRef.current, owner = userId
    setBusy(true); setError(''); setNotice('')
    let uploaded = false
    try {
      if (owner && typeof onSaveCloud === 'function') { await onSaveCloud(next); uploaded = true }
      if (!isCurrent(version, owner)) return
      let localError = ''
      try { saveTimetable(owner, next) } catch (failure) { if (!uploaded) throw failure; localError = '课表已同步到账号，但本机副本保存失败，请检查设备存储空间。' }
      if (uploaded) handledCloudRef.current = cloudTimetable
      setTimetable(next); setStartDate(next.termStart || ''); navigation.commit(next); setCalibrationWeek('')
      setNotice(localError ? '' : message + (uploaded ? '，已同步到当前账号' : '，已保存在本机'))
      if (localError) setError(localError)
    } catch (failure) { if (isCurrent(version, owner)) setError(failure.message || '保存失败，请重试') }
    finally { if (isCurrent(version, owner)) setBusy(false) }
  }
  const updateDate = event => {
    event.preventDefault()
    const anchor = dateAnchor(startDate)
    if (!anchor || anchor.getUTCDay() !== 1) { setError('请选择第一教学周的周一日期；若不确定，可直接校准现在第几周。'); return }
    void persist({ ...timetable, termStart: startDate, dateConfirmed: true }, '教学周日期已更新')
  }
  const calibrate = event => {
    event.preventDefault()
    try { void persist(calibrateTimetable(timetable, Number(calibrationWeek), now), '教学周已校准，已回到今天') }
    catch (failure) { setError(failure.message || '请选择现在的教学周') }
  }
  const openCalibration = () => { if (settingsRef.current) { settingsRef.current.open = true; settingsRef.current.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' }); calibrationRef.current?.focus() } }
  const showCourseDay = (date, day) => {
    const anchor = dateAnchor(timetable?.termStart), target = dateAnchor(date)
    if (!anchor || !target || !day) return
    navigation.selectWeek(Math.floor((target - anchor) / 604800000) + 1); navigation.selectDay(day)
  }
  const askAi = () => { try { onAskAi?.(createTimetablePrompt(timetable, week)) } catch (failure) { setError(failure.message) } }

  return createPortal(<section className="timetable-page" role="dialog" aria-modal="true" aria-labelledby="timetable-title" ref={frameRef}>
    <div className="timetable-frame">
      <header className="timetable-header"><button ref={backRef} type="button" aria-label="返回我的" onClick={goBack} disabled={busy}><ArrowLeft size={21} /></button><div><h1 id="timetable-title">我的课表</h1><span>{shown ? `${shown.semester} · ${preview ? '导入预览' : cloudSynced && typeof onSaveCloud === 'function' ? '账号课表' : '本机课表'}` : '每天的安排，一眼看清'}</span></div><button className="timetable-import" type="button" onClick={() => fileRef.current?.click()} disabled={busy}><FileUp size={16} />{busy ? '处理中…' : shown ? '导入' : '导入课表'}</button><input className="timetable-file" type="file" accept=".xls,application/vnd.ms-excel" ref={fileRef} onChange={readFile} aria-label="选择教务课表文件" disabled={busy} /></header>
      <main className="timetable-content" ref={contentRef}>
        {error && <p className="timetable-alert" role="alert">{error}</p>}{notice && <p className="timetable-notice" role="status">{notice}</p>}
        {!shown ? <section className="timetable-empty"><span><CalendarDays size={40} strokeWidth={1.4} /></span><h2>从一张课表开始</h2><p>导入教务导出的学生个人课表，<br />每天打开就能查看下一节。</p><button type="button" disabled={busy} onClick={() => fileRef.current?.click()}><FileUp size={18} />选择 .xls 课表文件</button><small>支持教务学生个人课表导出格式 · 最大 4 MB<br />在本机解析，确认前不替换已有课表</small></section> : <>
          {preview ? <section className="timetable-preview-note"><strong>核对这份新课表</strong><p>{subjectCount} 门有时间的课程 · {preview.courses.length} 条安排。确认后替换{typeof onSaveCloud === 'function' && userId ? '当前账号课表' : '当前账号的本机课表'}；未排时间课程请在下方核对。</p><div><button type="button" disabled={busy} onClick={cancelPreview}>取消导入</button><button type="button" disabled={busy} onClick={() => persist(preview, '新课表已导入')}><Check size={16} />确认导入</button></div></section> : <NextClassCard timetable={timetable} now={now} onCalibrate={openCalibration} onShowDay={showCourseDay} />}
          <TimetableWeekNavigation timetable={shown} week={week} weekday={weekday} now={now} preview={Boolean(preview)} onWeek={value => navigation.selectWeek(value)} onDay={value => navigation.selectDay(value)} onToday={() => navigation.goToday()} />
          <TimetableDayView timetable={shown} week={week} weekday={weekday} now={now} conflicts={conflicts} />
          {conflicts.size > 0 && <p className="timetable-alert">课表中有 {conflicts.size} 条安排出现时间重叠，请核对教务信息。</p>}
          {!preview && <details className="timetable-settings" ref={settingsRef}><summary><Settings2 size={17} /><span>课表设置<small>{subjectCount} 门课程 · {termPosition === 'before' ? '尚未到课表第1周' : termPosition === 'after' ? '超出课表周次范围' : termPosition === 'within' ? `当前第 ${currentTeachingWeek(timetable, now)} 教学周` : '教学周待校准'}</small></span></summary><div className="timetable-settings__body">
            <form className="timetable-calibrate" onSubmit={calibrate}><label htmlFor="timetable-calibration">现在是第几教学周</label><p>按你确认的当前周次校准，以后打开自动显示当天安排。</p><div><select id="timetable-calibration" ref={calibrationRef} value={calibrationWeek} onChange={event => setCalibrationWeek(event.target.value)} disabled={busy} required><option value="">请选择当前周次</option>{Array.from({ length: maxWeek }, (_, index) => <option key={index + 1} value={index + 1}>第 {index + 1} 教学周</option>)}</select><button type="submit" disabled={busy || !calibrationWeek}>确认校准</button></div></form>
            <form className="timetable-date" onSubmit={updateDate}><label htmlFor="timetable-start">或填写第一教学周的周一</label><div><input id="timetable-start" type="date" value={startDate} disabled={busy} onChange={event => setStartDate(event.target.value)} /><button type="submit" disabled={busy}>保存日期</button></div><p>{canUseCalendar(timetable) ? '已启用日期换算；临时调课、节假日仍请核对教务通知。' : '已有日期尚未确认为第一周周一，不会自动更改或推断当前周。'}</p></form>
            {userId && typeof onSaveCloud === 'function' && !cloudSynced && <button className="timetable-sync" type="button" disabled={busy} onClick={() => persist(timetable, '课表已保存')}>同步这份本机课表</button>}
          </div></details>}
          {shown.unscheduled.length > 0 && <details className="timetable-warning"><summary>有 {shown.unscheduled.length} 门课程未排时间</summary><p>{shown.unscheduled.map(course => campusDisplayText(course.name)).join('、')}：原表缺少具体时间。下一课只依据已排课程，不能代表其余时间都空闲。</p></details>}
          {preview && <details className="timetable-all"><summary>查看全部 {preview.courses.length} 条安排</summary>{preview.courses.map(course => <p key={course.id}><strong>{campusDisplayText(course.name)}</strong><br />{DAY_NAMES[course.weekday - 1]} {course.startTime}–{course.endTime} · 第 {course.weeks.join('、')} 周 · {campusDisplayText(course.classroom)}</p>)}</details>}
        </>}
      </main>
      <footer className="timetable-footer"><p>{userId && cloudSynced && typeof onSaveCloud === 'function' ? '当前账号的云端课表' : '课表保存在本机'}<small>{userId && cloudSynced && typeof onSaveCloud === 'function' ? '按账号隔离，临时调课请另行核对。' : '账号分别保存，尚未同步到服务器。'}</small></p>{timetable && !preview && <button type="button" disabled={busy} onClick={askAi}><Sparkles size={15} />规划所选周</button>}</footer>
    </div>
  </section>, document.body)
}
