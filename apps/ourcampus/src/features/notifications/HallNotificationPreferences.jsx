import { HALL_NOTIFICATION_KIND, HALL_NOTIFICATION_REGIONS, hallSubscriptionScope, setHallNotificationSubscription } from '../../data/hallNotifications.js'

export function HallNotificationPreferences({ userId, information, busy, run }) {
  const subscriptions = information.subscriptions ?? []
  const disabled = busy || information.status !== 'ready'
  return <section className="information-card information-preferences">
    <h3>聊天新消息提醒</h3>
    <p>选择要关注的聊天地区，默认全部关闭。开启后只提醒该地区其他同学的新消息；校园信息订阅不会自动开启聊天提醒。</p>
    {HALL_NOTIFICATION_REGIONS.map((region) => {
      const checked = subscriptions.some((subscription) => subscription.user_id === userId
        && subscription.kind === HALL_NOTIFICATION_KIND && subscription.location_id === hallSubscriptionScope(region.id))
      return <label className="information-consent" key={region.id}><input type="checkbox" disabled={disabled} checked={checked}
        onChange={(event) => {
          const enabled = event.target.checked
          run(async () => {
            await setHallNotificationSubscription({ userId, regionId: region.id, enabled })
            await information.refresh()
          }, enabled ? region.label + '聊天提醒已开启。' : region.label + '聊天提醒已关闭。')
        }} />{region.label}的新聊天消息</label>
    })}
    <small>手机通知栏还需开启下方“手机系统通知”。关闭某地区后，停止该地区后续聊天提醒，不补发旧聊天。</small>
  </section>
}
