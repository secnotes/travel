/**
 * 悠行 · LLM 代理 Worker（入口）
 *
 * 作用：把浏览器请求转发到 OpenAI 兼容的模型服务商，注入 API Key，
 * 让访客无需自配 Key 即可使用（公共演示模式）。
 *
 * 路由：
 *   GET  /s/<id>   短链接 302 跳转（实现在 shortlink.js）
 *   POST /s        创建短链接（实现在 shortlink.js）
 *   其他 POST      LLM 代理（注入 Key 转发到模型服务商）
 *
 * 部署后配置环境变量（Workers -> Settings -> Variables）：
 *   LLM_BASE_URL   如 https://api.deepseek.com/v1
 *   LLM_API_KEY    你的 Key（标记为 Secret）
 *   LLM_MODEL      如 deepseek-chat
 *   ALLOWED_ORIGIN 你的 Pages 域名，如 https://用户名.github.io
 *
 * 前端调用 LLM 代理：POST https://<worker>.workers.dev/llm-proxy
 *   - 浏览器无需带 Authorization（Key 在 Worker 侧注入）
 *   - Worker 校验 Origin 必须为 ALLOWED_ORIGIN，防止被他人蹭用
 *
 * 本文件为纯 JavaScript（无类型标注），可直接粘贴进 Cloudflare
 * 网页编辑器（Edit code）部署，wrangler 命令行同样支持。
 * 注意：短链功能在同目录 shortlink.js 中，网页部署时需两个文件一起粘贴。
 */

import { createShort, redirectShort } from './shortlink.js'

function endpoint(baseURL) {
  const base = baseURL.replace(/\/+$/, '')
  return base.endsWith('/chat/completions')
    ? base
    : `${base}/chat/completions`
}

export default {
  async fetch(req, env) {
    const path = new URL(req.url).pathname

    // 短链跳转：浏览器地址栏直接访问（无 Origin 头），必须在来源校验之前处理。
    // HEAD 一并放行：部分聊天应用的链接预览爬虫用 HEAD 探测，若掉进来源校验会 403
    if (
      (req.method === 'GET' || req.method === 'HEAD') &&
      path.startsWith('/s/')
    ) {
      return redirectShort(env, path.slice(3))
    }

    const corsHeaders = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    }

    // 预检
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    // 来源校验：只允许配置的域名调用
    const origin = req.headers.get('Origin') ?? ''
    if (env.ALLOWED_ORIGIN && origin !== env.ALLOWED_ORIGIN) {
      return new Response(JSON.stringify({ error: '来源不在允许列表' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    // 创建短链
    if (req.method === 'POST' && path === '/s') {
      return createShort(req, env, corsHeaders)
    }

    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: '仅支持 POST' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    // 检查环境变量
    if (!env.LLM_BASE_URL || !env.LLM_API_KEY || !env.LLM_MODEL) {
      return new Response(
        JSON.stringify({ error: 'Worker 环境变量未配置完整（LLM_BASE_URL / LLM_API_KEY / LLM_MODEL）' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    try {
      const body = await req.text()
      // 注入 model（访客发的请求里可能没有或带占位），覆盖为环境变量配置的模型
      let payload
      try {
        payload = JSON.parse(body)
      } catch {
        return new Response(JSON.stringify({ error: '请求体不是合法 JSON' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        })
      }
      payload.model = env.LLM_MODEL
      payload.stream = true

      const upstream = await fetch(endpoint(env.LLM_BASE_URL), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.LLM_API_KEY}`,
        },
        body: JSON.stringify(payload),
      })

      // 透传响应（含 SSE 流式）
      const respHeaders = new Headers(corsHeaders)
      const ct = upstream.headers.get('content-type')
      if (ct) respHeaders.set('Content-Type', ct)
      return new Response(upstream.body, {
        status: upstream.status,
        headers: respHeaders,
      })
    } catch (e) {
      return new Response(
        JSON.stringify({ error: `上游请求失败：${e && e.message ? e.message : e}` }),
        { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
  },
}
