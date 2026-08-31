import { useMemo, useState } from 'react'
import { useAppStore } from '../store'
import { discoverDestinations } from '../services/discover'
import { discoverShareUrl } from '../services/share'
import { suggest } from '../services/resolver'
import {
  BUDGET_TIER_LABELS,
  THEME_LABELS,
  type BudgetTier,
  type DestinationRecommendation,
  type Theme,
} from '../types'

export default function DiscoverPanel() {
  const llm = useAppStore((s) => s.llm)
  const setTab = useAppStore((s) => s.setTab)
  const updatePlanDraft = useAppStore((s) => s.updatePlanDraft)

  // 表单与任务状态均在 store：切换标签不丢失，进行中的请求照常写回
  const form = useAppStore((s) => s.discoverForm)
  const updateForm = useAppStore((s) => s.updateDiscoverForm)
  const loading = useAppStore((s) => s.discoverLoading)
  const status = useAppStore((s) => s.discoverStatus)
  const error = useAppStore((s) => s.discoverError)
  const results = useAppStore((s) => s.discoverResults)
  const startDiscover = useAppStore((s) => s.startDiscover)
  const finishDiscover = useAppStore((s) => s.finishDiscover)
  const failDiscover = useAppStore((s) => s.failDiscover)
  const setDiscoverError = useAppStore((s) => s.setDiscoverError)
  const setDiscoverStatus = useAppStore((s) => s.setDiscoverStatus)

  const [originFocused, setOriginFocused] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)

  async function copyShareLink() {
    if (!results) return
    try {
      await navigator.clipboard.writeText(discoverShareUrl(form, results))
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2000)
    } catch {
      /* 剪贴板不可用时静默 */
    }
  }

  const originSuggestions = useMemo(
    () => (originFocused && form.origin ? suggest(form.origin, 5) : []),
    [form.origin, originFocused],
  )

  function toggleTheme(t: Theme) {
    updateForm({
      themes: form.themes.includes(t)
        ? form.themes.filter((x) => x !== t)
        : [...form.themes, t],
    })
  }

  async function run() {
    if (!form.origin.trim()) {
      setDiscoverError('请填写出发地，用于评估距离与交通')
      return
    }
    const demoProxyUrl = useAppStore.getState().demoProxyUrl
    if (!llm.apiKey && !demoProxyUrl) {
      setDiscoverError('请先点击右上角「设置」，配置模型 API Key 或启用公共演示模式')
      return
    }
    startDiscover()
    try {
      const recs = await discoverDestinations(
        llm,
        {
          startDate: form.startDate,
          days: form.days,
          origin: form.origin.trim(),
          themes: form.themes,
          budgetTier: form.budgetTier,
          notes: form.notes.trim() || undefined,
        },
        { onStatus: setDiscoverStatus },
      )
      finishDiscover(recs)
    } catch (e) {
      failDiscover(`推荐失败：${(e as Error).message}`)
    }
  }

  function goPlan(rec: DestinationRecommendation) {
    updatePlanDraft({ destination: rec.destination })
    setTab('plan')
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-slate-800">不知道去哪玩？</h1>
        <p className="text-slate-500 mt-2">
          告诉我出行时间和出发地，AI 顾问综合当季气候、景观与人流给出目的地推荐
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">出发日期</label>
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => updateForm({ startDate: e.target.value })}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">天数</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => updateForm({ days: Math.max(1, form.days - 1) })}
                className="w-9 h-9 rounded-lg border border-slate-300 hover:bg-slate-50"
              >
                −
              </button>
              <div className="flex-1 text-center py-2 border border-slate-200 rounded-lg bg-slate-50 font-medium">
                {form.days} 天
              </div>
              <button
                onClick={() => updateForm({ days: Math.min(30, form.days + 1) })}
                className="w-9 h-9 rounded-lg border border-slate-300 hover:bg-slate-50"
              >
                +
              </button>
            </div>
          </div>
        </div>

        <div className="relative">
          <label className="block text-sm font-medium mb-1.5">
            出发地 <span className="text-red-500">*</span>
          </label>
          <input
            value={form.origin}
            onChange={(e) => updateForm({ origin: e.target.value })}
            onFocus={() => setOriginFocused(true)}
            onBlur={() => setTimeout(() => setOriginFocused(false), 150)}
            placeholder="如：北京"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {originSuggestions.length > 0 && (
            <ul className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {originSuggestions.map((s, i) => (
                <li key={i}>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      updateForm({ origin: s.label })
                      setOriginFocused(false)
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50"
                  >
                    <span className="text-sm font-medium">{s.label}</span>
                    <span className="block text-xs text-slate-400 truncate">{s.sub}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">主题偏好（多选，可选）</label>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(THEME_LABELS) as Theme[]).map((t) => (
              <button
                key={t}
                onClick={() => toggleTheme(t)}
                className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${
                  form.themes.includes(t)
                    ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {THEME_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">预算档位</label>
            <select
              value={form.budgetTier}
              onChange={(e) => updateForm({ budgetTier: e.target.value as BudgetTier })}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {(Object.keys(BUDGET_TIER_LABELS) as BudgetTier[]).map((t) => (
                <option key={t} value={t}>
                  {BUDGET_TIER_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1.5">其他要求（可选）</label>
            <input
              value={form.notes}
              onChange={(e) => updateForm({ notes: e.target.value })}
              placeholder="如：不想去太冷的地方、避开人挤人"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>
        )}

        <button
          onClick={run}
          disabled={loading}
          className="w-full py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-60"
        >
          {loading ? '分析中…' : '🌤️ 为我推荐目的地'}
        </button>

        {loading && (
          <p className="text-sm text-blue-700 flex items-center gap-2">
            <span className="inline-block w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            {status || '正在分析…'}
          </p>
        )}
      </div>

      {/* 推荐结果 */}
      {results && (
        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-slate-500">
              为你挑选了 {results.length} 个目的地（按推荐度排序）
            </h2>
            <button
              onClick={copyShareLink}
              className="shrink-0 text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-blue-300 transition-colors"
            >
              {shareCopied ? '已复制链接 ✓' : '🔗 分享推荐'}
            </button>
          </div>
          {results.map((rec, i) => (
            <div
              key={`${rec.destination}-${i}`}
              className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-blue-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-lg">
                    {i + 1}. {rec.destination}
                    <span className="text-sm font-normal text-slate-400 ml-1.5">
                      {rec.province}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    建议 {rec.suggestedDays} 天 · {rec.climateNote}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <div
                    className={`text-2xl font-bold ${
                      rec.score >= 85
                        ? 'text-green-600'
                        : rec.score >= 70
                          ? 'text-blue-600'
                          : 'text-slate-400'
                    }`}
                  >
                    {rec.score}
                  </div>
                  <div className="text-[10px] text-slate-400">推荐指数</div>
                </div>
              </div>

              <ul className="mt-3 space-y-1">
                {rec.reasons.map((r, j) => (
                  <li key={j} className="text-sm text-slate-600 flex gap-1.5">
                    <span className="text-blue-500">•</span> {r}
                  </li>
                ))}
              </ul>

              <p className="text-xs text-slate-400 mt-2">👥 {rec.crowdNote}</p>

              <button
                onClick={() => goPlan(rec)}
                className="mt-3 text-sm px-4 py-1.5 rounded-lg border border-blue-500 text-blue-600 hover:bg-blue-50 font-medium"
              >
                用它做行程规划 →
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
