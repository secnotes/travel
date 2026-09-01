import type { CityPairFare } from '../types'
import { getCity } from './index'
import { distanceKm } from '../services/resolver'

/**
 * 城市对大交通票价锚点（静态参考价，2026 前后）。
 *
 * 高铁二等座为政府指导价、相对稳定；经济舱为常见折扣区间，波动大。
 * 只收录把握较大的干线数字（取整），未覆盖的城市对按直线距离推算
 * （source='distance'，标注"按距离推算"）。欢迎按 docs/data.md
 * 的说明补充校准。
 */

/** 两个城市名排序后拼成表 key（与方向无关） */
function pair(a: string, b: string): string {
  return [a, b].sort((x, y) => x.localeCompare(y, 'zh')).join('|')
}

const PAIR_FARES = new Map<string, CityPairFare>([
  // 北京出发
  [pair('北京', '上海'), { rail: 660, flight: [500, 1500] }],
  [pair('北京', '杭州'), { rail: 540, flight: [450, 1300] }],
  [pair('北京', '南京'), { rail: 445, flight: [400, 1200] }],
  [pair('北京', '济南'), { rail: 185, flight: [350, 900] }],
  [pair('北京', '泰安'), { rail: 215, flight: [350, 900] }],
  [pair('北京', '青岛'), { rail: 315, flight: [400, 1000] }],
  [pair('北京', '天津'), { rail: 55 }],
  [pair('北京', '西安'), { rail: 515, flight: [450, 1300] }],
  [pair('北京', '郑州'), { rail: 310, flight: [400, 1000] }],
  [pair('北京', '武汉'), { rail: 520, flight: [500, 1300] }],
  [pair('北京', '长沙'), { rail: 649, flight: [550, 1400] }],
  [pair('北京', '广州'), { rail: 860, flight: [700, 1900] }],
  [pair('北京', '深圳'), { rail: 940, flight: [750, 2000] }],
  [pair('北京', '哈尔滨'), { rail: 306, flight: [400, 1100] }],
  [pair('北京', '成都'), { flight: [700, 1800] }],
  [pair('北京', '重庆'), { flight: [750, 1900] }],
  [pair('北京', '昆明'), { flight: [900, 2200] }],
  [pair('北京', '大连'), { flight: [400, 1000] }],
  [pair('北京', '太原'), { flight: [350, 900] }],
  // 上海出发
  [pair('上海', '杭州'), { rail: 75 }],
  [pair('上海', '南京'), { rail: 140, flight: [350, 800] }],
  [pair('上海', '苏州'), { rail: 40 }],
  [pair('上海', '广州'), { flight: [700, 1700] }],
  [pair('上海', '深圳'), { flight: [750, 1800] }],
  [pair('上海', '成都'), { flight: [900, 2000] }],
  [pair('上海', '重庆'), { flight: [850, 1900] }],
  [pair('上海', '西安'), { flight: [600, 1500] }],
  [pair('上海', '昆明'), { flight: [950, 2100] }],
  [pair('上海', '青岛'), { flight: [450, 1100] }],
  [pair('上海', '厦门'), { flight: [550, 1300] }],
  // 广深出发
  [pair('广州', '深圳'), { rail: 80 }],
  [pair('广州', '长沙'), { rail: 314, flight: [400, 900] }],
  [pair('广州', '武汉'), { rail: 460, flight: [450, 1000] }],
  [pair('广州', '杭州'), { flight: [600, 1400] }],
  [pair('广州', '成都'), { flight: [800, 1800] }],
  [pair('广州', '重庆'), { flight: [700, 1600] }],
  [pair('广州', '昆明'), { flight: [600, 1500] }],
  [pair('深圳', '长沙'), { flight: [450, 1100] }],
  // 西南 / 其他
  [pair('成都', '重庆'), { rail: 154, flight: [400, 900] }],
  [pair('成都', '西安'), { rail: 263, flight: [450, 1100] }],
  [pair('成都', '昆明'), { flight: [500, 1300] }],
  [pair('重庆', '西安'), { flight: [450, 1100] }],
  [pair('杭州', '南京'), { rail: 120, flight: [350, 800] }],
  [pair('杭州', '宁波'), { rail: 71 }],
  [pair('杭州', '苏州'), { rail: 110 }],
  [pair('杭州', '厦门'), { flight: [500, 1200] }],
])

