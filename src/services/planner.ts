import { chatCompletion } from '../llm/client'
import { buildPlanMessages, buildRefineMessages } from '../llm/prompts'
import { extractJson, itineraryPlanSchema } from '../llm/schema'
import { getAttraction } from '../data'
import { addDays, buildTripContext, type TripContext } from './resolver'
import { fetchWeatherForecast, weatherSummary, withinForecastWindow } from './weather'
import type { ItineraryPlan, LLMSettings, PlanRequest } from '../types'

export interface PlannerCallbacks {
  /** 流式原始文本（用于展示生成进度） */
  onDelta?: (text: string) => void
  onStatus?: (status: string) => void
}

/** 校验后 enrichment：回填数据集中的坐标/门票，补每日日期 */
function enrichPlan(plan: ItineraryPlan, req: PlanRequest): ItineraryPlan {
  // 兜底清洗：AI 偶发用"省略/无/略"等占位词，渲染前替换
  const PLACEHOLDER = /^(省略|无|略|暂无|待定|none|null)$/i
  if (PLACEHOLDER.test(plan.title)) plan.title = '行程规划'
  if (PLACEHOLDER.test(plan.overview)) plan.overview = '由 AI 生成的逐日行程规划。'

  for (const day of plan.days) {
    if (PLACEHOLDER.test(day.theme)) {
      // 用当天主要活动名兜底
      day.theme = day.activities[0]?.name ?? `第 ${day.day} 天`
    }
    for (const act of day.activities) {
      if (PLACEHOLDER.test(act.name)) act.name = act.type === 'meal' ? '用餐' : act.type === 'transport' ? '交通' : '活动'
      if (act.note && PLACEHOLDER.test(act.note)) act.note = undefined
    }
    if (PLACEHOLDER.test(day.transportNote)) day.transportNote = '见当日活动安排'
    if (day.lodging && PLACEHOLDER.test(day.lodging)) day.lodging = undefined

    if (req.startDate && !day.date) {
      day.date = addDays(req.startDate, day.day - 1)
    }
    for (const act of day.activities) {
      if (act.attractionId) {
        const attr = getAttraction(act.attractionId)
        if (attr) {
          act.verified = true
          act.coords = attr.coords
          if (act.ticket === undefined) act.ticket = attr.ticket
        } else {
          // id 未命中数据集：降级为待核实
          act.verified = false
          act.attractionId = undefined
        }
      }
    }
  }
  return plan
}

async function callAndValidate(
  settings: LLMSettings,
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  req: PlanRequest,
  callbacks?: PlannerCallbacks,
): Promise<ItineraryPlan> {
  const raw = await chatCompletion(settings, messages, {
    onDelta: callbacks?.onDelta,
  })

  let plan: ItineraryPlan
  try {
    const json = extractJson(raw)
    plan = itineraryPlanSchema.parse(json) as ItineraryPlan
  } catch (err) {
    // 一次自动重试：把校验错误喂回模型
    callbacks?.onStatus?.('输出格式不规范，正在自动修正…')
    const retryRaw = await chatCompletion(
      settings,
      [
        ...messages,
        { role: 'assistant', content: raw.slice(0, 8000) },
        {
          role: 'user',
          content: `你上一次的输出无法通过校验：${(err as Error).message.slice(0, 500)}\n请重新输出完整、合法的 JSON（纯 JSON，无任何其他文字）。`,
        },
      ],
      { onDelta: callbacks?.onDelta },
    )
    const retryJson = extractJson(retryRaw)
    plan = itineraryPlanSchema.parse(retryJson) as ItineraryPlan
  }

  return enrichPlan(plan, req)
}

/** 主入口：生成行程 */
export async function generatePlan(
  settings: LLMSettings,
  req: PlanRequest,
  callbacks?: PlannerCallbacks,
): Promise<{ plan: ItineraryPlan; context: TripContext }> {
  callbacks?.onStatus?.('正在匹配目的地与本地数据…')
  const ctx = buildTripContext(req)

  // 16 天内且已知目的地坐标 -> 拉取天气预报
  let weather: string | undefined
  if (withinForecastWindow(req.startDate) && ctx.match.cities[0]) {
    try {
      callbacks?.onStatus?.('正在获取目的地天气预报…')
      const start = req.startDate!
      const end = addDays(start, req.days)
      const forecast = await fetchWeatherForecast(
        ctx.match.cities[0].coords,
        start,
        end,
      )
      weather = weatherSummary(forecast)
    } catch {
      /* 天气获取失败不阻塞行程生成 */
    }
  }

  callbacks?.onStatus?.('AI 规划师正在编排行程…')
  const messages = buildPlanMessages(ctx, { weather })
  const plan = await callAndValidate(settings, messages, req, callbacks)

  return { plan, context: ctx }
}

/** 多轮修改 */
export async function refinePlan(
  settings: LLMSettings,
  req: PlanRequest,
  currentPlan: ItineraryPlan,
  feedback: string,
  callbacks?: PlannerCallbacks,
): Promise<ItineraryPlan> {
  callbacks?.onStatus?.('正在按你的意见调整行程…')
  const messages = buildRefineMessages(currentPlan, feedback)
  return callAndValidate(settings, messages, req, callbacks)
}
