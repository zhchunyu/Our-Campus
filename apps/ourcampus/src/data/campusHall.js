export const CAMPUS_HALL_REGIONS = [
  { id: 'all', label: '全部' },
  { id: 'teaching', label: '教学区' },
  { id: 'living', label: '生活区' },
  { id: 'dorm', label: '宿舍区' },
  { id: 'sports', label: '运动区' },
  { id: 'gate', label: '校门周边' },
]

export const INITIAL_HALL_MESSAGES = [
  { id: 'demo-1', author: '小麦', regionId: 'teaching', time: '19:26', content: '有同学知道教学楼附近还有没有空教室吗？' },
  { id: 'demo-2', author: '青禾', regionId: 'living', time: '19:21', content: '食堂哪个窗口的饭菜比较快呀？' },
  { id: 'demo-3', author: '阿宁', regionId: 'sports', time: '19:18', content: '晚上有人一起去操场散步吗？' },
  { id: 'demo-4', author: '小满', regionId: 'dorm', time: '19:12', content: '回宿舍的路上，有同学想一起走吗？' },
  { id: 'demo-5', author: '北北', regionId: 'gate', time: '19:08', content: '校门附近有同学一起拼车吗？' },
  { id: 'demo-6', author: '橘子汽水', regionId: 'living', time: '19:04', content: '有人推荐校园里适合坐着聊会儿的地方吗？' },
  { id: 'demo-7', author: '小麦', regionId: 'teaching', time: '18:57', content: '实验课结束了，附近有一起去吃饭的同学吗？' },
]

export function filterHallMessages(messages, regionId) {
  if (regionId === 'all') return messages
  return messages.filter((message) => message.regionId === regionId)
}

export function createHallMessage({ content, regionId }, now = new Date()) {
  const time = new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now)

  return {
    id: `local-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    author: '我',
    regionId,
    time,
    content: content.trim(),
  }
}
