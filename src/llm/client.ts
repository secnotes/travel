import { useAppStore } from '../store'
import type { LLMSettings } from '../types'

export interface ChatMessageInput {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface StreamCallbacks {
  /** 增量文本 */
  onDelta?: (text: string) => void
  /** 完整结果 */
  onDone?: (fullText: string) => void
  onError?: (err: Error) => void
}

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message)
  }
}

function endpoint(baseURL: string): string {
  const base = baseURL.replace(/\/+$/, '')
  return base.endsWith('/chat/completions')
    ? base
    : `${base}/chat/completions`
}

/** 手机浏览器云加速/省流代理可能掐断长连接的提示（华为/UC/夸克等移动端常见） */
const MOBILE_PROXY_HINT =
  '。手机浏览器（华为/UC/夸克等）的省流或云加速模式可能中断长连接，可关闭该模式、换用 Chrome，或切换浏览器电脑模式后重试'

/** 开发模式走 Vite 本地代理；生产走浏览器直连或公共演示代理 */
const USE_DEV_PROXY = import.meta.env.DEV

/**
 * 调用 OpenAI 兼容 /chat/completions，SSE 流式返回。
 *
 * 优先级：
 *   1. 用户配了自己的 API Key -> 浏览器直连（或开发期 Vite 代理）服务商
 *   2. 未配 Key 但有公共演示代理地址 -> 走公共 Worker（Key 在 Worker 侧注入）
 *   3. 都没有 -> 报错引导配置
 */
export async function chatCompletion(
  settings: LLMSettings,
  messages: ChatMessageInput[],
  callbacks?: StreamCallbacks,
): Promise<string> {
  const demoProxyUrl = useAppStore.getState().demoProxyUrl
  const useDemo = !settings.apiKey && Boolean(demoProxyUrl)

  if (!settings.apiKey && !useDemo) {
    throw new LLMError('尚未配置 API Key，且未启用公共演示模式。请在「设置」中填写 Key 或联系站长开启公共代理')
  }
  // 公共演示模式不需要 baseURL/model（Worker 侧注入）；自配模式必须完整
  if (!useDemo && (!settings.baseURL || !settings.model)) {
    throw new LLMError('模型配置不完整，请检查 baseURL 与模型名')
  }

  const body = {
    model: settings.model,
    messages,
    temperature: settings.temperature ?? 0.7,
    stream: true,
  }

  // 决定请求地址与头
  let url: string
  let headers: Record<string, string>
  if (useDemo) {
    url = demoProxyUrl
    headers = { 'Content-Type': 'application/json' } // Key 在 Worker 侧注入，不带 Authorization
  } else if (USE_DEV_PROXY) {
    url = '/llm-proxy'
    const target = endpoint(settings.baseURL)
    headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
      'X-LLM-Target': target,
    }
  } else {
    url = endpoint(settings.baseURL)
    headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    }
  }

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
  } catch (e) {
    throw new LLMError(
      `无法连接模型服务（可能是网络问题或 CORS 限制）：${(e as Error).message}${MOBILE_PROXY_HINT}`,
    )
  }

  if (!res.ok) {
    let detail = ''
    try {
      const j = await res.json()
      detail = j?.error?.message ?? JSON.stringify(j)
    } catch {
      /* ignore */
    }
    if (res.status === 401) {
      throw new LLMError('API Key 无效或已过期（401）', 401)
    }
    if (res.status === 429) {
      throw new LLMError('请求过于频繁或额度不足（429）', 429)
    }
    throw new LLMError(`模型服务返回 ${res.status}：${detail}`, res.status)
  }

  if (!res.body) throw new LLMError('响应无内容')

  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let full = ''

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (payload === '[DONE]') {
          callbacks?.onDone?.(full)
          return full
        }
        try {
          const json = JSON.parse(payload)
          const delta: string | undefined =
            json?.choices?.[0]?.delta?.content ?? json?.choices?.[0]?.message?.content
          if (delta) {
            full += delta
            callbacks?.onDelta?.(delta)
          }
        } catch {
          /* 跳过无法解析的行（厂商心跳/注释行，以及 Worker 注入的 keepalive） */
        }
      }
    }
  } catch (e) {
    // 流中途断开（如手机浏览器云加速/省流代理掐断长连接）
    throw new LLMError(`网络连接中断：${(e as Error).message}${MOBILE_PROXY_HINT}`)
  }

  callbacks?.onDone?.(full)
  return full
}
