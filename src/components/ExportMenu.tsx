import { useState } from 'react'
import type { ItineraryPlan } from '../types'
import { downloadText, planToMarkdown } from '../services/markdown'
import { shareUrl } from '../services/share'
import { shortenUrl } from '../services/shortlink'
import { useAppStore } from '../store'

export default function ExportMenu({ plan }: { plan: ItineraryPlan }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const request = useAppStore((s) => s.request)

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
    if (url.length > 8000) {
      await copy(planToMarkdown(plan), 'Markdown')
      alert('行程内容较长，已改为复制 Markdown 文本')
      setOpen(false)
      return
    }
    // 优先生成短链（自有 Worker）；不可用时降级为长链并明确告知
    const short = await shortenUrl(url)
    if (short) {
      await copy(short, '短链接')
    } else {
      await copy(url, '链接')
      alert('短链接服务不可用（未部署演示 Worker 或生成超时），已复制长链接')
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
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="px-3.5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
      >
        导出 / 分享
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
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
        </>
      )}
    </div>
  )
}
