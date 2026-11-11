// 道路数据来自共享仓库：
// archive/3d-research/site/src/navigation.campus.js
// archive/3d-research/blender/scripts/build_campus_site.py
//
// Blender 世界坐标：x=东，y=北；Three.js 坐标：x=东，z=-北。
// 这里单独维护道路数据，避免继续把节点和业务地点堆进 routeGraph.js。

export const ROAD_GROUND_Y = 3

export const ROAD_NODES = Object.freeze({
  outer_s_w: { x: -373, y: 77.5 },
  outer_s1: { x: -200, y: 77.5 },
  outer_s2: { x: 0, y: 77.5 },
  outer_s3: { x: 200, y: 77.5 },
  outer_s_e: { x: 373, y: 77.5 },
  outer_se1: { x: 373, y: 108 },
  outer_se2: { x: 384, y: 126 },
  outer_se3: { x: 399, y: 134 },
  outer_se4: { x: 420, y: 148 },
  outer_se5: { x: 440, y: 160 },
  outer_se6: { x: 465, y: 205 },
  outer_se7: { x: 478, y: 280 },
  outer_e1: { x: 481, y: 380 },
  outer_e2: { x: 481, y: 470 },
  outer_ne1: { x: 480, y: 560 },
  outer_ne2: { x: 470, y: 620 },
  outer_ne3: { x: 440, y: 675 },
  outer_ne4: { x: 390, y: 715 },
  outer_ne5: { x: 320, y: 748 },
  outer_ne6: { x: 220, y: 768 },
  outer_n: { x: 0, y: 780 },
  outer_nw1: { x: -220, y: 768 },
  outer_nw2: { x: -320, y: 748 },
  outer_nw3: { x: -390, y: 715 },
  outer_nw4: { x: -440, y: 675 },
  outer_nw5: { x: -470, y: 620 },
  outer_nw6: { x: -480, y: 560 },
  outer_w1: { x: -481, y: 470 },
  outer_w2: { x: -481, y: 380 },
  outer_sw1: { x: -478, y: 280 },
  outer_sw2: { x: -465, y: 205 },
  outer_sw3: { x: -440, y: 160 },
  outer_sw4: { x: -420, y: 148 },
  outer_sw5: { x: -399, y: 134 },
  outer_sw6: { x: -384, y: 126 },
  outer_sw7: { x: -373, y: 108 },

  inner_e_s: { x: 0, y: 146 },
  inner_e_s1: { x: 60, y: 147 },
  inner_e_s2: { x: 110, y: 147.5 },
  inner_e_s3: { x: 150, y: 147.5 },
  inner_e_s4: { x: 178, y: 148 },
  inner_e_s5: { x: 190, y: 166 },
  inner_e_s6: { x: 196, y: 210 },
  inner_e_s7: { x: 198, y: 262 },
  inner_e_s8: { x: 202, y: 320 },
  inner_e_mid: { x: 206, y: 380 },
  inner_e_mid2: { x: 206, y: 440 },
  inner_e_n1: { x: 202, y: 500 },
  inner_e_n2: { x: 186, y: 546 },
  inner_e_n3: { x: 148, y: 568 },
  inner_e_n4: { x: 96, y: 574 },
  inner_e_n5: { x: 60, y: 580 },
  inner_e_n6: { x: 30, y: 588 },
  inner_n: { x: 0, y: 596 },
  inner_w_n1: { x: -30, y: 588 },
  inner_w_n2: { x: -60, y: 580 },
  inner_w_n3: { x: -96, y: 574 },
  inner_w_n4: { x: -148, y: 568 },
  inner_w_n5: { x: -186, y: 546 },
  inner_w_n6: { x: -202, y: 500 },
  inner_w_mid2: { x: -206, y: 440 },
  inner_w_mid: { x: -206, y: 380 },
  inner_w_s1: { x: -202, y: 320 },
  inner_w_s2: { x: -198, y: 262 },
  inner_w_s3: { x: -196, y: 210 },
  inner_w_s4: { x: -190, y: 166 },
  inner_w_s5: { x: -178, y: 148 },
  inner_w_s6: { x: -150, y: 147.5 },
  inner_w_s7: { x: -110, y: 147.5 },
  inner_w_s8: { x: -60, y: 147 },
  inner_w_s: { x: 0, y: 146 },

  ring_s1: { x: -148, y: 568 },
  ring_s4: { x: 206, y: 380 },
  ring_s7: { x: 196, y: 210 },

  axis_south: { x: 0, y: 0 },
  axis_gate: { x: 0, y: 33.6 },
  axis_plaza: { x: 0, y: 129.6 },
  axis_valley_n: { x: 0, y: 188 },
  axis_mound_s: { x: 0, y: 210.8 },
  axis_mound_n: { x: 0, y: 278.8 },
  axis_mid: { x: 0, y: 360 },
  axis_ew404: { x: 0, y: 404 },
  axis_lib_s: { x: 0, y: 466.4 },

  ew_west_w: { x: -478, y: 404 },
  ew_west_e: { x: -180, y: 404 },
  ew_east_w: { x: 180, y: 404 },
  ew_east_e: { x: 478, y: 404 },

  rad_w_s: { x: -300, y: 160 },
  rad_w_mid: { x: -280, y: 280 },
  rad_w_n: { x: -250, y: 500 },
  rad_e_s: { x: 300, y: 160 },
  rad_e_mid: { x: 280, y: 280 },
  rad_e_n: { x: 250, y: 500 },

  dorm_access_w: { x: -340, y: 160 },
  dorm_access_e: { x: -220, y: 160 },
  sport_access_w: { x: 220, y: 160 },
  sport_access_e: { x: 340, y: 160 },
})

