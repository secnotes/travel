import { useRef, useState } from 'react'
import { useAppStore } from '../store'
import { refinePlan } from '../services/planner'
import { LLMError } from '../llm/client'

const QUICK_PROMPTS = [
  '第二天太累了，减少一个景点',
  '增加更多本地美食推荐',
  '预算再压一压，去掉门票贵的项目',
  '带老人小孩，节奏放慢一点',
]

export default function ChatPanel() {
  const llm = useAppStore((s) => s.llm)
  const plan = useAppStore((s) => s.plan)
  const request = useAppStore((s) => s.request)
  const chat = useAppStore((s) => s.chat)
  const generating = useAppStore((s) => s.generating)
  const appendChat = useAppStore((s) => s.appendChat)
  const setPlan = useAppStore((s) => s.setPlan)
  const setError = useAppStore((s) => s.setError)
  const saveToHistory = useAppStore((s) => s.saveToHistory)
  const setStatus = useAppStore((s) => s.setStatus)

  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  async function send(text: string) {
    const feedback = text.trim()
    if (!feedback || !plan || !request || generating) return
    setInput('')
    appendChat({ role: 'user', content: feedback })
    useAppStore.setState({ generating: true, error: null, statusText: '正在调整行程…' })
    try {
      const newPlan = await refinePlan(llm, request, plan, feedback, {
        onStatus: setStatus,
      })
      setPlan(newPlan, '已按你的意见更新行程 ✅')
      saveToHistory(request, newPlan)
    } catch (e) {
      const msg = e instanceof LLMError ? e.message : (e as Error).message
      setError(`修改失败：${msg}`)
    }
  }

  if (!plan) return null

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
      <h3 className="font-bold text-sm text-slate-700 px-4 py-2.5 border-b border-slate-100">
        💬 修改行程
      </h3>

      <div
        ref={listRef}
        className="flex-1 overflow-y-auto max-h-56 px-4 py-3 space-y-2.5"
      >
        {chat.length === 0 && (
          <div className="flex flex-wrap gap-1.5">
            {QUICK_PROMPTS.map((q) => (
              <button
                key={q}
                onClick={() => send(q)}
                disabled={generating}
                className="text-xs px-2.5 py-1 rounded-full border border-slate-200 text-slate-500 hover:border-blue-300 hover:text-blue-600 disabled:opacity-50 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        )}
        {chat.map((m, i) => (
          <div
            key={i}
            className={`text-sm ${m.role === 'user' ? 'text-right' : ''}`}
          >
            <span
              className={`inline-block max-w-[85%] rounded-xl px-3 py-1.5 ${
                m.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              {m.content}
            </span>
          </div>
        ))}
        {generating && (
          <p className="text-xs text-slate-400 animate-pulse">
            {useAppStore.getState().statusText || '思考中…'}
          </p>
        )}
      </div>

      <div className="p-3 border-t border-slate-100 flex gap-2">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) send(input)
          }}
          placeholder="告诉 AI 你想怎么改…"
          disabled={generating}
          className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50"
        />
        <button
          onClick={() => send(input)}
          disabled={generating || !input.trim()}
          className="px-4 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          发送
        </button>
      </div>
    </div>
  )
}
