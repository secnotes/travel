import pako from 'pako'
import type {
  ItineraryPlan,
  PlanActivity,
  PlanDay,
  DestinationRecommendation,
  PlanRequest,
} from '../types'
import type { DiscoverForm } from '../store'
import { getAttraction } from '../data'
import { addDays } from './resolver'

/**
 * 分享链接编码（A 方案：精简字段 + base64url）。
 *
 * A 精简字段：编码时丢弃可重算的冗余（已验证景点的 coords/verified、每日 date、
 *   与默认值相同的 ticket），解码时从本地数据集 + 出发日期还原。链接为纯 ASCII。
 *
 * 链接格式：
 *   #/share/v2<base64url>  -> v2（精简字段，新链接，ASCII）
 *   #/share/b<base2048>    -> v2b（历史 base2048 版，仍可解码）
 *   #/share/<base64url>    -> v1（最初版本，完整 plan，向后兼容）
 */

interface SlimActivity {
  i?: string      // attractionId（有则可重算 coords/verified）
  n: string       // name
  s: string       // startTime
  e: string       // endTime
  t: number       // type 索引
  k?: number      // ticket（仅非 0 时存）
  c?: [number, number] // coords（仅数据集外景点存，无法重算）
  o?: string      // note
}

interface SlimDay {
  d: number       // day
  h: string       // theme
  y: string       // city
  a: SlimActivity[]
  r: string       // transportNote
  l?: string      // lodging
  c?: number      // estimatedCost（仅非 0 时存）
}

interface SlimBudgetItem {
  c: number       // category 索引
  l: string
  a: number
  o?: string
}

interface SlimPlan {
  t: string       // title
  o: string       // overview
  d: SlimDay[]
  b: { p: SlimBudgetItem[]; t: number; o?: string }
  p?: string[]    // packingList（空则省）
  i?: string[]    // tips（空则省）
  w?: string[]    // warnings（空则省）
  s?: string      // startDate（用于重算每日 date）
}

// 索引表（缩短字段值）
const ACT_TYPES = ['attraction', 'meal', 'transport', 'rest', 'free'] as const
const BUDGET_CATS = ['transport', 'lodging', 'tickets', 'meals', 'misc'] as const

// ============ A：精简 / 还原 ============

function slimPlan(plan: ItineraryPlan, startDate?: string): SlimPlan {
  const days: SlimDay[] = plan.days.map((day) => ({
    d: day.day,
    h: day.theme,
    y: day.city,
    a: day.activities.map(slimActivity),
    r: day.transportNote,
    l: day.lodging,
    c: day.estimatedCost || undefined,
  }))
  return {
    t: plan.title,
    o: plan.overview,
    d: days,
    b: {
      p: plan.budget.perPerson.map((it) => ({
        c: BUDGET_CATS.indexOf(it.category),
        l: it.label,
        a: it.amount,
        o: it.note,
      })),
      t: plan.budget.total,
      o: plan.budget.note,
    },
    p: plan.packingList.length ? plan.packingList : undefined,
    i: plan.tips.length ? plan.tips : undefined,
    w: plan.warnings?.length ? plan.warnings : undefined,
    s: startDate,
  }
}

function slimActivity(act: PlanActivity): SlimActivity {
  // 已验证（数据集内）景点：丢 coords/verified，解码时用 id 重算
  // 数据集外景点：保留 coords（无法重算）
  const hasId = Boolean(act.attractionId && getAttraction(act.attractionId))
  return {
    i: act.attractionId,
    n: act.name,
    s: act.startTime,
    e: act.endTime,
    t: ACT_TYPES.indexOf(act.type),
    k: act.ticket || undefined,
    c: hasId ? undefined : act.coords,
    o: act.note,
  }
}

function restorePlan(slim: SlimPlan): ItineraryPlan {
  const days: PlanDay[] = slim.d.map((day) => ({
    day: day.d,
    date: slim.s ? addDays(slim.s, day.d - 1) : undefined,
    theme: day.h,
    city: day.y,
    activities: day.a.map(restoreActivity),
    transportNote: day.r,
    lodging: day.l,
    estimatedCost: day.c ?? 0,
  }))

  return {
    title: slim.t,
    overview: slim.o,
    days,
    budget: {
      perPerson: slim.b.p.map((it) => ({
        category: BUDGET_CATS[it.c] ?? 'misc',
        label: it.l,
        amount: it.a,
        note: it.o,
      })),
      total: slim.b.t,
      note: slim.b.o,
    },
    packingList: slim.p ?? [],
    tips: slim.i ?? [],
    warnings: slim.w,
  }
}

function restoreActivity(s: SlimActivity): PlanActivity {
  const id = s.i
  const attr = id ? getAttraction(id) : undefined
  return {
    attractionId: id,
    name: s.n,
    startTime: s.s,
    endTime: s.e,
    type: ACT_TYPES[s.t] ?? 'free',
    ticket: s.k ?? (attr?.ticket ?? 0),
    note: s.o,
    // 数据集内景点用数据集坐标；数据集外用编码里保留的 coords
    coords: attr?.coords ?? s.c,
    verified: Boolean(attr),
  }
}

