/**
 * Open-Meteo 免 Key 天气预报（16 天内）。
 * https://open-meteo.com/ 坐标采用 GCJ-02 会有数百米偏差，对城市级预报无影响。
 */

export interface DailyWeather {
  date: string
  tMax: number
  tMin: number
  precipitation: number // mm
  precipitationProb: number // %
  windMax: number // km/h
}

interface OpenMeteoResponse {
  daily: {
    time: string[]
    temperature_2m_max: number[]
    temperature_2m_min: number[]
    precipitation_sum: number[]
    precipitation_probability_max: number[]
    wind_speed_10m_max: number[]
  }
}

export async function fetchWeatherForecast(
  coords: [number, number],
  startDate: string,
  endDate: string,
): Promise<DailyWeather[]> {
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${coords[1]}&longitude=${coords[0]}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max` +
    `&timezone=Asia%2FShanghai&start_date=${startDate}&end_date=${endDate}`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`天气服务返回 ${res.status}`)
  const json = (await res.json()) as OpenMeteoResponse
  const d = json.daily
  return d.time.map((date, i) => ({
    date,
    tMax: Math.round(d.temperature_2m_max[i]),
    tMin: Math.round(d.temperature_2m_min[i]),
    precipitation: d.precipitation_sum[i],
    precipitationProb: d.precipitation_probability_max[i] ?? 0,
    windMax: d.wind_speed_10m_max[i],
  }))
}

/** 日期是否在 16 天预报窗口内（Open-Meteo 免费版限制） */
export function withinForecastWindow(startDate?: string): boolean {
  if (!startDate) return false
  const start = new Date(startDate).getTime()
  if (Number.isNaN(start)) return false
  const now = Date.now()
  const days = (start - now) / 86400000
  return days >= -1 && days <= 15
}

export function weatherSummary(list: DailyWeather[]): string {
  if (list.length === 0) return ''
  const lines = list.map(
    (w) =>
      `${w.date}: ${w.tMin}~${w.tMax}℃, 降水概率 ${w.precipitationProb}%${
        w.precipitationProb >= 60 ? '（建议备雨具）' : ''
      }`,
  )
  return lines.join('\n')
}
