import type { TripContext } from '../services/resolver'
import { rankAttractions } from '../services/resolver'
import type { ItineraryPlan, PlanRequest } from '../types'
import { BUDGET_TIER_LABELS, PACE_LABELS, THEME_LABELS } from '../types'

/**
 * 构建行程规划的系统提示词。
 * 核心策略：LLM 只能"编排"数据集中给出的景点（防幻觉），
 * 数据集外内容必须显式标 verified=false。
 */
function planSystemPrompt(): string {
  return `你是一位资深中国旅行规划师，精通各地地理、交通、气候与玩法。

## 你的任务
根据用户需求与【本地数据集】，产出一份逐日行程规划。

## 硬性规则（必须遵守）
1. 行程中出现的景点，凡在【本地数据集】里的，必须填写其 attractionId（原样复制），并设 verified=true。
2. 数据集中没有但确有必要补充的景点/餐厅，可以写，但 attractionId 留空、verified=false，note 中注明"待核实"。
3. 门票价格：数据集内景点以数据集 ticket 为准；数据集外凭常识估算并注明。
4. 每日安排要符合地理顺路原则，减少回头路；考虑景点营业时间（博物馆多周一闭馆）。
5. 节奏按用户偏好：悠闲=每天 2-3 个主要活动；适中=3-4 个；紧凑=4-5 个。
6. 时间用 24 小时制 "HH:mm" 字符串。
7. **所有字段必须填写具体内容，禁止用"省略""无""略"等占位词**。每日 theme 必须是当天行程的概括标题（如"西湖环湖 + 河坊街夜游"），不可省略。
8. 输出必须是**纯 JSON**，不要输出任何解释文字、不要用 markdown 围栏。严格遵循如下结构：

{
  "title": "行程标题",
  "overview": "总体概述，2-3 句",
  "days": [
    {
      "day": 1,
      "date": "YYYY-MM-DD（无出发日期时此字段留空字符串）",
      "theme": "当日主题，如：西湖环湖 + 河坊街夜游",
      "city": "所在城市",
      "activities": [
        {
          "attractionId": "数据集 id（数据集外景点此字段留空字符串）",
          "name": "活动名",
          "startTime": "09:00",
          "endTime": "11:30",
          "type": "attraction|meal|transport|rest|free",
          "ticket": 0,
          "note": "备注",
          "coords": [经度, 纬度],
          "verified": true
        }
      ],
      "transportNote": "当日交通说明",
      "lodging": "建议住宿区域",
      "estimatedCost": 300
    }
  ],
  "budget": {
    "perPerson": [
      { "category": "transport|lodging|tickets|meals|misc", "label": "项目名", "amount": 800, "note": "说明" }
    ],
    "total": 2500,
    "note": "预算说明"
  },
  "packingList": ["行李建议"],
  "tips": ["实用贴士"],
  "warnings": ["注意事项，如节假日人流/天气"]
}

## 预算锚点规则
预算必须参考提供的【城市消费锚点】，按用户档位（穷游/舒适/奢华）取对应数值；大交通按出发地与目的地的常见方式（高铁二等座/经济舱）估算，给出金额并注明是估算。`
}

/** 景点压缩为提示词友好的行格式 */
function attractionLines(ctx: TripContext): string {
  const ranked = rankAttractions(ctx.match.attractions, ctx.request.themes)
  return ranked
    .map(
      (a) =>
        `- id:${a.id} | ${a.name} | ${a.province}${a.city} | 坐标[${a.coords[0]},${a.coords[1]}] | 门票${a.ticket}元 | 建议${a.duration}h | 推荐度${a.rating} | 主题:${a.themes.map((t) => THEME_LABELS[t]).join('/')} | 最佳季节:${a.bestSeasons.join('/')} | ${a.desc}${a.tips ? ` | 贴士:${a.tips}` : ''}`,
    )
    .join('\n')
}

function cityLines(ctx: TripContext): string {
  return ctx.match.cities
    .map((c) => {
      const tierIdx =
        ctx.request.budgetTier === 'budget' ? 0 : ctx.request.budgetTier === 'comfort' ? 1 : 2
      return `- ${c.city}（${c.province}）: 餐饮${c.meal[tierIdx]}元/人/天, 住宿${c.hotel[tierIdx]}元/晚, 市内交通${c.localTransport[tierIdx]}元/天 | ${c.blurb}`
    })
    .join('\n')
}

function climateLines(ctx: TripContext): string {
  return ctx.climate
    .map((c) => {
      const months = c.monthly
        .map((m) => `${m.month}月:${m.tMin}~${m.tMax}℃ 雨日${m.rainDays}${m.note ? `(${m.note})` : ''}`)
        .join('; ')
      return `- ${c.city}: ${months}`
    })
    .join('\n')
}