// ============ base64url 编解码 ============

function bytesToBase64url(bytes: Uint8Array): string {
  let bin = ''
  for (const byte of bytes) bin += String.fromCharCode(byte)
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function base64urlToBytes(str: string): Uint8Array {
  const b64url = str.replaceAll('-', '+').replaceAll('_', '/')
  const b64 = b64url + '='.repeat((4 - (b64url.length % 4)) % 4)
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

// ============ 对外 API ============

/** 生成分享编码（v2：精简字段 + base64url，纯 ASCII，带 v2 前缀） */
export function encodeShare(plan: ItineraryPlan, startDate?: string): string {
  const slim = slimPlan(plan, startDate)
  const json = JSON.stringify(slim)
  const compressed = pako.deflate(json)
  return 'v2' + bytesToBase64url(compressed)
}

/** 解码分享编码（兼容 v2 / v2b / v1 三种历史格式） */
export async function decodeShare(encoded: string): Promise<ItineraryPlan | null> {
  try {
    if (encoded.startsWith('v2')) {
      // v2：精简字段 + base64url
      const bytes = base64urlToBytes(encoded.slice(2))
      const json = pako.inflate(bytes, { to: 'string' })
      const slim = JSON.parse(json) as SlimPlan
      if (!slim?.d?.length) return null
      return restorePlan(slim)
    }
    if (encoded.startsWith('b')) {
      // v2b：历史 base2048 版本，仍可解码（按需动态加载 base2048）
      const { decode: b2048Decode } = await import('base2048')
      const bytes = b2048Decode(encoded.slice(1)) as Uint8Array
      const json = pako.inflate(bytes, { to: 'string' })
      const slim = JSON.parse(json) as SlimPlan
      if (!slim?.d?.length) return null
      return restorePlan(slim)
    }
    // v1：最初版本（完整 plan + base64url），向后兼容
    const bytes = base64urlToBytes(encoded)
    const json = pako.inflate(bytes, { to: 'string' })
    const payload = JSON.parse(json) as { plan: ItineraryPlan }
    if (!payload?.plan?.days?.length) return null
    return payload.plan
  } catch {
    return null
  }
}

export function shareUrl(plan: ItineraryPlan, startDate?: string): string {
  const { origin, pathname } = window.location
  return `${origin}${pathname}#/share/${encodeShare(plan, startDate)}`
}

/** 从当前 URL hash 恢复分享的行程（无后端分享） */
export async function planFromLocation(): Promise<ItineraryPlan | null> {
  const hash = window.location.hash
  const m = hash.match(/^#\/share\/(.+)$/)
  if (!m) return null
  return decodeShare(m[1])
}

/**
 * 从分享还原的行程合成最小规划请求。
 * 分享链接不编码原始 PlanRequest，但「修改行程」（refine 补日期）
 * 与再次分享（startDate）依赖 request，用行程内容推断兜底。
 */
export function requestFromPlan(plan: ItineraryPlan): PlanRequest {
  const first = plan.days[0]
  return {
    days: plan.days.length,
    destination: first?.city ?? '',
    origin: '',
    startDate: first?.date,
    budgetTier: 'comfort',
    pace: 'moderate',
    themes: [],
    travelers: 1,
  }
}

export function clearShareHash(): void {
  if (window.location.hash) {
    history.replaceState(null, '', window.location.pathname)
  }
}

// ============ 目的地发现分享 ============

/**
 * 发现结果分享链接格式：#/discover/v1<base64url>
 * 内容 = 查询条件 + 推荐结果（体量小，直接整体压缩，无需精简字段）。
 */

interface DiscoverPayload {
  f: DiscoverForm
  r: DestinationRecommendation[]
}

export function encodeDiscoverShare(
  form: DiscoverForm,
  results: DestinationRecommendation[],
): string {
  const json = JSON.stringify({ f: form, r: results })
  return 'v1' + bytesToBase64url(pako.deflate(json))
}

export async function decodeDiscoverShare(
  encoded: string,
): Promise<DiscoverPayload | null> {
  try {
    if (!encoded.startsWith('v1')) return null
    const bytes = base64urlToBytes(encoded.slice(2))
    const json = pako.inflate(bytes, { to: 'string' })
    const payload = JSON.parse(json) as DiscoverPayload
    if (!payload?.r?.length || !payload.f) return null
    return payload
  } catch {
    return null
  }
}

export function discoverShareUrl(
  form: DiscoverForm,
  results: DestinationRecommendation[],
): string {
  const { origin, pathname } = window.location
  return `${origin}${pathname}#/discover/${encodeDiscoverShare(form, results)}`
}

/** 从当前 URL hash 恢复分享的发现结果（无后端分享） */
export async function discoverFromLocation(): Promise<DiscoverPayload | null> {
  const m = window.location.hash.match(/^#\/discover\/(.+)$/)
  if (!m) return null
  return decodeDiscoverShare(m[1])
}
