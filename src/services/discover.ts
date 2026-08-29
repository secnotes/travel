import { chatCompletion } from '../llm/client'
import { buildDiscoverMessages } from '../llm/prompts'
import { extractJson, recommendationSchema } from '../llm/schema'
import { ALL_CITIES, getClimate } from '../data'
import { holidaysInRange } from '../data/holidays'
import { addDays } from './resolver'
import type {
  BudgetTier,
  DestinationRecommendation,
  LLMSettings,
  Theme,
} from '../types'
import { BUDGET_TIER_LABELS, THEME_LABELS } from '../types'

export interface DiscoverInput {
  startDate: string
  days: number
  origin: string
  themes: Theme[]
  budgetTier: BudgetTier
  notes?: string
}

function seasonOfMonth(month: number): 'spring' | 'summer' | 'autumn' | 'winter' {
  if (month >= 3 && month <= 5) return 'spring'
  if (month >= 6 && month <= 8) return 'summer'
  if (month >= 9 && month <= 11) return 'autumn'
  return 'winter'
}

/** 候选城市摘要：城市 + 当月气候 + 坐标（LLM 据此推理） */
function cityDigest(month: number): string {
  const season = seasonOfMonth(month)
  return ALL_CITIES.map((c) => {
    const climate = getClimate(c.city)?.monthly.find((m) => m.month === month)
    const climateStr = climate
      ? `${climate.tMin}~${climate.tMax}℃, 雨日${climate.rainDays}${climate.note ? `, ${climate.note}` : ''}`
      : '暂无数据'
    return `- ${c.city}（${c.province}, ${c.region}）[${c.coords[0]},${c.coords[1]}] 当${month}月: ${climateStr} | 适游季节:${season}`
  }).join('\n')
}

export async function discoverDestinations(
  settings: LLMSettings,
  input: DiscoverInput,
  callbacks?: { onDelta?: (t: string) => void; onStatus?: (s: string) => void },
): Promise<DestinationRecommendation[]> {
  callbacks?.onStatus?.('正在分析当季气候与目的地…')
  const month = new Date(input.startDate).getMonth() + 1
  const holidays = holidaysInRange(input.startDate, addDays(input.startDate, input.days))

  const digest = cityDigest(month) + (holidays.length
    ? `\n\n## 出行期间节假日（注意避峰）\n${holidays.map((h) => `- ${h.name}: ${h.start}~${h.end}${h.note ? ` (${h.note})` : ''}`).join('\n')}`
    : '')

  const messages = buildDiscoverMessages({
    startDate: input.startDate,
    days: input.days,
    origin: input.origin,
    themes: input.themes.map((t) => THEME_LABELS[t]),
    budgetTier: BUDGET_TIER_LABELS[input.budgetTier],
    cityDigest: digest,
    notes: input.notes,
  })

  callbacks?.onStatus?.('AI 顾问正在挑选目的地…')
  const raw = await chatCompletion(settings, messages, {
    onDelta: callbacks?.onDelta,
  })

  const json = extractJson(raw)
  const parsed = recommendationSchema.parse(json)
  return parsed.recommendations
}
