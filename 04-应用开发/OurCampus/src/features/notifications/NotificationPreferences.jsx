import { useEffect, useState } from 'react'
import { parseAiReminderInterestKeywords } from '../../data/aiReminderPreferences.js'
import { useAiReminderPreferences } from './useAiReminderPreferences.js'

export function AiChatReminderPreferences({ userId, busy, run }) {
  const preferences = useAiReminderPreferences(userId)
  const [keywords, setKeywords] = useState('')
  const interests = JSON.stringify(preferences.value.interest_keywords)
  useEffect(() => { setKeywords(preferences.value.interest_keywords.join('、')) }, [interests, userId])
  const disabled = busy || preferences.status !== 'ready'
  const saveKeywords = (event) => {
    event.preventDefault()
    run(async () => {
      await preferences.save({ interest_keywords: parseAiReminderInterestKeywords(keywords) })
    }, '相关聊天提醒的兴趣已保存。')
  }
  return <section className="information-card information-preferences">
    <h3>相关聊天提醒</h3>
    <p>默认关闭。开启后，AI 理解新公开聊天的类型、明确地点和有限关键词，再按你的选择查找与你有关的消息。</p>
    {preferences.status === 'loading' && <p role="status">正在读取相关聊天提醒设置…</p>}
    {preferences.error && <p className="information-small" role="status">{preferences.error}</p>}
    <label className="information-consent"><input type="checkbox" disabled={disabled} checked={preferences.value.enabled}
      onChange={(event) => {
        const enabled = event.target.checked
        run(() => preferences.save({ enabled }), enabled ? '相关聊天提醒已开启。' : '相关聊天提醒已关闭。')
      }} />开启与我有关的公开聊天提醒</label>
    <label className="information-consent"><input type="checkbox" disabled={disabled} checked={preferences.value.use_favorites}
      onChange={(event) => { const use_favorites = event.target.checked; run(() => preferences.save({ use_favorites }), '收藏地点匹配设置已保存。') }} />匹配账号已同步的收藏地点</label>
    <label className="information-consent"><input type="checkbox" disabled={disabled} checked={preferences.value.match_lost}
      onChange={(event) => { const match_lost = event.target.checked; run(() => preferences.save({ match_lost }), '失物线索匹配设置已保存。') }} />匹配我仍在寻找或招领的失物信息</label>
    <form onSubmit={saveKeywords}><label>明确关注的兴趣词<input value={keywords} onChange={(event) => setKeywords(event.target.value)} disabled={disabled}
      maxLength={300} placeholder="例如：阅读、篮球、志愿活动" /><small>最多 8 个，每个 2–16 字，用顿号或逗号分隔；留空则不按兴趣词匹配。</small></label>
      <button className="information-primary" disabled={disabled}>保存聊天提醒兴趣</button></form>
    <small>也会参考你明确订阅的校园信息类别和地点；不会为你推断兴趣。消息来自公开聊天，未经核实。关闭后停止相关提醒；不补发开启前的旧聊天。上方按地区开启的聊天新消息提醒单独管理。</small>
    <button type="button" className="information-text-button" disabled={busy || preferences.status === 'loading'} onClick={() => run(() => preferences.refresh())}>重新读取设置</button>
  </section>
}

export function NotificationPreferences({ preferences, favoriteIds = [], locations, busy, run }) {
  const [keywords, setKeywords] = useState('')
  const interests = JSON.stringify(preferences.value.interest_keywords)
  useEffect(() => { setKeywords(preferences.value.interest_keywords.join('、')) }, [interests])
  const disabled = busy || preferences.status !== 'ready'
  const saveInterests = (event) => {
    event.preventDefault()
    run(async () => {
      const values = [...new Set(keywords.split(/[、,，;；\n]/).map((v) => v.trim()).filter(Boolean))]
      if (values.length > 12 || values.some((v) => v.length < 2 || v.length > 20)) throw new Error('请填写最多 12 个兴趣词，每个 2–20 字。')
      await preferences.save({ interest_keywords: values })
    }, '兴趣已保存，之后只对相关的新动态提醒。')
  }
  const favorites = preferences.value.favorite_location_ids.map((id) => locations.find((l) => l.id === id)?.name).filter(Boolean)
  return <section className="information-card information-preferences">
    <h3>只提醒重要和与你相关的事</h3>
    <p>这里接收重要校园通知、可能匹配的失物线索，以及收藏地点或明确兴趣相关的动态。聊天新消息可在上方按地区开启。</p>
    {preferences.error && <p className="information-small" role="status">{preferences.error}</p>}
    {preferences.status === 'loading' && <p role="status">正在读取提醒偏好…</p>}
    <label className="information-consent"><input type="checkbox" disabled={disabled} checked={preferences.value.match_alerts} onChange={(e) => run(() => preferences.save({ match_alerts: e.target.checked }), '失物匹配提醒偏好已保存。')} />提醒与我发布的失物信息可能匹配的线索</label>
    <label className="information-consent"><input type="checkbox" disabled={disabled} checked={preferences.value.favorite_priority} onChange={(e) => run(() => preferences.save({ favorite_priority: e.target.checked }), '收藏地点提醒偏好已保存。')} />关注收藏地点的相关活动与动态</label>
    <small>{favorites.length ? `已关注收藏地点：${favorites.join('、')}` : '收藏图书馆等地点后，可在这里接收相关活动提醒。'}</small>
    {favoriteIds.length > 0 && <button type="button" className="information-text-button" disabled={disabled} onClick={() => run(() => preferences.save({ add_favorite_location_ids: favoriteIds }), '已将当前设备收藏加入本账号关注。')}>将当前收藏加入我的关注</button>}
    <form onSubmit={saveInterests}><label>我的兴趣<input value={keywords} onChange={(e) => setKeywords(e.target.value)} disabled={disabled} maxLength={260} placeholder="例如：阅读、篮球、志愿活动" /><small>用顿号或逗号分隔；不填写则不按兴趣词推荐。</small></label><button className="information-primary" disabled={disabled}>保存兴趣</button></form>
  </section>
}
