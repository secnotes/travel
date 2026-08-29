import { ALL_ATTRACTIONS, ALL_CITIES, ALL_PROVINCES, getClimate } from '../data'
import { match as pinyinMatch, pinyin } from 'pinyin-pro'
import { holidaysInRange } from '../data/holidays'
import type {
  Attraction,
  CityCost,
  CityClimate,
  Holiday,
  PlanRequest,
  Theme,
} from '../types'

/** 目的地匹配结果 */
export interface DestinationMatch {
  kind: 'province' | 'city' | 'attraction'
  /** 匹配到的展示名 */
  label: string
  province?: string
  city?: string
  attractions: Attraction[]
  cities: CityCost[]
}

function matchLevel(query: string, target: string): number {
  const q = query.trim()
  const t = target.trim()
  if (!q) return 0
  if (q === t) return 1
  if (t.includes(q) || q.includes(t)) return 0.8
  return 0
}

/**
 * 将用户输入的目的地（省份/城市/景点名，允许不完全匹配）
 * 解析为数据集内的景点集合。
 */
export function resolveDestination(input: string): DestinationMatch | null {
  const q = input.trim()
  if (!q) return null

  // 1. 景点名精确/包含匹配（优先）
  const attrHits = ALL_ATTRACTIONS.filter((a) => matchLevel(q, a.name) >= 0.8)
  if (attrHits.length > 0) {
    const exact = attrHits.find((a) => a.name === q) ?? attrHits[0]
    return {
      kind: 'attraction',
      label: exact.name,
      province: exact.province,
      city: exact.city,
      attractions: ALL_ATTRACTIONS.filter((a) => a.city === exact.city),
      cities: ALL_CITIES.filter((c) => c.city === exact.city),
    }
  }

  // 2. 城市名匹配（含"杭州市"/"杭州 "等脏输入）
  const cityHits = ALL_CITIES.filter((c) =>
    matchLevel(q, c.city) >= 0.8 || matchLevel(q, `${c.city}市`) >= 0.8,
  )
  if (cityHits.length > 0) {
    const exact = cityHits.find((c) => c.city === q) ?? cityHits[0]
    return {
      kind: 'city',
      label: exact.city,
      province: exact.province,
      city: exact.city,
      attractions: ALL_ATTRACTIONS.filter((a) => a.city === exact.city),
      cities: [exact],
    }
  }

  // 3. 省份匹配
  const province = ALL_CITIES.find((c) =>
    matchLevel(q, c.province) >= 0.8 ||
    matchLevel(q, `${c.province}省`) >= 0.8,
  )?.province
  if (province) {
    const cities = ALL_CITIES.filter((c) => c.province === province)
    return {
      kind: 'province',
      label: province,
      province,
      attractions: ALL_ATTRACTIONS.filter((a) => a.province === province),
      cities,
    }
  }

  return null
}

/** 表单自动补全建议 */
export interface Suggestion {
  kind: 'province' | 'city' | 'attraction'
  label: string
  sub: string
}

/** 拼音匹配：仅在输入为纯字母时启用。返回得分：70=全拼/首字母完全一致，40=散乱匹配 */
function pinyinScore(q: string, text: string): number {
  if (/[^\x00-\x7F]/.test(q)) return 0 // 含中文走子串匹配即可
  try {
    if (pinyinMatch(text, q) === null) return 0
    const full = pinyin(text, { toneType: 'none', type: 'array' }).join('')
    const initials = pinyin(text, {
      pattern: 'first',
      toneType: 'none',
      type: 'array',
    }).join('')
    return q === full || q === initials ? 70 : 40
  } catch {
    return 0
  }
}

