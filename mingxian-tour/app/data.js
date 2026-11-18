/**
 * 铭贤学堂旧址 · 自由游览 —— 场景数据
 *
 * 说明：
 *  - 所有资产使用相对路径，index.html 与 assets/ 同级，需通过本地 HTTP 服务打开。
 *  - 每个场景支持「多段配音」：audios 是数组，按数组顺序播放。
 *    这与原平台一致 —— 原平台把解说挂在「音频类型的兴趣点」上，
 *    所以一个场景（一张全景）可能对应多段讲解，例如崇圣楼那张全景的对面就是尚德堂。
 *  - label 用于播放器上显示这段讲的是哪个点。
 *  - note 为场景位置说明，只描述所见方位，不含史实结论；
 *    史实与思政表述需经校史馆/马克思主义学院审校后再补。
 *
 * 配音分布依据（2026-11-18 在 5itui 后台「兴趣点」页逐房间核对）：
 *   校长院 1 段 · 崇圣楼 2 段 · 石板院 1 段 · 观赏楼 1 段
 *   宣传统战部 1 段 · 南院楼群 1 段 · 党政办 1 段 —— 合计 8 段，与音频文件数量一致。
 */

export const TITLE = '铭贤学堂旧址 · 自由游览';
export const SUBTITLE = '山西铭贤学校旧址　全国重点文物保护单位';

/** 游览动线：由外门进入，穿院落至南院 */
export const ORDER = [
  '2184', '2169', '2170', '2171', '2172', '2173', '2174', '2175',
  '2185', '2176', '2177', '2181', '2180', '2182', '2183', '2178', '2179',
];

export const SCENES = {
  '2184': {
    name: '铭贤学校旧址外门',
    note: '旧址入口，可见院墙与门楼。',
    audios: [],
  },
  '2169': {
    name: '外院',
    note: '进入大门后的第一进院落。',
    audios: [],
  },
  '2170': {
    name: '校长院',
    note: '院落中部，四周为砖木结构房屋。',
    audios: [
      { label: '校长院', src: 'assets/audio/xiaozhangyuan.mp3' },
    ],
  },
  '2171': {
    name: '崇圣楼',
    note: '崇圣楼建筑群所在院落，正对面为尚德堂，二者共用这一张全景。',
    audios: [
      { label: '崇圣楼', src: 'assets/audio/chongshenglou.mp3' },
      { label: '尚德堂', src: 'assets/audio/shangdetang.mp3' },
    ],
  },
  '2172': {
    name: '内院',
    note: '院落后部，巷道较窄。',
    audios: [],
  },
  '2173': {
    name: '石板院',
    note: '地面以石板铺砌的院落。',
    audios: [
      { label: '石板院', src: 'assets/audio/shibanyuan.mp3' },
    ],
  },
  '2174': {
    name: '侧门',
    note: '院落侧向出入口。',
    audios: [],
  },
  '2175': {
    name: '观赏楼',
    note: '砖砌楼体，周边植有树木。',
    audios: [
      { label: '观赏楼', src: 'assets/audio/guanshanglou.mp3' },
    ],
  },
  '2185': {
    name: '南院主路',
    note: '通往南院的道路，两侧多树木。',
    audios: [],
  },
  '2176': {
    name: '校友会',
    note: '南院片区的独立建筑。',
    audios: [],
  },
  '2177': {
    name: '南院环路岔路口',
    note: '环路交汇处。',
    audios: [],
  },
  '2181': {
    name: '云波园岔路口',
    note: '通往云波园方向的路口。',
    audios: [],
  },
  '2180': {
    name: '南院楼群',
    note: '南院成片建筑群。',
    audios: [
      { label: '南院4号楼', src: 'assets/audio/nanyuan4hao.mp3' },
    ],
  },
  '2182': {
    name: '国际交流协会楼',
    note: '南院片区建筑。',
    audios: [],
  },
  '2183': {
    name: '环路1',
    note: '南院环路路段。',
    audios: [],
  },
  '2178': {
    name: '宣传统战部',
    note: '南院片区办公建筑。',
    audios: [
      { label: '南院别墅', src: 'assets/audio/nanyuanbieshu.mp3' },
    ],
  },
  '2179': {
    name: '党政办',
    note: '南院片区办公建筑。',
    audios: [
      { label: '南院3号楼', src: 'assets/audio/nanyuan3hao.mp3' },
    ],
  },
};

/**
 * 全部配音总表（8 段），供「讲解库」试听与重新指派。
 * 在讲解库里把某段音频指派给某个场景，会“追加”到该场景的配音序列，
 * 因此一个场景可以同时有多段讲解。改动保存在本机浏览器，可导出为 JSON。
 */
export const AUDIO_LIBRARY = [
  { name: '崇圣楼', src: 'assets/audio/chongshenglou.mp3' },
  { name: '尚德堂', src: 'assets/audio/shangdetang.mp3' },
  { name: '校长院', src: 'assets/audio/xiaozhangyuan.mp3' },
  { name: '石板院', src: 'assets/audio/shibanyuan.mp3' },
  { name: '观赏楼', src: 'assets/audio/guanshanglou.mp3' },
  { name: '南院别墅', src: 'assets/audio/nanyuanbieshu.mp3' },
  { name: '南院4号楼', src: 'assets/audio/nanyuan4hao.mp3' },
  { name: '南院3号楼', src: 'assets/audio/nanyuan3hao.mp3' },
];

/** 自动巡游：无配音场景停留时长；两段配音之间的间隔 */
export const AUTOPLAY_HOLD_MS = 6000;
export const AUTOPLAY_GAP_MS = 2500;

export function sceneList() {
  return ORDER.map((id) => ({
    id,
    ...SCENES[id],
    desktop: `assets/panoramas/${id}.webp`,
    mobile: `assets/panoramas-mobile/${id}.webp`,
    preview: `assets/previews/${id}.jpg`,
  }));
}