export function buildPlanMessages(
  ctx: TripContext,
  extra: { weather?: string } = {},
): { role: 'system' | 'user'; content: string }[] {
  const req: PlanRequest = ctx.request
  const sections: string[] = []

  sections.push(`## 用户需求
- 天数：${req.days} 天
- 目的地：${req.destination}${ctx.unmatched ? '（数据集中未收录，请凭你的知识补充景点，全部标记 verified=false）' : ''}
- 出发地：${req.origin}
- 出发日期：${req.startDate ?? '未定'}
- 预算档位：${BUDGET_TIER_LABELS[req.budgetTier]}
- 节奏：${PACE_LABELS[req.pace]}
- 主题偏好：${req.themes.length ? req.themes.map((t) => THEME_LABELS[t]).join('、') : '无特别偏好'}
- 同行人数：${req.travelers ?? 1}
${req.extraNotes ? `- 补充说明：${req.extraNotes}` : ''}`)

  if (!ctx.unmatched) {
    sections.push(`## 本地数据集（编排行程的唯一事实来源）
### 可用景点
${attractionLines(ctx) || '（无）'}

### 城市消费锚点
${cityLines(ctx) || '（无）'}`)
  }

  if (ctx.climate.length > 0) {
    sections.push(`## 目的地气候（当月）
${climateLines(ctx)}`)
  }

  if (ctx.holidays.length > 0) {
    sections.push(`## 行程期间的法定节假日（注意人流与涨价）
${ctx.holidays.map((h) => `- ${h.name}: ${h.start} ~ ${h.end}${h.note ? ` (${h.note})` : ''}`).join('\n')}`)
  }

  if (extra.weather) {
    sections.push(`## 目的地天气预报
${extra.weather}`)
  }

  sections.push(`请输出 JSON 行程（遵守系统提示词的全部规则）。`)

  return [
    { role: 'system', content: planSystemPrompt() },
    { role: 'user', content: sections.join('\n\n') },
  ]
}

/** 多轮修改：用户反馈 + 当前计划 -> 新计划 */
export function buildRefineMessages(
  currentPlan: ItineraryPlan,
  feedback: string,
): { role: 'system' | 'user' | 'assistant'; content: string }[] {
  return [
    {
      role: 'system',
      content: `你是旅行规划师。用户将对当前行程提出修改意见。请在保持整体结构合理的前提下按意见调整，输出修改后的**完整 JSON 行程**（结构不变，纯 JSON，无解释文字）。所有原有规则（attractionId、verified、预算锚点）继续适用。所有字段必须填写具体内容，禁止用"省略""无""略"等占位词，每日 theme 必须是当天的概括标题。`,
    },
    {
      role: 'assistant',
      content: JSON.stringify(currentPlan),
    },
    {
      role: 'user',
      content: `修改意见：${feedback}\n\n请输出调整后的完整 JSON。`,
    },
  ]
}

/** 目的地发现（需求 2）的系统提示词 */
export function buildDiscoverMessages(input: {
  startDate: string
  days: number
  origin: string
  themes: string[]
  budgetTier: string
  cityDigest: string
  notes?: string
}): { role: 'system' | 'user'; content: string }[] {
  const system = `你是一位资深中国旅行顾问。用户给出出行时间与偏好，你从候选城市中推荐最合适的目的地。

规则：
1. 只推荐【候选城市】中列出的城市（可推荐城市名或其附近著名景区，province 字段填候选城市所属省份）。
2. 综合考量：当月气候舒适度（避开极端严寒酷暑与雨季）、季节性景观（花期/红叶/冰雪）、节假日人流、与出发地的距离。
3. 推荐 5-8 个，按 score 从高到低排序，附具体理由（提到具体景点或体验更佳）。
4. 输出纯 JSON，无解释文字，结构如下：
{
  "recommendations": [
    {
      "destination": "城市或景区名",
      "province": "省份",
      "score": 88,
      "reasons": ["理由1", "理由2"],
      "climateNote": "当月气候一句话",
      "crowdNote": "人流预期一句话",
      "suggestedDays": 4,
      "coords": [经度, 纬度]
    }
  ]
}`

  const user = `## 用户情况
- 出行时间：${input.startDate} 起，共 ${input.days} 天
- 出发地：${input.origin}
- 预算档位：${input.budgetTier}
- 主题偏好：${input.themes.length ? input.themes.join('、') : '不限'}
${input.notes ? `- 补充：${input.notes}` : ''}

## 候选城市（含当月气候与月度均温）
${input.cityDigest}

请输出推荐 JSON。`

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}
