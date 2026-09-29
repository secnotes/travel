import { useEffect, useRef, useState } from 'react'
import type { ItineraryPlan } from '../types'
import { downloadText, planToMarkdown } from '../services/markdown'
import { shareUrl } from '../services/share'
import { shortenUrl } from '../services/shortlink'
import { useAppStore } from '../store'

/** 手机端头部图标按钮：弯箭头（分享/转发）图标 */
function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden>
      <path d="M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11z" />
    </svg>
  )
}

export default function ExportMenu({
  plan,
  variant = 'button',
}: {
  plan: ItineraryPlan
  /** button = 行程卡片内的文字按钮（sm+ 屏）；icon = 头部圆形图标按钮（手机端） */
  variant?: 'button' | 'icon'
}) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const request = useAppStore((s) => s.request)
  const rootRef = useRef<HTMLDivElement>(null)

  // 点击组件外部时收起菜单（ref + 文档级监听，与 MobileActions 同一方式）。
  // 不用 fixed 全屏遮罩：菜单挂在 header（backdrop-blur）内时，遮罩会被
  // backdrop-blur 的 containing block 限制在 header 矩形里，
  // 点页面其他区域收不到关闭事件。
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(label)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      /* 剪贴板不可用时静默 */
    }
  }

  function exportMarkdown() {
    const md = planToMarkdown(plan, request ?? undefined)
    const name = `${plan.title.replace(/[\\/:*?"<>|]/g, '')}.md`
    downloadText(name, md)
    setOpen(false)
  }

  function printPdf() {
    setOpen(false)
    // 展开所有内容后调用浏览器打印（用户可选"另存为 PDF"）
    setTimeout(() => window.print(), 100)
  }

  async function copyShareLink() {
    const url = shareUrl(plan, request?.startDate)
    // URL 过长时降级为复制 Markdown
    if (url.length > 8000) {
      await copy(planToMarkdown(plan), 'Markdown')
      alert('行程内容较长，已改为复制 Markdown 文本')
    } else {
      await copy(url, '链接')
    }
    setOpen(false)
  }

  async function copyShareShortLink() {
    const url = shareUrl(plan, request?.startDate)
    // 长链恰恰是用户最需要缩短的场景，不应按长度预先放弃。
    // 直接尝试生成短链：worker 走 POST body 无 URL 长度限制；
    // 第三方 GET 服务超长被拒时 shortenUrl 已会返回 null，统一在此降级。
    const short = await shortenUrl(url)
    if (short) {
      await copy(short, '短链接')
    } else {
      // 短链不可用：超长链接在聊天软件中会被截断，降级为 Markdown 文本更实用
      if (url.length > 8000) {
        await copy(planToMarkdown(plan), 'Markdown')
        alert('短链接服务不可用且行程内容较长，已改为复制 Markdown 文本')
      } else {
        await copy(url, '链接')
        alert('短链接服务不可用（未部署演示 Worker 或生成超时），已复制长链接')
      }
    }
    setOpen(false)
  }

  const items = [
    { icon: '📄', label: '导出 Markdown', action: exportMarkdown },
    { icon: '🖨️', label: '打印 / 存为 PDF', action: printPdf },
    { icon: '🔗', label: copied === '链接' ? '已复制链接 ✓' : '复制分享链接', action: copyShareLink },
    {
      icon: '✂️',
      label: copied === '短链接' ? '已复制短链 ✓' : '复制分享短链接',
      action: copyShareShortLink,
    },
    {
      icon: '📋',
      label: copied === 'Markdown' ? '已复制 ✓' : '复制行程文案',
      action: async () => {
        await copy(planToMarkdown(plan, request ?? undefined), 'Markdown')
        setOpen(false)
      },
    },
  ]

  return (
    <div className="relative" ref={rootRef}>
      {variant === 'icon' ? (
        <button
          onClick={() => setOpen(!open)}
          aria-label="导出或分享行程"
          title="导出 / 分享"
          className="w-10 h-10 rounded-full bg-white text-slate-700 shadow-md border border-slate-200 flex items-center justify-center active:scale-95 transition-transform"
        >
          <ShareIcon />
        </button>
      ) : (
        <button
          onClick={() => setOpen(!open)}
          className="px-3.5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          导出 / 分享
        </button>
      )}
      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 w-44 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5">
          {items.map((item) => (
            <button
              key={item.label}
              onClick={item.action}
              className="w-full text-left px-4 py-2 text-sm hover:bg-blue-50 transition-colors flex items-center gap-2"
            >
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