/** 主要城市三字码（小写，携程机票查询 URL 用），未收录城市不提供机票链接 */
export const CITY_FLIGHT_CODES: Record<string, string> = {
  北京: 'bjs', 上海: 'sha', 广州: 'can', 深圳: 'szx', 成都: 'ctu',
  重庆: 'ckg', 西安: 'sia', 昆明: 'kmg', 杭州: 'hgh', 南京: 'nkg',
  武汉: 'wuh', 长沙: 'csx', 厦门: 'xmn', 青岛: 'tao', 天津: 'tsn',
  大连: 'dlc', 哈尔滨: 'hrb', 乌鲁木齐: 'urc', 拉萨: 'lxa', 兰州: 'lhw',
  贵阳: 'kwe', 南宁: 'nng', 桂林: 'kwl', 海口: 'hak', 三亚: 'syx',
  呼和浩特: 'het', 太原: 'tyn', 郑州: 'cgo', 福州: 'foc', 宁波: 'ngb',
  温州: 'wnz', 西宁: 'xnn', 银川: 'inc', 长春: 'cgq', 沈阳: 'she',
  济南: 'tna', 珠海: 'zuh', 合肥: 'hfe', 南昌: 'khn',
}

export interface FareEstimate {
  from: string
  to: string
  /** 高铁二等座（元） */
  rail?: number
  /** 经济舱区间（元） */
  flight?: [number, number]
  /** 锚点表命中 / 按直线距离推算 */
  source: 'table' | 'distance'
  /** 直线距离（公里，仅推算时有） */
  distanceKm?: number
}

// 距离推算参数：铁路里程 ≈ 直线 1.2 倍，二等座约 0.42 元/铁路公里
const RAIL_RATE_PER_KM = 0.5
const FLIGHT_RATE: [number, number] = [0.4, 1.0]
const FLIGHT_BASE: [number, number] = [200, 400]

/** 城市对票价：优先查锚点表，未覆盖按直线距离推算；任一城市不在数据集中返回 null */
export function cityPairFare(from: string, to: string): FareEstimate | null {
  const ca = getCity(from.replace(/市$/, ''))
  const cb = getCity(to.replace(/市$/, ''))
  if (!ca || !cb) return null
  const hit = PAIR_FARES.get(pair(ca.city, cb.city))
  if (hit) {
    return {
      from: ca.city,
      to: cb.city,
      rail: hit.rail,
      flight: hit.flight,
      source: 'table',
    }
  }
  const km = distanceKm(ca.coords, cb.coords)
  return {
    from: ca.city,
    to: cb.city,
    rail: Math.round(km * RAIL_RATE_PER_KM),
    flight: [
      Math.round(km * FLIGHT_RATE[0] + FLIGHT_BASE[0]),
      Math.round(km * FLIGHT_RATE[1] + FLIGHT_BASE[1]),
    ],
    source: 'distance',
    distanceKm: km,
  }
}

// ============ 实时票价查询链接（方案二） ============

/**
 * 火车票查询链接（去哪儿，中文站名直填）。
 * 链接形态 2026-09 实测可用；失效时只需改此函数。
 */
export function trainSearchUrl(from: string, to: string, date?: string): string {
  const q = `fromStation=${encodeURIComponent(from)}&toStation=${encodeURIComponent(to)}`
  return `https://train.qunar.com/stationToStation.htm?${q}${date ? `&date=${date}` : ''}`
}

/**
 * 机票查询链接（携程，需城市三字码）。任一城市无三字码返回 null。
 * 链接形态 2026-09 实测可用（中文拼法已失效，必须用三字码）。
 */
export function flightSearchUrl(from: string, to: string, date?: string): string | null {
  const fc = CITY_FLIGHT_CODES[from.replace(/市$/, '')]
  const tc = CITY_FLIGHT_CODES[to.replace(/市$/, '')]
  if (!fc || !tc) return null
  return `https://flights.ctrip.com/online/list/oneway-${fc}-${tc}${date ? `?depdate=${date}` : ''}`
}
