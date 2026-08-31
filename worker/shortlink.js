/**
 * 悠行 · 短链接服务（Worker 模块，由 llm-proxy.js 导入）
 *
 * 路由：
 *   POST /s        创建短链接（body: {"url": 长链}，需已通过来源校验）
 *   GET  /s/<id>   302 跳转到长链（浏览器地址栏直接访问，无 Origin 头）
 *
 * 依赖环境：
 *   SHORTLINKS     KV 命名空间绑定（可选：未绑定或绑错类型时返回明确错误，
 *                  不影响 LLM 代理等其他功能）
 *   ALLOWED_ORIGIN 允许的站点域名（短链只允许缩短本站链接，防开放短链滥用）
 */

const ID_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/** 随机短链 id（62^6 ≈ 568 亿组合，个人站点碰撞概率可忽略） */
function randomId(len = 6) {
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  let id = ''
  for (const b of bytes) id += ID_ALPHABET[b % ID_ALPHABET.length]
  return id
}

/** 创建短链接：POST /s {"url": ...} -> {"short": ".../s/<id>"} */
export async function createShort(req, env, corsHeaders) {
  const headers = { 'Content-Type': 'application/json', ...corsHeaders }
  const fail = (error, status) =>
    new Response(JSON.stringify({ error }), { status, headers })

  if (
    !env.SHORTLINKS ||
    typeof env.SHORTLINKS.get !== 'function' ||
    typeof env.SHORTLINKS.put !== 'function'
  ) {
    return fail(
      '短链服务未配置：请在 Worker -> Settings -> Variables -> KV Namespace Bindings 中绑定 SHORTLINKS（注意必须是 KV 命名空间绑定，不是普通文本变量）',
      500,
    )
  }
  if (!env.ALLOWED_ORIGIN) {
    return fail('短链服务需要配置 ALLOWED_ORIGIN', 500)
  }

  let payload
  try {
    payload = await req.json()
  } catch {
    return fail('请求体不是合法 JSON', 400)
  }
  const target = payload && payload.url
  if (typeof target !== 'string' || !/^https?:\/\//i.test(target)) {
    return fail('缺少合法的 url 字段', 400)
  }
  // 只允许缩短本站链接：防止 Worker 被当作开放短链服务滥用（钓鱼短链等）
  if (!target.startsWith(env.ALLOWED_ORIGIN)) {
    return fail('仅允许缩短本站（ALLOWED_ORIGIN）的链接', 400)
  }
  if (target.length > 65536) {
    return fail('链接过长', 400)
  }

  // 随机 id，极小概率碰撞时换一个重试；KV 读写异常也在此兜底，
  // 避免未处理异常导致运行时裸 500（无 CORS 头，前端只能看到含混报错）
  let id = ''
  try {
    for (let i = 0; i < 3; i++) {
      const candidate = randomId()
      if (!(await env.SHORTLINKS.get(candidate))) {
        id = candidate
        break
      }
    }
    if (!id) return fail('短链 id 分配失败，请重试', 500)
    await env.SHORTLINKS.put(id, target)
  } catch (e) {
    return fail(`短链 KV 读写异常：${e && e.message ? e.message : e}`, 500)
  }

  const origin = new URL(req.url).origin
  return new Response(JSON.stringify({ short: `${origin}/s/${id}` }), {
    headers,
  })
}

/** 短链跳转：GET /s/<id> -> 302 到长链（Location 保留 #hash，行程可正常还原） */
export async function redirectShort(env, id) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    return new Response('Not Found', { status: 404 })
  }
  if (!env.SHORTLINKS || typeof env.SHORTLINKS.get !== 'function') {
    return new Response('短链服务未配置', { status: 500 })
  }
  const target = await env.SHORTLINKS.get(id)
  if (!target) {
    return new Response('短链接不存在或已失效', { status: 404 })
  }
  try {
    return Response.redirect(target, 302)
  } catch {
    return new Response('短链接目标无效', { status: 404 })
  }
}
