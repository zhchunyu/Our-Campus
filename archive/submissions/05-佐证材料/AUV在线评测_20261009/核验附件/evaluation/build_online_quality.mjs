import fs from 'node:fs'
import { EXTRACT_INSTRUCTION, PERSONA_INSTRUCTION } from 'file:///D:/project/college/26_10_8_college/04-应用开发/OurCampus/supabase/functions/_shared/auv.js'
import { campusLocations } from 'file:///D:/project/college/26_10_8_college/04-应用开发/OurCampus/supabase/functions/_shared/campus-catalog.js'
const out = 'D:/project/college/output/supporting_materials_2d_v2/evaluation'
const locations = campusLocations.filter(x => !x.id.startsWith('workshop'))
const patterns = {
  safety: ['路面有大坑，担心有人摔倒', '门口电线裸露，有漏电风险', '楼外有松动构件，需检查', '入口地面破损，容易绊脚', '台阶护栏松动，请核实'],
  congestion: ['队伍很长，入口通行慢', '人挤在入口，通行拥挤', '门口排队，需要错峰', '道路被停放车辆堵住', '人流堵住入口'],
  service: ['饮水设备不能用，请检修', '门口照明故障，请检查', '服务窗口暂停办理', '洗衣设备坏了，无法使用', '公共设施出现故障'],
  notice: ['通知：明天举行阅读分享活动', '通知：周五开放预约报名', '公告：本周服务安排有变化', '通知：下周有讲座活动', '公告：周末有体验活动'],
}
const cases = []
for (const [type, phrases] of Object.entries(patterns)) for (let i = 0; i < 30; i++) {
  const location = locations[(i * 3 + Object.keys(patterns).indexOf(type)) % locations.length]
  const scenario = i < 15 ? 'explicit' : i < 20 ? 'missing' : i < 25 ? 'ambiguous' : 'selected'
  const text = (scenario === 'explicit' ? location.name : scenario === 'ambiguous' ? `${location.name}和图书馆` : '这里') + phrases[i % phrases.length] + `。${['这是刚发现的情况', '信息还需要核实', '请按我的描述整理'][i % 3]}`
  const secondId = 'library'
  // If the ambiguous pair coincides, replace the second place with a different valid name.
  const fixedText = scenario === 'ambiguous' && location.id === secondId ? text.replace('图书馆和图书馆', '图书馆和禾香餐厅') : text
  cases.push({ id: `QUALITY-${type}-${i + 1}`, source: '合成题；需二审；不是用户调查', mode: 'extract', instruction: EXTRACT_INSTRUCTION, text: fixedText, selectedLocationId: scenario === 'selected' ? location.id : null, expected: { type, building_id: ['explicit', 'selected'].includes(scenario) ? location.id : null, location_status: scenario === 'explicit' ? 'text_match' : scenario === 'selected' ? 'selected' : scenario === 'missing' ? 'missing' : 'ambiguous' } })
}
for (let i = 0; i < 60; i++) cases.push({ id: `CHAT-QUALITY-${i + 1}`, source: '合成题；人工盲评待执行', mode: 'chat', instruction: PERSONA_INSTRUCTION, text: `${locations[i % locations.length].name}${['开放时间能确认吗？', '现在人多吗？没有数据就告诉我未知。', '有什么已经核实的服务信息？', '没有资料时应该怎么确认？', '当前有没有已核实的校园动态？', '我不确定地点，你能先帮我确认吗？'][i % 6]}`, expected: { manual_rubric: '事实40 相关20 可执行20 清晰10 不确定信息10；数据不足不得猜时间电话或人数' } })
fs.writeFileSync(out + '/online_quality_cases.json', JSON.stringify(cases, null, 2))
console.log(JSON.stringify({ quality_cases_prepared: cases.length, executed: 0, gold_review: '待二审', warning: '离线240项与本文件180条语义质量题是不同集合，不得混用分母' }))
