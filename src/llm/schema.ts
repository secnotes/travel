import { z } from 'zod'

/** LLM 行程输出的运行时校验 schema（zod） */

const coordsSchema = z.tuple([z.number(), z.number()])

export const planActivitySchema = z.object({
  attractionId: z.string().optional(),
  name: z.string().min(1),
  startTime: z.string().regex(/^\d{1,2}:\d{2}$/, '时间格式应为 HH:mm'),
  endTime: z.string().regex(/^\d{1,2}:\d{2}$/),
  type: z.enum(['attraction', 'meal', 'transport', 'rest', 'free']),
  ticket: z.number().min(0).optional(),
  note: z.string().optional(),
  coords: coordsSchema.optional(),
  verified: z.boolean(),
})

export const planDaySchema = z.object({
  day: z.number().int().min(1),
  date: z.string().optional(),
  theme: z.string().min(1),
  city: z.string().min(1),
  activities: z.array(planActivitySchema).min(1),
  transportNote: z.string(),
  lodging: z.string().optional(),
  estimatedCost: z.number().min(0),
})

export const itineraryPlanSchema = z.object({
  title: z.string().min(1),
  overview: z.string().min(1),
  days: z.array(planDaySchema).min(1),
  budget: z.object({
    perPerson: z.array(
      z.object({
        category: z.enum(['transport', 'lodging', 'tickets', 'meals', 'misc']),
        label: z.string(),
        amount: z.number().min(0),
        note: z.string().optional(),
      }),
    ),
    total: z.number().min(0),
    note: z.string().optional(),
  }),
  packingList: z.array(z.string()),
  tips: z.array(z.string()),
  warnings: z.array(z.string()).optional(),
})

export const recommendationSchema = z.object({
  recommendations: z
    .array(
      z.object({
        destination: z.string(),
        province: z.string(),
        score: z.number().min(0).max(100),
        reasons: z.array(z.string()),
        climateNote: z.string(),
        crowdNote: z.string(),
        suggestedDays: z.number().int().min(1).max(30),
        coords: coordsSchema.optional(),
      }),
    )
    .min(3),
})

/**
 * 从 LLM 输出中提取 JSON（容忍 ```json 围栏、前后闲聊文字）。
 */
export function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidates = [fenced?.[1], raw].filter(Boolean) as string[]
  for (const text of candidates) {
    const start = text.search(/[[{]/)
    if (start === -1) continue
    const endChar = text[start] === '[' ? ']' : '}'
    const end = text.lastIndexOf(endChar)
    if (end <= start) continue
    try {
      return JSON.parse(text.slice(start, end + 1))
    } catch {
      /* 尝试下一个候选 */
    }
  }
  throw new Error('模型输出中未找到合法 JSON')
}