/** 表单自动补全建议 */
export function suggest(query: string, limit = 12): Suggestion[] {
  const q = query.trim()

  // 空输入：展示热门目的地（按景点数量排序）
  if (!q) {
    const hot = ALL_CITIES.map((c) => ({
      c,
      n: ALL_ATTRACTIONS.filter((a) => a.city === c.city).length,
    }))
      .sort((x, y) => y.n - x.n)
      .slice(0, limit)
    return hot.map(({ c }) => ({
      kind: 'city' as const,
      label: c.city,
      sub: `${c.province} · ${c.blurb}`,
    }))
  }

  const scored: { s: Suggestion; score: number }[] = []
  const push = (s: Suggestion, text: string) => {
    let score = 0
    if (text === q) score = 100
    else if (text.startsWith(q)) score = 80
    else if (text.includes(q) || q.includes(text)) score = 60
    else score = pinyinScore(q, text)
    if (score > 0) scored.push({ s, score })
  }

  // 省份 -> 城市 -> 景点，按匹配度统一排序
  for (const p of ALL_PROVINCES) {
    push({ kind: 'province', label: p, sub: `${p} · 按省份整体规划` }, p)
  }
  for (const c of ALL_CITIES) {
    push(
      { kind: 'city', label: c.city, sub: `${c.province} · ${c.blurb}` },
      c.city,
    )
  }
  for (const a of ALL_ATTRACTIONS) {
    push(
      { kind: 'attraction', label: a.name, sub: `${a.province}${a.city} · ${a.desc}` },
      a.name,
    )
  }

  return scored
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map((x) => x.s)
}

export function addDays(dateStr: string, days: number): string {
  // 按本地时区解析 "YYYY-MM-DD"，避免被当成 UTC 午夜导致跨日偏移
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d + days)
  const yy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

export interface TripContext {
  match: DestinationMatch
  climate: CityClimate[]
  holidays: Holiday[]
  /** 出发月份（1-12），无日期则按当前月 */
  months: number[]
  request: PlanRequest
  /** 数据集中未命中时 LLM 需自行补充 */
  unmatched: boolean
}

/** 组装行程规划的完整上下文 */
export function buildTripContext(req: PlanRequest): TripContext {
  const match = resolveDestination(req.destination)
  if (!match) {
    // 数据集外的目的地：给 LLM 空景点集，让其自行补充（标记待核实）
    return {
      match: {
        kind: 'city',
        label: req.destination,
        attractions: [],
        cities: [],
      },
      climate: [],
      holidays: holidaysInRange(
        req.startDate,
        req.startDate ? addDays(req.startDate, req.days) : undefined,
      ),
      months: req.startDate
        ? uniqueMonths(req.startDate, req.days)
        : [new Date().getMonth() + 1],
      request: req,
      unmatched: true,
    }
  }

  const months = req.startDate
    ? uniqueMonths(req.startDate, req.days)
    : [new Date().getMonth() + 1]

  return {
    match,
    climate: match.cities
      .map((c) => getClimate(c.city))
      .filter((c): c is CityClimate => Boolean(c))
      .map((c) => ({
        ...c,
        monthly: c.monthly.filter((m) => months.includes(m.month)),
      })),
    holidays: holidaysInRange(
      req.startDate,
      req.startDate ? addDays(req.startDate, req.days) : undefined,
    ),
    months,
    request: req,
    unmatched: false,
  }
}

function uniqueMonths(startDate: string, days: number): number[] {
  const months = new Set<number>()
  for (let i = 0; i < Math.max(days, 1); i += 5) {
    const d = new Date(addDays(startDate, i))
    months.add(d.getMonth() + 1)
  }
  const end = new Date(addDays(startDate, days))
  months.add(end.getMonth() + 1)
  return [...months]
}

/** 主题过滤权重：把不符合用户主题偏好的景点排后（不剔除，保持信息量） */
export function rankAttractions(
  attractions: Attraction[],
  themes: Theme[],
): Attraction[] {
  if (themes.length === 0) return [...attractions].sort((a, b) => b.rating - a.rating)
  const score = (a: Attraction) =>
    a.rating + a.themes.filter((t) => themes.includes(t)).length * 1.5
  return [...attractions].sort((a, b) => score(b) - score(a))
}

/** 两个坐标的球面距离（公里） */
export function distanceKm(
  a: [number, number],
  b: [number, number],
): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const [lng1, lat1] = a
  const [lng2, lat2] = b
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(h)))
}
