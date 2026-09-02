import { useMemo, useRef, useState } from 'react'
import { useAppStore, type PlanFormDraft } from '../store'
import { suggest, type Suggestion } from '../services/resolver'
import { generatePlan } from '../services/planner'
import {
  BUDGET_TIER_LABELS,
  PACE_LABELS,
  THEME_LABELS,
  type BudgetTier,
  type Pace,
  type PlanRequest,
  type Theme,
} from '../types'

export default function PlanForm() {
  const llm = useAppStore((s) => s.llm)
  const startGeneration = useAppStore((s) => s.startGeneration)
  const setPlan = useAppStore((s) => s.setPlan)
  const setStatus = useAppStore((s) => s.setStatus)
  const setStream = useAppStore((s) => s.setStream)
  const setError = useAppStore((s) => s.setError)
  const setGenerating = useAppStore((s) => s.setGenerating)
  const saveToHistory = useAppStore((s) => s.saveToHistory)
  const removeFromHistory = useAppStore((s) => s.removeFromHistory)
  const history = useAppStore((s) => s.history)

  // 表单草稿在 store：切换标签页不丢失
  const form = useAppStore((s) => s.planDraft)
  const updateForm = useAppStore((s) => s.updatePlanDraft)
  const destination = form.destination
  const setDestination = (v: string) => updateForm({ destination: v })

  const [destFocused, setDestFocused] = useState(false)
  const [originFocused, setOriginFocused] = useState(false)
  const blurTimer = useRef<ReturnType<typeof setTimeout>>()

  const destSuggestions = useMemo(
    () => (destFocused ? suggest(destination) : []),
    [destination, destFocused],
  )
  const originSuggestions = useMemo(
    () => (originFocused && form.origin ? suggest(form.origin, 5) : []),
    [form.origin, originFocused],
  )

  function set<K extends keyof PlanFormDraft>(key: K, value: PlanFormDraft[K]) {
    updateForm({ [key]: value })
  }

  function toggleTheme(t: Theme) {
    set(
      'themes',
      form.themes.includes(t)
        ? form.themes.filter((x) => x !== t)
        : [...form.themes, t],
    )
  }

  async function submit() {
    if (!destination.trim()) {
      setError('请填写目的地')
      return
    }
    if (!form.origin.trim()) {
      setError('请填写出发地')
      return
    }
    const demoProxyUrl = useAppStore.getState().demoProxyUrl
    if (!llm.apiKey && !demoProxyUrl) {
      setError('请先点击右上角「设置」，配置模型 API Key 或启用公共演示模式')
      return
    }

    const req: PlanRequest = {
      ...form,
      startDate: form.startDate || undefined,
      destination: destination.trim(),
      origin: form.origin.trim(),
    }

    startGeneration(req)
    let streamBuf = ''
    try {
      const { plan } = await generatePlan(llm, req, {
        onStatus: setStatus,
        onDelta: (t) => {
          streamBuf += t
          setStream(streamBuf.slice(-400))
        },
      })
      setPlan(plan, '已生成行程，可以在下方继续提修改意见')
      saveToHistory(req, plan)
    } catch (e) {
      setError(`生成失败：${(e as Error).message}`)
      setGenerating(false)
    }
  }

  const error = useAppStore((s) => s.error)
  const generating = useAppStore((s) => s.generating)
  const statusText = useAppStore((s) => s.statusText)
  const streamText = useAppStore((s) => s.streamText)

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-slate-800">规划你的下一次旅行</h1>
        <p className="text-slate-500 mt-2">
          告诉我天数、目的地和出发地，AI 规划师为你编排逐日行程、动线与预算
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          {/* 目的地 */}
          <div className="relative col-span-2 sm:col-span-1">
            <label className="block text-sm font-medium mb-1.5">
              目的地 <span className="text-red-500">*</span>
            </label>
            <input
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              onFocus={() => {
                clearTimeout(blurTimer.current)
                setDestFocused(true)
              }}
              onBlur={() => {
                blurTimer.current = setTimeout(() => setDestFocused(false), 150)
              }}
              placeholder="省份 / 城市 / 景点，如：云南、杭州、鼓浪屿"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <SuggestionList
              items={destSuggestions}
              onPick={(s) => {
                setDestination(s.label)
                setDestFocused(false)
              }}
            />
          </div>

          {/* 出发地 */}
          <div className="relative col-span-2 sm:col-span-1">
            <label className="block text-sm font-medium mb-1.5">
              出发地 <span className="text-red-500">*</span>
            </label>
            <input
              value={form.origin}
              onChange={(e) => set('origin', e.target.value)}
              onFocus={() => setOriginFocused(true)}
              onBlur={() => setTimeout(() => setOriginFocused(false), 150)}
              placeholder="如：上海"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <SuggestionList
              items={originSuggestions}
              onPick={(s) => {
                set('origin', s.label)
                setOriginFocused(false)
              }}
            />
          </div>

          {/* 天数 */}
          <div>
            <label className="block text-sm font-medium mb-1.5">天数</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => set('days', Math.max(1, form.days - 1))}
                className="w-9 h-9 rounded-lg border border-slate-300 hover:bg-slate-50"
              >
                −
              </button>
              <div className="flex-1 text-center py-2 border border-slate-200 rounded-lg bg-slate-50 font-medium">
                {form.days} 天
              </div>
              <button
                onClick={() => set('days', Math.min(30, form.days + 1))}
                className="w-9 h-9 rounded-lg border border-slate-300 hover:bg-slate-50"
              >
                +
              </button>
            </div>
          </div>

          {/* 日期 */}
          <div>
            <label className="block text-sm font-medium mb-1.5">出发日期（可选）</label>
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => set('startDate', e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* 预算档位 */}
        <div>
          <label className="block text-sm font-medium mb-1.5">预算档位</label>
          <div className="flex gap-2">
            {(Object.keys(BUDGET_TIER_LABELS) as BudgetTier[]).map((t) => (
              <Pill
                key={t}
                active={form.budgetTier === t}
                onClick={() => set('budgetTier', t)}
              >
                {BUDGET_TIER_LABELS[t]}
              </Pill>
            ))}
          </div>
        </div>

        {/* 节奏 */}
        <div>
          <label className="block text-sm font-medium mb-1.5">行程节奏</label>
          <div className="flex gap-2">
            {(Object.keys(PACE_LABELS) as Pace[]).map((p) => (
              <Pill key={p} active={form.pace === p} onClick={() => set('pace', p)}>
                {PACE_LABELS[p]}
              </Pill>
            ))}
          </div>
        </div>

        {/* 主题 */}
        <div>
          <label className="block text-sm font-medium mb-1.5">兴趣主题（多选）</label>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(THEME_LABELS) as Theme[]).map((t) => (
              <Pill
                key={t}
                active={form.themes.includes(t)}
                onClick={() => toggleTheme(t)}
              >
                {THEME_LABELS[t]}
              </Pill>
            ))}
          </div>
        </div>

        {/* 人数 + 备注 */}
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">人数</label>
            <input
              type="number"
              min={1}
              max={20}
              value={form.travelers ?? 2}
              onChange={(e) =>
                set('travelers', Math.max(1, Math.min(20, Number(e.target.value) || 1)))
              }
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="col-span-3">
            <label className="block text-sm font-medium mb-1.5">补充说明（可选）</label>
            <input
              value={form.extraNotes ?? ''}
              onChange={(e) => set('extraNotes', e.target.value)}
              placeholder="如：带 3 岁小孩、不吃辣、想看雪山"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>
        )}

        <button
          onClick={submit}
          disabled={generating}
          className="w-full py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors"
        >
          {generating ? '规划中…' : '✨ 生成行程规划'}
        </button>

        {generating && (
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
            <p className="text-sm text-blue-700 font-medium flex items-center gap-2">
              <span className="inline-block w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              {statusText || '正在生成…'}
            </p>
            {streamText && (
              <pre className="mt-2 text-xs text-slate-500 whitespace-pre-wrap max-h-24 overflow-hidden">
                …{streamText}
              </pre>
            )}
          </div>
        )}
      </div>

      {/* 历史行程 */}
      {history.length > 0 && !generating && (
        <div className="mt-8">
          <h2 className="text-sm font-medium text-slate-500 mb-3">最近行程</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {history.slice(0, 6).map((h) => (
              <div
                key={h.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  // 恢复 request 与 plan，否则「修改行程」因缺 request 无响应
                  useAppStore.setState({ request: h.request })
                  setPlan(h.plan)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    useAppStore.setState({ request: h.request })
                    setPlan(h.plan)
                  }
                }}
                className="relative text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer"
              >
                <p className="font-medium text-sm pr-6">{h.title}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {h.request.destination} · {h.request.days} 天 ·{' '}
                  {new Date(h.createdAt).toLocaleDateString('zh-CN')}
                </p>
                {/* 删除按钮：不能嵌在卡片按钮里（HTML 禁止按钮嵌套），改为独立按钮 */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (confirm(`删除行程「${h.title}」？`)) removeFromHistory(h.id)
                  }}
                  aria-label={`删除行程 ${h.title}`}
                  title="删除"
                  className="no-print absolute top-2 right-2 w-6 h-6 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors text-base leading-none"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 未配置提示：既无 Key 又无公共代理时才提示 */}
      {!llm.apiKey && !useAppStore.getState().demoProxyUrl && (
        <p className="text-center text-sm text-amber-600 mt-4">
          尚未配置模型 —— 点击右上角「设置」，填写 API Key 或启用公共演示模式
        </p>
      )}
    </div>
  )
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3.5 py-1.5 rounded-full border text-sm transition-colors ${
        active
          ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
      }`}
    >
      {children}
    </button>
  )
}

function SuggestionList({
  items,
  onPick,
}: {
  items: Suggestion[]
  onPick: (s: Suggestion) => void
}) {
  if (items.length === 0) return null
  return (
    <ul className="no-print absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
      {items.map((s, i) => (
        <li key={`${s.kind}-${s.label}-${i}`}>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(s)}
            className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors"
          >
            <span className="text-sm font-medium">{s.label}</span>
            <span className="block text-xs text-slate-400 truncate">{s.sub}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
