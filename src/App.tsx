import { useEffect, useLayoutEffect, useState } from 'react'
import { useAppStore } from './store'
import { applyTheme } from './services/theme'
import {
  planFromLocation,
  discoverFromLocation,
  clearShareHash,
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
        setPlan(shared)
        clearShareHash()
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
              className={`text-sm px-3 py-1.5 rounded-lg border transition-colors whitespace-nowrap ${
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

      <footer className="no-print py-6 text-center text-xs text-slate-400">
        悠行 · AI 旅行规划 - 数据仅存本地浏览器，行程由 LLM 结合本地景点数据生成
      </footer>

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
