import { useAppStore } from '../store'
import type { PlanActivity, PlanDay } from '../types'
import MapView from './MapView'
import BudgetPanel from './BudgetPanel'
import ChatPanel from './ChatPanel'
import ExportMenu from './ExportMenu'

const TYPE_ICONS: Record<PlanActivity['type'], string> = {
  attraction: '📍',
  meal: '🍜',
  transport: '🚄',
  rest: '☕',
  free: '🚶',
}

export default function ItineraryView() {
  const plan = useAppStore((s) => s.plan)

  if (!plan) return null

  return (
    <div className="space-y-6">
      {/* 概览卡片 */}
      <section className="print-full bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        {/* 窄屏上下堆叠：按钮在侧会把标题/概述挤窄（按钮下方留大片空白） */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-800">{plan.title}</h1>
            <p className="text-slate-500 mt-2 leading-relaxed">{plan.overview}</p>
          </div>
          {/* 手机端导出入口移至头部弯箭头图标按钮（见 MobileActions） */}
          <div className="no-print shrink-0 hidden sm:block">
            <ExportMenu plan={plan} />
          </div>
        </div>

        {plan.warnings && plan.warnings.length > 0 && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
            {plan.warnings.map((w, i) => (
              <p key={i} className="text-sm text-amber-700">
                ⚠️ {w}
              </p>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {plan.days.map((d) => (
            <span
              key={d.day}
              className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-600"
            >
              D{d.day} {d.theme}
            </span>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* 左：每日行程 + 对话 */}
        <div className="lg:col-span-3 space-y-4">
          {plan.days.map((day) => (
            <DayCard key={day.day} day={day} />
          ))}
          <div className="print-full bg-white rounded-2xl border border-slate-200 p-6 grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="font-bold text-slate-700 mb-2">🧳 行李建议</h3>
              <ul className="text-sm text-slate-600 space-y-1 list-disc list-inside">
                {plan.packingList.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-bold text-slate-700 mb-2">💡 实用贴士</h3>
              <ul className="text-sm text-slate-600 space-y-1 list-disc list-inside">
                {plan.tips.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* 右：地图 + 预算 + 对话（桌面端吸附） */}
        <div className="lg:col-span-2 space-y-4">
          <div className="no-print lg:sticky lg:top-20 space-y-4">
            <MapView plan={plan} />
            <BudgetPanel plan={plan} />
            <ChatPanel />
          </div>
        </div>
      </div>
    </div>
  )
}

function DayCard({ day }: { day: PlanDay }) {
  return (
    <section className="print-full bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <header className="bg-slate-50 border-b border-slate-200 px-5 py-3 flex items-baseline gap-3 flex-wrap">
        <span className="font-bold text-blue-700">D{day.day}</span>
        {day.date && (
          <span className="text-xs text-slate-400">{day.date}</span>
        )}
        <span className="font-medium">{day.theme}</span>
        <span className="text-xs text-slate-400 ml-auto">{day.city}</span>
      </header>

      <ol className="p-5 space-y-0 relative">
        {day.activities.map((act, i) => (
          <li key={i} className="flex gap-3 pb-4 last:pb-0">
            {/* 时间轴 */}
            <div className="flex flex-col items-center">
              <span className="text-xs font-mono text-slate-500 whitespace-nowrap w-11 text-right">
                {act.startTime}
              </span>
              {i < day.activities.length - 1 && (
                <span className="w-px flex-1 bg-slate-200 mt-1" />
              )}
            </div>
            <div className="flex-1 bg-slate-50 hover:bg-slate-100 transition-colors rounded-lg px-3.5 py-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span>{TYPE_ICONS[act.type]}</span>
                <span className="font-medium text-sm">{act.name}</span>
                {!act.verified && act.type === 'attraction' && (
                  <span
                    title="该景点不在本地数据集中，由 AI 补充，信息请自行核实"
                    className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700"
                  >
                    待核实
                  </span>
                )}
                {act.ticket !== undefined && act.ticket > 0 && (
                  <span className="text-xs text-slate-400">¥{act.ticket}</span>
                )}
              </div>
              {act.note && (
                <p className="text-xs text-slate-500 mt-1">{act.note}</p>
              )}
            </div>
          </li>
        ))}
      </ol>

      <footer className="px-5 py-3 border-t border-slate-100 text-xs text-slate-500 space-y-1 bg-slate-50/50">
        <p>🚌 {day.transportNote}</p>
        {day.lodging && <p>🏨 建议住宿：{day.lodging}</p>}
      </footer>
    </section>
  )
}
