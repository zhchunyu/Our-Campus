// 只导出已有地点／地区／服务信息；不连接数据库，不导入演示人流或示例事件。
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { locationRepository } from '../src/data/locations.js'
import { campusServices } from '../src/data/campusServices.js'
import { CAMPUS_HALL_REGIONS } from '../src/data/campusHall.js'
import { getCampusRegionId } from '../src/data/campusCommunity.js'
import { getTencentCampusPosition } from '../src/data/tencentCampusGeo.js'

const sqlValue = (value) => value == null ? 'null' : `'${String(value).replaceAll("'", "''")}'`
const sqlArray = (values) => values.length ? `array[${values.map(sqlValue).join(',')}]::text[]` : "'{}'::text[]"
const locations = locationRepository.loadAll()
const ids = new Set(locations.map((location) => location.id))
if (ids.size !== locations.length) throw new Error('地点 ID 重复，停止导出')
if (campusServices.some((service) => service.locationId && !ids.has(service.locationId))) throw new Error('服务关联了未知地点')
const regions = CAMPUS_HALL_REGIONS.filter((region) => region.id !== 'all')
const regionIds = new Set(regions.map((region) => region.id))
const rows = locations.map((location) => {
  const regionId = getCampusRegionId(location)
  if (!regionIds.has(regionId)) throw new Error(`未知地区：${location.id}`)
  const coordinates = getTencentCampusPosition(location)
  if (coordinates && ![coordinates.lat, coordinates.lng].every(Number.isFinite)) throw new Error(`无效坐标：${location.id}`)
  const position = location.mapPosition?.['2d']
  if (!Array.isArray(position) || position.length !== 2 || !position.every(Number.isFinite)) throw new Error(`无效二维位置：${location.id}`)
  return `  (${[
    sqlValue(location.id), sqlValue(location.name), sqlArray(location.aliases ?? []), sqlArray(location.keywords ?? []),
    sqlValue(location.category), sqlValue(regionId), sqlValue(location.description ?? ''), sqlValue(location.externalUrl),
    `${sqlValue(JSON.stringify(position))}::jsonb`, location.mapApartmentNumber ?? 'null',
    coordinates?.lat ?? 'null', coordinates?.lng ?? 'null', sqlValue('gcj02'),
    sqlValue('现有前端腾讯坐标与校园图校准；未进行本次现场核验'), sqlValue(location.source),
  ].join(',')})`
})
const serviceRows = campusServices.map((service) => `  (${[
  sqlValue(service.id), sqlValue(service.title), sqlValue(service.locationId), sqlValue(service.summary),
  sqlValue(service.hours), sqlValue(service.phone), sqlValue(service.phoneNote), sqlValue(service.website), sqlValue(service.sourceUrl), sqlArray(service.keywords),
].join(',')})`)
const sql = `-- 从当前 CampusTwin 项目导出：${locations.length} 地点 / ${regions.length} 地区 / ${campusServices.length} 服务。
-- 先执行 01-CampusTwin-schema.sql；本文件只 INSERT，重复执行不会覆盖后台修正。
-- 不导入 open/crowd 演示状态、示例事件、示例聊天或示例失物；位置并非现场测量结果。
begin;
insert into public.campus_regions(id, label) values
${regions.map((region) => `  (${sqlValue(region.id)},${sqlValue(region.label)})`).join(',\n')}
on conflict (id) do nothing;

insert into public.campus_locations(id,name,aliases,keywords,category,region_id,description,external_url,map_position,map_apartment_number,latitude,longitude,coordinate_system,geo_source,source) values
${rows.join(',\n')}
on conflict (id) do nothing;

insert into public.campus_services(id,title,location_id,summary,hours,phone,phone_note,website,source_url,keywords) values
${serviceRows.join(',\n')}
on conflict (id) do nothing;
commit;
`
const destination = new URL('../docs/supabase/02-CampusTwin-seed.sql', import.meta.url)
await mkdir(new URL('../docs/supabase/', import.meta.url), { recursive: true })
await writeFile(destination, sql, 'utf8')
console.log(JSON.stringify({ file: fileURLToPath(destination), locations: locations.length, regions: regions.length, services: campusServices.length, bytes: Buffer.byteLength(sql) }))
