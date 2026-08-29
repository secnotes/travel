import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * 开发期 LLM 代理：浏览器 -> Vite 服务器 -> 模型服务商。
 * 服务端转发没有 CORS 限制，因此不支持浏览器直连的服务商
 * （如百度千帆）也能在本地开发时正常使用。
 * 真实目标地址通过 X-LLM-Target 请求头传入。
 */
function llmDevProxy(): Plugin {
  return {
    name: 'llm-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/llm-proxy', async (req, res) => {
        try {
          const target = req.headers['x-llm-target']
          if (typeof target !== 'string' || !/^https?:\/\//i.test(target)) {
            res.statusCode = 400
            res.end('缺少或非法的 x-llm-target 请求头')
            return
          }

          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk as Buffer)
          const body = Buffer.concat(chunks)

          const upstream = await fetch(target, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: String(req.headers['authorization'] ?? ''),
            },
            body,
          })

          res.statusCode = upstream.status
          const contentType = upstream.headers.get('content-type')
          if (contentType) res.setHeader('Content-Type', contentType)
          res.flushHeaders()

          if (!upstream.body) {
            res.end(await upstream.text())
            return
          }
          // 流式（SSE）逐块转发
          const reader = upstream.body.getReader()
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            res.write(value)
          }
          res.end()
        } catch (e) {
          res.statusCode = 502
          res.end(`代理转发失败：${(e as Error).message}`)
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), llmDevProxy()],
  // 相对路径：兼容 GitHub Pages 项目页（/repo/）与用户主页页（/）及自定义域名
  base: './',
})
