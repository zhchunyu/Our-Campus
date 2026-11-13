// 你画我猜词库：选校园里看得见、画得出的东西，纯前端维护，不读数据库。
export const DRAW_WORDS = Object.freeze([
  '图书馆', '谷园餐厅', '体育场', '篮球场', '游泳馆', '崇学楼', '勤学楼', '牌楼',
  '校医院', '植物园', '大明湖', '公寓楼', '实验楼', '教学楼', '食堂', '宿舍',
  '自行车', '篮球', '足球', '羽毛球', '乒乓球', '水杯', '书包', '雨伞',
  '手机', '电脑', '眼镜', '口罩', '钥匙', '扫把', '拖把', '快递',
  '校车', '外卖', '台灯', '耳机', '充电宝', '雪人', '喷泉', '看台',
  '跑道', '社团', '晚会', '军训', '晚霞', '猫', '狗', '气球',
])

const PUNCTUATION = /[\s\p{P}\p{S}]/gu

export function normalizeGuess(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase().replace(PUNCTUATION, '')
}

export function pickWord(random = Math.random) {
  const index = Math.min(DRAW_WORDS.length - 1, Math.floor(random() * DRAW_WORDS.length))
  return DRAW_WORDS[index]
}

export function isCorrectGuess(guess, answer) {
  const value = normalizeGuess(guess)
  const target = normalizeGuess(answer)
  return Boolean(value) && value === target
}

export function maskWord(word) {
  return Array.from(String(word ?? '')).map(() => '＿').join(' ')
}