export const ROAD_EDGES = Object.freeze([
  ['outer_s_w', 'outer_s1'], ['outer_s1', 'outer_s2'], ['outer_s2', 'outer_s3'], ['outer_s3', 'outer_s_e'],
  ['outer_s_e', 'outer_se1'], ['outer_se1', 'outer_se2'], ['outer_se2', 'outer_se3'], ['outer_se3', 'outer_se4'],
  ['outer_se4', 'outer_se5'], ['outer_se5', 'outer_se6'], ['outer_se6', 'outer_se7'], ['outer_se7', 'outer_e1'],
  ['outer_e1', 'outer_e2'], ['outer_e2', 'outer_ne1'], ['outer_ne1', 'outer_ne2'], ['outer_ne2', 'outer_ne3'],
  ['outer_ne3', 'outer_ne4'], ['outer_ne4', 'outer_ne5'], ['outer_ne5', 'outer_ne6'], ['outer_ne6', 'outer_n'],
  ['outer_n', 'outer_nw1'], ['outer_nw1', 'outer_nw2'], ['outer_nw2', 'outer_nw3'], ['outer_nw3', 'outer_nw4'],
  ['outer_nw4', 'outer_nw5'], ['outer_nw5', 'outer_nw6'], ['outer_nw6', 'outer_w1'], ['outer_w1', 'outer_w2'],
  ['outer_w2', 'outer_sw1'], ['outer_sw1', 'outer_sw2'], ['outer_sw2', 'outer_sw3'], ['outer_sw3', 'outer_sw4'],
  ['outer_sw4', 'outer_sw5'], ['outer_sw5', 'outer_sw6'], ['outer_sw6', 'outer_sw7'], ['outer_sw7', 'outer_s_w'],

  ['inner_e_s', 'inner_e_s1'], ['inner_e_s1', 'inner_e_s2'], ['inner_e_s2', 'inner_e_s3'], ['inner_e_s3', 'inner_e_s4'],
  ['inner_e_s4', 'inner_e_s5'], ['inner_e_s5', 'inner_e_s6'], ['inner_e_s6', 'inner_e_s7'], ['inner_e_s7', 'inner_e_s8'],
  ['inner_e_s8', 'inner_e_mid'], ['inner_e_mid', 'inner_e_mid2'], ['inner_e_mid2', 'inner_e_n1'],
  ['inner_e_n1', 'inner_e_n2'], ['inner_e_n2', 'inner_e_n3'], ['inner_e_n3', 'inner_e_n4'], ['inner_e_n4', 'inner_e_n5'],
  ['inner_e_n5', 'inner_e_n6'], ['inner_e_n6', 'inner_n'], ['inner_n', 'inner_w_n1'], ['inner_w_n1', 'inner_w_n2'],
  ['inner_w_n2', 'inner_w_n3'], ['inner_w_n3', 'inner_w_n4'], ['inner_w_n4', 'inner_w_n5'], ['inner_w_n5', 'inner_w_n6'],
  ['inner_w_n6', 'inner_w_mid2'], ['inner_w_mid2', 'inner_w_mid'], ['inner_w_mid', 'inner_w_s1'],
  ['inner_w_s1', 'inner_w_s2'], ['inner_w_s2', 'inner_w_s3'], ['inner_w_s3', 'inner_w_s4'], ['inner_w_s4', 'inner_w_s5'],
  ['inner_w_s5', 'inner_w_s6'], ['inner_w_s6', 'inner_w_s7'], ['inner_w_s7', 'inner_w_s8'], ['inner_w_s8', 'inner_w_s'],

  ['ring_s1', 'inner_w_n4'], ['ring_s4', 'inner_e_mid'], ['ring_s7', 'inner_e_s6'],
  ['axis_south', 'axis_gate'], ['axis_gate', 'axis_plaza'], ['axis_plaza', 'axis_valley_n'],
  ['axis_valley_n', 'axis_mound_s'], ['axis_mound_s', 'axis_mound_n'], ['axis_mound_n', 'axis_mid'],
  ['axis_mid', 'axis_ew404'], ['axis_ew404', 'axis_lib_s'],
  ['axis_plaza', 'inner_e_s'], ['axis_plaza', 'inner_w_s'], ['axis_valley_n', 'inner_e_s'], ['axis_valley_n', 'inner_w_s'],
  ['axis_gate', 'outer_s2'],
  ['ew_west_w', 'ew_west_e'], ['ew_east_w', 'ew_east_e'], ['ew_west_w', 'outer_w2'], ['ew_east_e', 'outer_e1'],
  ['ew_west_e', 'inner_w_mid'], ['ew_east_w', 'inner_e_mid'],
  ['rad_w_s', 'outer_sw3'], ['rad_w_s', 'inner_w_s5'], ['rad_w_mid', 'outer_sw1'], ['rad_w_mid', 'inner_w_s2'],
  ['rad_w_n', 'outer_w1'], ['rad_w_n', 'inner_w_n6'], ['rad_e_s', 'outer_se5'], ['rad_e_s', 'inner_e_s5'],
  ['rad_e_mid', 'outer_se7'], ['rad_e_mid', 'inner_e_s7'], ['rad_e_n', 'outer_e2'], ['rad_e_n', 'inner_e_n1'],
  ['dorm_access_w', 'outer_sw3'], ['dorm_access_e', 'inner_w_s4'], ['dorm_access_w', 'dorm_access_e'],
  ['sport_access_e', 'outer_se5'], ['sport_access_w', 'inner_e_s4'], ['sport_access_e', 'sport_access_w'],
])

export function roadEdgeId(from, to) {
  return `road:${from}:${to}`
}

export function worldToMapPosition([x, , z]) {
  // 与共享仓库的 SVG 总平面图 viewBox="0 0 680 595" 对齐。
  const svgX = x / 2.4 + 340
  const svgY = z / 2.4 + 516
  return [svgX / 680, svgY / 595]
}

export function roadNodeToPosition(nodeId) {
  const node = ROAD_NODES[nodeId]
  return node ? [node.x, ROAD_GROUND_Y, -node.y] : null
}
