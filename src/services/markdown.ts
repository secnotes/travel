import type { ItineraryPlan } from '../types'
import { BUDGET_CATEGORY_LABELS, BUDGET_TIER_LABELS } from '../types'
import type { PlanRequest } from '../types'

/** 行程 -> Markdown 文档 */
export function planToMarkdown(
  plan: ItineraryPlan,
  req?: PlanRequest,
): string {
  const lines: string[] = []

  lines.push(`# ${plan.title}`)
  lines.push('')
  if (req) {
    lines.push(
      `> ${req.days} 天 · ${req.origin} → ${req.destination} · ${BUDGET_TIER_LABELS[req.budgetTier]}档 · ${req.startDate ?? '日期未定'}`,
    )
    lines.push('')
  }
  lines.push(plan.overview)
  lines.push('')

  if (plan.warnings?.length) {
    for (const w of plan.warnings) lines.push(`> ⚠️ ${w}`)
    lines.push('')
  }

  for (const day of plan.days) {
    lines.push(`## D${day.day} ${day.theme}${day.date ? `（${day.date}）` : ''}`)
    lines.push('')
    for (const act of day.activities) {
      const ticket = act.ticket ? `（门票 ¥${act.ticket}）` : ''
      const note = act.note ? ` —— ${act.note}` : ''
      lines.push(`- ${act.startTime}-${act.endTime} ${act.name}${ticket}${note}`)
    }
    lines.push('')
    lines.push(`- 🚌 交通：${day.transportNote}`)
    if (day.lodging) lines.push(`- 🏨 住宿：${day.lodging}`)
    lines.push('')
  }

  lines.push('## 预算估算（每人）')
  lines.push('')
  lines.push('| 类目 | 项目 | 金额 |')
  lines.push('| --- | --- | --- |')
  for (const item of plan.budget.perPerson) {
    lines.push(
      `| ${BUDGET_CATEGORY_LABELS[item.category]} | ${item.label} | ¥${item.amount} |`,
    )
  }
  lines.push(`| **合计** | | **¥${plan.budget.total}** |`)
  lines.push('')

  if (plan.packingList.length) {
    lines.push('## 行李建议')
    lines.push('')
    for (const p of plan.packingList) lines.push(`- ${p}`)
    lines.push('')
  }

  if (plan.tips.length) {
    lines.push('## 实用贴士')
    lines.push('')
    for (const t of plan.tips) lines.push(`- ${t}`)
    lines.push('')
  }

  lines.push('---')
  lines.push('*由「悠行 · AI 旅行规划」生成，价格与人流信息请以实际为准*')

  return lines.join('\n')
}

export function downloadText(filename: string, text: string, mime = 'text/markdown') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
