import { useAppStore } from '../store'
import type { ShortlinkProvider } from '../types'

/**
 * 短链接服务：支持多个服务商，在「设置 -> 高级选项」中切换。
 *
 *   worker  自有 Cloudflare Worker（推荐）：与演示代理同域名，可达性与站点一致。
 *           POST /s {"url"} -> {"short"}，详见 worker/llm-proxy.js 与 docs/shortlinks.md
 *   tinyurl TinyURL 官方免 Key 接口：GET api-create.php，响应体为短链纯文本
 *   isgd    is.gd 免 Key 接口：GET create.php?format=json
 *
 * 所有失败路径（未配置、网络、超时、CORS 拦截、返回格式异常）统一返回 null，
 * 调用方降级为长链接。
 */

export const SHORTLINK_PROVIDERS: {
  id: ShortlinkProvider
  name: string
  note: string
}[] = [
  {
    id: 'worker',
    name: '自有 Worker（推荐）',
    note: '需部署演示 Worker 并绑定 KV；短链与站点可达性一致，数据不经过第三方',
  },
  {
    id: 'tinyurl',
    name: 'TinyURL',
    note: '免注册免 Key；国际服务，大陆访问可能不稳定',
  },
  {
    id: 'isgd',
    name: 'is.gd',
    note: '免注册免 Key；国际服务，大陆访问可能不稳定',
  },
]

const SHORTEN_TIMEOUT_MS = 5000

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SHORTEN_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** 自有 Worker：POST {origin}/s */
async function shortenWithWorker(longUrl: string): Promise<string | null> {
  const proxyUrl = useAppStore.getState().demoProxyUrl
  if (!proxyUrl) return null
  let base: URL
  try {
    base = new URL(proxyUrl)
  } catch {
    return null
  }
  try {
    const res = await fetchWithTimeout(`${base.origin}/s`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: longUrl }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { short?: unknown }
    return typeof data.short === 'string' && /^https?:\/\//.test(data.short)
      ? data.short
      : null
  } catch {
    return null
  }
}

/** TinyURL：GET api-create.php，响应体为短链纯文本 */
async function shortenWithTinyurl(longUrl: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(
      `https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`,
    )
    if (!res.ok) return null
    const text = (await res.text()).trim()
    return /^https?:\/\//.test(text) ? text : null
  } catch {
    return null
  }
}

/** is.gd：GET create.php?format=json */
async function shortenWithIsgd(longUrl: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(
      `https://is.gd/create.php?format=json&url=${encodeURIComponent(longUrl)}`,
    )
    if (!res.ok) return null
    const data = (await res.json()) as { shorturl?: unknown }
    return typeof data.shorturl === 'string' && /^https?:\/\//.test(data.shorturl)
      ? data.shorturl
      : null
  } catch {
    return null
  }
}

const PROVIDERS: Record<ShortlinkProvider, (url: string) => Promise<string | null>> = {
  worker: shortenWithWorker,
  tinyurl: shortenWithTinyurl,
  isgd: shortenWithIsgd,
}

/** 按当前设置生成短链接；失败返回 null，调用方降级为长链接 */
export async function shortenUrl(longUrl: string): Promise<string | null> {
  const provider = useAppStore.getState().shortlinkProvider ?? 'worker'
  return (PROVIDERS[provider] ?? shortenWithWorker)(longUrl)
}
