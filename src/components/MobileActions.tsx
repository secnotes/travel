import { useState } from 'react'
import { useAppStore } from '../store'

interface MenuItem {
  icon: string
  label: string
  active?: boolean
  onClick: () => void
}

/**
 * 窄屏（< 640px）header 右上角操作区：
 * - 主题切换：独立按钮，点击直接切换
 * - 菜单按钮：展开导航下拉（行程规划 / 目的地发现 / 新建行程 / 设置）
 * 两个按钮等大（40px 圆形）。
 */
export default function MobileActions({ onOpenSettings }: { onOpenSettings: () => void }) {
  const [open, setOpen] = useState(false)
  const tab = useAppStore((s) => s.tab)
  const setTab = useAppStore((s) => s.setTab)
  const plan = useAppStore((s) => s.plan)
  const reset = useAppStore((s) => s.reset)
  const dark = useAppStore((s) => s.dark)
  const toggleTheme = useAppStore((s) => s.toggleTheme)

  const items: MenuItem[] = [
    {
      icon: '🗺️',
      label: '行程规划',
      active: tab === 'plan',
      onClick: () => setTab('plan'),
    },
    {
      icon: '🌤️',
      label: '目的地发现',
      active: tab === 'discover',
      onClick: () => setTab('discover'),
    },
    ...(plan
      ? [
          {
            icon: '➕',
            label: '新建行程',
            onClick: () => {
              if (confirm('放弃当前行程并重新开始？')) reset()
            },
          },
        ]
      : []),
    { icon: '⚙️', label: '设置', onClick: onOpenSettings },
  ]

  return (
    <div className="sm:hidden flex items-center gap-2">
      {/* 主题切换：独立按钮，点击直接切换 */}
      <button
        onClick={toggleTheme}
        aria-label={dark ? '切换日间模式' : '切换夜间模式'}
        className="w-10 h-10 rounded-full bg-white text-slate-700 shadow-md border border-slate-200 flex items-center justify-center text-lg active:scale-95 transition-transform"
      >
        {dark ? '☀️' : '🌙'}
      </button>

      {/* 菜单按钮 */}
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? '收起菜单' : '展开菜单'}
          className="w-10 h-10 rounded-full bg-blue-600 text-white shadow-md flex items-center justify-center text-xl active:scale-95 transition-transform"
        >
          {open ? '✕' : '⋯'}
        </button>

        {open && (
          <>
            {/* 点击空白处收起 */}
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-full mt-2 z-20 w-44 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5">
              {items.map((item) => (
                <button
                  key={item.label}
                  onClick={() => {
                    item.onClick()
                    setOpen(false)
                  }}
                  className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2.5 transition-colors ${
                    item.active
                      ? 'text-blue-700 bg-blue-50 font-medium'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span>{item.icon}</span>
                  {item.label}
                  {item.active && <span className="ml-auto text-xs">✓</span>}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
