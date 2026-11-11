// 2026-10-08 用户提供的现场招牌。序号仅用于资料展示，不是现场窗口编号。
// 楼层由用户确认为一层；未辨认的菜名、营业时间和不完整价格不录入。
const entries = [
  { key: 'dieyiwan', name: '咥一碗饸饹面', category: '面食', dish: '招牌臊子肉面 · 牛肉面',
    description: '现场招牌：咥一碗饸饹面。早餐、面食及配料以当天窗口供应为准。',
    menu: [['葱油面', 4], ['鸡汁饸饹面', 7], ['招牌臊子肉面', 12], ['肉丁炸酱', 10], ['酸菜肉丝面', 9], ['西红柿鸡蛋面', 8]] },
  { key: 'gorice', name: 'GO-RICE 歌米快餐', category: '米饭', dish: '现炒盖饭 · 木耳炒肉盖饭',
    description: '现场招牌：GO-RICE 歌米快餐，现炒现卖。照片被遮挡的菜单与价格待核对。',
    menu: [['木耳炒肉盖饭', 13], ['水煮肉片盖饭', 13], ['鱼香肉丝盖饭', 12]] },
  { key: 'shancheng', name: '山城挑挑重庆面馆', category: '面食', dish: '重庆小面 / 米线 · 酸辣面',
    description: '现场招牌：山城挑挑重庆面馆。支持小面、米线及酸辣粉等选择。',
    menu: [['重庆小面 / 米线', 9], ['山城拌面', 8], ['金牌酸辣粉', 8], ['杂酱小面 / 米线（干 / 汤）', 12], ['豌豆小面 / 米线（干 / 汤）', 10]] },
  { key: 'pangjie', name: '胖姐特色营养粥·五谷渔粉', category: '面食', dish: '五谷渔粉 · 营养粥',
    description: '现场招牌：胖姐特色营养粥、五谷渔粉。粥、豆浆和渔粉按窗口当天供应。',
    menu: [['八宝粥', 2], ['黑米粥', 2], ['现磨豆浆', 2], ['皮蛋瘦肉粥', 2], ['绿豆小米粥', 1.5], ['招牌渔粉', 12], ['原味渔粉', 8], ['酸辣渔粉', 9], ['麻辣渔粉', 10], ['茄汁鱼丸渔粉', 10], ['茄汁玉米渔粉', 11]] },
  { key: 'diaozhabing', name: '掉渣饼', category: '小吃', dish: '原味掉渣饼 · 鸡蛋 / 烤肠加料',
    description: '现场招牌：掉渣饼。价格为照片所示，组合与加料价格以现场为准。',
    menu: [['原味掉渣饼', 3.5], ['掉渣饼 + 鸡蛋', 4.5], ['掉渣饼 + 烤肠', 4.5], ['掉渣饼 + 土豆', 4.5]] },
  { key: 'jiumingjia', name: '玖铭家炸鸡腿', category: '小吃', dish: '炸鸡腿 · 韩式炸鸡 · 火鸡面套餐',
    description: '现场招牌：玖铭家炸鸡腿。套餐和促销为拍摄时标价，不保证持续有效。',
    menu: [['爆汁大鸡腿（1个）', 6], ['爆汁大鸡腿（2个）', 9.9], ['半斤随心桶', 9.9], ['火鸡面套餐', 9.9], ['可乐（杯）', 3]] },
]

export const GUYUAN_WINDOWS = entries.map((entry, index) => ({
  ...entry, id: `b126e080-1008-4000-8000-${String(index + 1).padStart(12, '0')}`,
  photo: `${import.meta.env?.BASE_URL || '/'}assets/restaurants/guyuan/${entry.key}.jpg`,
  number: `资料${index + 1}`, floor: '一层', numberVerified: false,
  icon: entry.category === '面食' ? 'noodles' : entry.category === '小吃' ? 'snack' : 'rice',
  tone: entry.category === '面食' ? 'wheat' : entry.category === '小吃' ? 'peach' : 'green',
  source: '用户现场照片 · 2026-10-08录入', isExample: false, isPhotoRecord: true, cloudStored: false,
}))
export function enrichGuyuanWindow(window) {
  const entry = GUYUAN_WINDOWS.find((item) => item.id === window.id || item.name === window.name)
  return entry ? { ...entry, ...window, photo: window.photo || entry.photo, menu: window.menu?.length ? window.menu : entry.menu, floor: window.floor || entry.floor, numberVerified: window.numberVerified ?? entry.numberVerified, cloudStored: true } : { ...window, cloudStored: true }
}
