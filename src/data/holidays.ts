import type { Holiday } from '../types'

/**
 * 法定节假日（含调休后实际休息区间，按国务院办公厅公布口径整理）。
 * 注意：调休细节以官方最新公布为准，此处用于行程避峰提示。
 */
export const HOLIDAYS: Holiday[] = [
  // ---- 2026 ----
  { name: '元旦', start: '2026-01-01', end: '2026-01-03', note: '三天连休' },
  {
    name: '春节',
    start: '2026-02-16',
    end: '2026-02-23',
    note: '除夕至初七共 8 天，春运高峰，机票火车票需提前抢',
  },
  { name: '清明节', start: '2026-04-04', end: '2026-04-06' },
  { name: '劳动节', start: '2026-05-01', end: '2026-05-05', note: '五天连休' },
  { name: '端午节', start: '2026-06-19', end: '2026-06-21' },
  { name: '中秋节', start: '2026-09-25', end: '2026-09-27' },
  {
    name: '国庆节',
    start: '2026-10-01',
    end: '2026-10-07',
    note: '七天长假，热门景区人流极大',
  },
  // ---- 2027 ----
  { name: '元旦', start: '2027-01-01', end: '2027-01-03' },
  {
    name: '春节',
    start: '2027-02-05',
    end: '2027-02-12',
    note: '2027 年春节为 2 月 6 日（正月初一），具体调休以官方公布为准',
  },
  { name: '清明节', start: '2027-04-03', end: '2027-04-05' },
  { name: '劳动节', start: '2027-05-01', end: '2027-05-05' },
]

/** 判断日期区间是否与节假日重叠 */
export function holidaysInRange(
  start?: string,
  end?: string,
): Holiday[] {
  if (!start || !end) return []
  const s = new Date(start).getTime()
  const e = new Date(end).getTime()
  if (Number.isNaN(s) || Number.isNaN(e)) return []
  return HOLIDAYS.filter((h) => {
    const hs = new Date(h.start).getTime()
    const he = new Date(h.end).getTime()
    return hs <= e && he >= s
  })
}
