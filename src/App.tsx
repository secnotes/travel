import { useEffect, useLayoutEffect, useState } from 'react'
import { useAppStore } from './store'
import { applyTheme } from './services/theme'
import {
  planFromLocation,
  discoverFromLocation,
  clearShareHash,
  requestFromPlan,
} from './services/share'
import PlanForm from './components/PlanForm'
import DiscoverPanel from './components/DiscoverPanel'
import ItineraryView from './components/ItineraryView'
import SettingsDialog from './components/SettingsDialog'
import MobileActions from './components/MobileActions'

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const tab = useAppStore((s) => s.tab)
  const setTab = useAppStore((s) => s.setTab)
  const plan = useAppStore((s) => s.plan)
  const setPlan = useAppStore((s) => s.setPlan)
  const llm = useAppStore((s) => s.llm)
  const reset = useAppStore((s) => s.reset)
  const dark = useAppStore((s) => s.dark)
  const toggleTheme = useAppStore((s) => s.toggleTheme)
  const demoProxyUrl = useAppStore((s) => s.demoProxyUrl)
  const configured = Boolean(llm.apiKey) || Boolean(demoProxyUrl)

  // 打开分享链接：从 URL hash 恢复行程或目的地推荐
  useEffect(() => {
    let active = true
    ;(async () => {
      const shared = await planFromLocation()
      if (active && shared) {
        // 分享链接不含原始请求：合成最小 request，保证「修改行程」与再次分享可用。
        // 先清 hash 再 setPlan：setPlan 会 pushState 捕获当前 URL，
        // 顺序反了会把带 hash 的 URL 压进历史，回退时 hash 又会冒出来
        clearShareHash()
        useAppStore.setState({ request: requestFromPlan(shared) })
        setPlan(shared)
        return
      }
      const discover = await discoverFromLocation()
      if (active && discover) {
        const s = useAppStore.getState()
        s.updateDiscoverForm(discover.f)
        s.finishDiscover(discover.r)
        s.setTab('discover')
        clearShareHash()
      }
    })()
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 绘制前应用主题，避免夜间模式闪白
  useLayoutEffect(() => {
    applyTheme(dark)
  }, [dark])

  // 浏览器回退：从行程视图回到表单（进入行程时 store.setPlan 已 pushState）。
  // 用户按回退是明确意图，不弹"放弃行程"确认。
  useEffect(() => {
    const onPopState = () => {
      const s = useAppStore.getState()
      if (s.plan && history.state?.yxView !== 'plan') {
        useAppStore.setState({
          request: null,
          plan: null,
          chat: [],
          generating: false,
          statusText: '',
          streamText: '',
          error: null,
        })
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const tabs: { id: 'plan' | 'discover'; label: string }[] = [
    { id: 'plan', label: '行程规划' },
    { id: 'discover', label: '目的地发现' },
  ]

  return (
    <div className="min-h-screen flex flex-col">
      <header className="no-print sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-4">
          <div className="flex items-center gap-2 font-bold text-lg text-blue-700 shrink-0">
            <span className="text-2xl">🧭</span>悠行
          </div>
          {/* 标签页窄屏收进悬浮菜单 */}
          <nav className="hidden sm:flex gap-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  tab === t.id
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="flex-1" />

          {/* 桌面端操作区（窄屏收进右下角悬浮按钮） */}
          <div className="hidden sm:flex items-center gap-2">
            {plan && (
              <button
                onClick={() => {
                  if (confirm('放弃当前行程并重新开始？')) reset()
                }}
                className="text-sm text-slate-500 hover:text-slate-800 whitespace-nowrap"
              >
                新建行程
              </button>
            )}
            <button
              onClick={toggleTheme}
              title={dark ? '切换日间模式' : '切换夜间模式'}
              aria-label="切换主题"
              className="w-9 h-9 rounded-lg border border-slate-200 text-base hover:bg-slate-50 transition-colors"
            >
              {dark ? '☀️' : '🌙'}
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              className={`text-sm px-3 h-9 rounded-lg border transition-colors whitespace-nowrap ${
                configured
                  ? 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  : 'border-amber-300 bg-amber-50 text-amber-700 font-medium'
              }`}
            >
              ⚙️ {configured ? '设置' : '配置模型'}
            </button>
          </div>

          {/* 窄屏右上角操作区（等大双按钮 + 下拉菜单） */}
          <MobileActions onOpenSettings={() => setSettingsOpen(true)} />
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">
        {tab === 'plan' ? (
          plan ? <ItineraryView /> : <PlanForm />
        ) : (
          <DiscoverPanel />
        )}
      </main>

      <footer className="no-print py-6 px-4 text-center text-xs text-slate-400 space-y-1.5">
        <p className="flex items-center justify-center gap-2">
          © 2026{' '}
          <a
            href="https://secnotes.github.io/"
            target="_blank"
            rel="noreferrer"
            className="hover:underline"
          >
            Security Notes
          </a>
          <span>|</span>
          <a
            href="https://github.com/secnotes/travel"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 hover:underline"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.938 9.9 9.207 11.387.68.113.893-.261.893-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.218.694.825.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            Star on GitHub
          </a>
        </p>
        <p>悠行 · AI 旅行规划 - 数据仅存本地浏览器，行程由 LLM 结合本地景点数据生成</p>
      </footer>

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
