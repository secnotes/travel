import { useRef, useState } from 'react'
import { useAppStore } from '../store'
import { PROVIDER_PRESETS, getPreset } from '../llm/presets'
import { chatCompletion } from '../llm/client'

export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const llm = useAppStore((s) => s.llm)
  const setLLM = useAppStore((s) => s.setLLM)
  const demoProxyUrl = useAppStore((s) => s.demoProxyUrl)
  const setDemoProxyUrl = useAppStore((s) => s.setDemoProxyUrl)
  const [draft, setDraft] = useState(llm)
  const [demoDraft, setDemoDraft] = useState(demoProxyUrl)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)

  // 记住本会话内每个服务商的 baseURL/model：
  // 切走时快照、切回时还原，避免"自定义/中转"配置被预设值覆盖
  const remembered = useRef(new Map<string, { baseURL: string; model: string }>())

  const preset = getPreset(draft.provider)

  function switchProvider(id: string) {
    if (id === draft.provider) return
    // 快照当前服务商的配置（含未保存的修改）
    remembered.current.set(draft.provider, {
      baseURL: draft.baseURL,
      model: draft.model,
    })
    // 切回过的服务商还原其配置；首次点击的预设用默认值
    const memo = remembered.current.get(id)
    const p = getPreset(id)
    setDraft({
      ...draft,
      provider: id,
      baseURL: memo?.baseURL ?? p?.baseURL ?? '',
      model: memo?.model ?? p?.defaultModel ?? '',
    })
  }

  async function testConnection() {
    setTesting(true)
    setTestResult(null)
    // 测试用草稿中的演示代理地址（不影响已保存的设置）
    const prevDemo = useAppStore.getState().demoProxyUrl
    useAppStore.getState().setDemoProxyUrl(demoDraft.trim())
    try {
      const reply = await chatCompletion(draft, [
        { role: 'user', content: '回复"连接成功"四个字' },
      ])
      setTestResult(`✅ 连接成功：${reply.trim().slice(0, 50)}`)
    } catch (e) {
      setTestResult(`❌ ${(e as Error).message}`)
    } finally {
      useAppStore.getState().setDemoProxyUrl(prevDemo)
      setTesting(false)
    }
  }

  function save() {
    if (!draft.apiKey.trim() && draft.provider !== 'custom') {
      if (!confirm('API Key 为空，保存后仍无法生成行程。确定保存？')) return
    }
    setLLM(draft)
    setDemoProxyUrl(demoDraft.trim())
    onClose()
  }

  return (
    <div className="no-print fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">模型设置</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl">
            ×
          </button>
        </div>

        <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3">
          {draft.apiKey
            ? '已配置自己的 Key：请求用你的 Key 直连服务商（Key 只存你浏览器）。清空 Key 可回到公共演示模式。'
            : '当前为公共演示模式：无需自配 Key，请求经公共代理转发（受来源域名限制，由站长额度承担）。如需更稳定/更高频使用，请填写自己的 Key。'}
        </p>

        {/* 高级选项：公共演示代理（普通用户无需关心，站长调试用） */}
        <div className="border border-slate-200 rounded-lg">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg"
          >
            <span>高级选项</span>
            <span className="text-xs text-slate-400">{showAdvanced ? '收起 ▲' : '展开 ▼'}</span>
          </button>
          {showAdvanced && (
            <div className="px-3 pb-3 pt-1 space-y-2">
              <label className="block text-sm font-medium">🚀 公共演示模式代理地址</label>
              <input
                value={demoDraft}
                onChange={(e) => setDemoDraft(e.target.value)}
                placeholder="https://youxing-llm-proxy.你的子域.workers.dev/llm-proxy"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-slate-400">
                一般无需填写（构建时已注入默认地址）。未配 Key 且此处有地址时走公共代理；配了 Key 时始终优先用你自己的。
                此处修改为会话级覆盖，刷新页面后恢复默认，仅供临时调试。
              </p>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">服务商</label>
          <div className="grid grid-cols-3 gap-2">
            {PROVIDER_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => switchProvider(p.id)}
                className={`px-2 py-2 rounded-lg border text-sm transition-colors ${
                  draft.provider === p.id
                    ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
          {preset?.note && <p className="text-xs text-slate-500 mt-1.5">{preset.note}</p>}
        </div>

        {preset?.url && (
          <p className="text-xs">
            获取 API Key：
            <a
              href={preset.url}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 underline"
            >
              {preset.url}
            </a>
          </p>
        )}

        <div>
          <label className="block text-sm font-medium mb-1.5">API Base URL</label>
          <input
            value={draft.baseURL}
            onChange={(e) => setDraft({ ...draft, baseURL: e.target.value })}
            placeholder="https://api.deepseek.com/v1"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">API Key</label>
          <input
            type="password"
            value={draft.apiKey}
            onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
            placeholder="sk-..."
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">模型</label>
          {preset && preset.models.length > 0 ? (
            <div className="flex flex-wrap gap-2 mb-2">
              {preset.models.map((m) => (
                <button
                  key={m}
                  onClick={() => setDraft({ ...draft, model: m })}
                  className={`px-2.5 py-1 rounded-full border text-xs transition-colors ${
                    draft.model === m
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          ) : null}
          <input
            value={draft.model}
            onChange={(e) => setDraft({ ...draft, model: e.target.value })}
            placeholder="模型名"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">
            温度（创造性）：{draft.temperature?.toFixed(1) ?? '0.7'}
          </label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.1}
            value={draft.temperature ?? 0.7}
            onChange={(e) => setDraft({ ...draft, temperature: Number(e.target.value) })}
            className="w-full"
          />
        </div>

        {testResult && (
          <p
            className={`text-sm rounded-lg p-3 ${
              testResult.startsWith('✅')
                ? 'bg-green-50 text-green-700'
                : 'bg-red-50 text-red-700'
            }`}
          >
            {testResult}
          </p>
        )}

        <div className="flex gap-2">
          <button
            onClick={testConnection}
            disabled={testing}
            className="flex-1 py-2.5 rounded-lg border border-slate-300 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            {testing ? '测试中…' : '测试连接'}
          </button>
          <button
            onClick={save}
            className="flex-1 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
