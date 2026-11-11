import { describeServerError, requireSupabase } from './supabaseClient.js'
import { enrichGuyuanWindow } from './guyuanWindows.js'

export const RESTAURANT_IDS = ['canteen', 'employee-canteen', 'yixinyuan-canteen', 'bitaoyuan-canteen']
export const STALL_CATEGORIES = ['面食', '米饭', '轻食', '小吃', '饮品', '其他']

export function validateWindowDraft(restaurantId, draft) {
  if (!RESTAURANT_IDS.includes(restaurantId)) throw new Error('请先选择校园餐厅')
  const values = Object.fromEntries(['number', 'name', 'category', 'dish', 'description'].map((key) => [key, String(draft[key] ?? '').trim()]))
  if (!values.number || [...values.number].length > 12) throw new Error('请填写 1–12 字的窗口编号（可包含楼层）')
  if (!values.name || [...values.name].length > 40) throw new Error('请填写 1–40 字的窗口名称')
  if (!STALL_CATEGORIES.includes(values.category)) throw new Error('请选择窗口分类')
  if ([...values.dish].length > 60 || [...values.description].length > 200) throw new Error('招牌菜最多 60 字，介绍最多 200 字')
  return { restaurant_id: restaurantId, ...values }
}

export function mapRestaurantWindow(row) {
  return { id: row.id, number: row.number, name: row.name, category: row.category, dish: row.dish || '招牌菜待补充', description: row.description || '吃过这个窗口？分享你的用餐体验。', icon: row.category === '面食' ? 'noodles' : row.category === '轻食' ? 'salad' : row.category === '小吃' ? 'snack' : 'rice', tone: row.category === '面食' ? 'wheat' : row.category === '轻食' ? 'sage' : 'green', isExample: false, menu: row.menu, floor: row.floor, numberVerified: row.number_verified }
}

function checkResult(error) {
  if (!error) return
  if (['PGRST205', '42P01'].includes(error.code)) throw new Error('窗口管理尚未开通，请管理员执行餐厅窗口建表 SQL')
  if (error.code === '23505') throw new Error('这家餐厅已有相同编号的窗口，请更换编号')
  throw new Error(describeServerError(error, '窗口操作失败，请稍后重试'))
}

export async function loadRestaurantWindows(restaurantId) {
  const { data, error } = await requireSupabase().from('restaurant_windows').select('*').eq('restaurant_id', restaurantId).order('number')
  checkResult(error)
  return data.map(mapRestaurantWindow).map((window) => restaurantId === 'canteen' ? enrichGuyuanWindow(window) : { ...window, cloudStored: true }).sort((a, b) => a.number.localeCompare(b.number, 'zh-CN', { numeric: true }))
}

async function requireManager() {
  const client = requireSupabase()
  const { data, error } = await client.rpc('campus_my_role')
  checkResult(error)
  if (data !== 'manager') throw new Error('只有管理员可以管理餐厅窗口')
  return client
}

export async function addRestaurantWindow(restaurantId, draft) {
  const payload = validateWindowDraft(restaurantId, draft)
  const client = await requireManager()
  const { data, error } = await client.from('restaurant_windows').insert(payload).select().single()
  checkResult(error)
  return mapRestaurantWindow(data)
}

export async function deleteRestaurantWindow(restaurantId, windowId) {
  if (!RESTAURANT_IDS.includes(restaurantId) || !windowId) throw new Error('窗口信息不完整')
  const client = await requireManager()
  const { data, error } = await client.from('restaurant_windows').delete().eq('restaurant_id', restaurantId).eq('id', windowId).select('id')
  checkResult(error)
  if (!data.length) throw new Error('窗口已被移除或当前账号没有删除权限，请刷新后重试')
}
