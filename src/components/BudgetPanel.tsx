import { useMemo, useState } from 'react'
import { useAppStore } from '../store'
import type { BudgetCategory, ItineraryPlan } from '../types'
import { BUDGET_CATEGORY_LABELS } from '../types'
import { trainSearchUrl, flightSearchUrl } from '../data/fares'

const CATEGORY_ICONS: Record<BudgetCategory, string> = {
  transport: '🚄',
  lodging: '🏨',
  tickets: '🎫',
  meals: '🍜',
  misc: '🛍️',
}

/** 大交通项的实时票价查询链接（火车/机票，按需显示） */
function FareLinks({ plan }: { plan: ItineraryPlan }) {
  const request = useAppStore((s) => s.request)
  if (!request?.origin.trim()) return null

  const origin = request.origin.trim().replace(/市$/, '')
  // 目的地取首日所在城市（多城市行程的主要到达地）
  const dest = plan.days[0]?.city
  if (!dest || dest === origin) return null
  const date = request.startDate ?? plan.days[0]?.date

  const train = trainSearchUrl(origin, dest, date)
  const flight = flightSearchUrl(origin, dest, date)

  return (
    <div className="no-print flex gap-3 mt-1">
      <a
        href={train}
        target="_blank"
        rel="noreferrer"
        className="text-[11px] text-blue-600 hover:underline"
      >
        🚄 查实时火车票
      </a>
      {flight && (
        <a
          href={flight}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] text-blue-600 hover:underline"
        >
          ✈️ 查实时机票
        </a>
      )}
    </div>
  )
}

/** 按类目聚合展示 + 可整体缩放（用户手动调整单价后的总览） */
export default function BudgetPanel({ plan }: { plan: ItineraryPlan }) {
  const [scale, setScale] = useState(1)

  const { items, total } = useMemo(() => {
    const byCat = new Map<BudgetCategory, { label: string; amount: number; note?: string }>()
    for (const item of plan.budget.perPerson) {
      const prev = byCat.get(item.category)
      byCat.set(item.category, {
        label: BUDGET_CATEGORY_LABELS[item.category],
        amount: (prev?.amount ?? 0) + item.amount,
        note: item.note,
      })
    }
    const items = [...byCat.entries()].sort(
      (a, b) => b[1].amount - a[1].amount,
    )
    return { items, total: plan.budget.total }
  }, [plan])

  const scaledTotal = Math.round(total * scale)
  const max = Math.max(...items.map(([, v]) => v.amount), 1)

  return (
    <div className="print-full bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-sm text-slate-700">💰 预算估算（每人）</h3>
        <span className="text-xs text-slate-400">AI 估算，仅供参考</span>
      </div>

      <div className="space-y-2.5">
        {items.map(([cat, v]) => (
          <div key={cat}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-600">
                {CATEGORY_ICONS[cat]} {v.label}
              </span>
              <span className="font-medium text-slate-700">
                ¥{Math.round(v.amount * scale).toLocaleString()}
              </span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${(v.amount / max) * 100}%` }}
              />
            </div>
            {cat === 'transport' && <FareLinks plan={plan} />}
          </div>
        ))}
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-400">合计</p>
          <p className="text-xl font-bold text-blue-700">
            ¥{scaledTotal.toLocaleString()}
          </p>
        </div>
        <div className="no-print flex items-center gap-1.5">
          {[0.7, 1, 1.3].map((s) => (
            <button
              key={s}
              onClick={() => setScale(s)}
              className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                scale === s
                  ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                  : 'border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              ×{s}
            </button>
          ))}
        </div>
      </div>

      {plan.budget.note && (
        <p className="text-xs text-slate-400 mt-2">{plan.budget.note}</p>
      )}
    </div>
  )
}
