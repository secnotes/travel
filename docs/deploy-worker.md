# 启用公共演示模式（Cloudflare Worker）

默认情况下，访客需自配 API Key 才能使用。启用公共演示模式后，访客**打开链接即用**，无需任何配置——Key 由你部署的 Worker 注入，不暴露在前端。

> **面向大陆访客部署必读**：`*.workers.dev` 域名在中国大陆被阻断，不开代理无法直连。需给 Worker 绑定自定义域名，见[第五节](#五大陆访问受限给-worker-绑自定义域名重要)。

## 原理

```
访客浏览器（无 Key）
   │
   ▼  请求经公共 Worker 转发
Cloudflare Worker（注入你的 Key + 校验来源域名）
   │
   ▼
模型服务商（DeepSeek / 智谱 / ...）
```

- **Key 安全**：API Key 存在 Worker 的加密环境变量里，不进 GitHub 仓库、不进 Pages 的 JS 产物，访客无论如何都拿不到
- **防滥用**：Worker 校验请求的 `Origin` 必须等于你配置的站点域名，别人无法把你的 Worker 挂到他自己的站点白嫖你的额度
- **零成本**：Cloudflare Workers 免费额度（每天 10 万次请求）对个人 demo 足够

## 一、部署 Worker

`worker/` 目录已包含 Worker 代码（`llm-proxy.js`，纯 JavaScript）和配置（`wrangler.toml`）。部署有两种方式，任选其一。

### 方式 A：命令行（wrangler）

适合会频繁改 Worker 代码的人，后续更新一条命令搞定。

```bash
cd worker
npm i -g wrangler          # 没装过的话
wrangler login             # 浏览器授权一次
wrangler deploy            # 部署
```

部署成功后会输出一个地址，形如：

```
https://youxing-llm-proxy.<你的子域>.workers.dev
```

记住这个地址，后面要用。完整端点为 `<上面地址>/llm-proxy`。

### 方式 B：网页后台手动部署（无需安装任何工具）

适合只部署一次、不想装命令行工具的人。

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com) → 左侧 **Workers & Pages**
2. 点 **Create application**（或 Create Worker）→ **Create Worker**
3. 给 Worker 起个名字（如 `youxing-llm-proxy`，全小写字母数字连字符）→ 点 **Deploy**
4. 部署后会得到一个地址 `https://<你起的名字>.<你的子域>.workers.dev`，记下来
5. 回到该 Worker 详情页 → 点 **Edit code**（编辑代码）
6. 把编辑器里默认的代码**全部删除**，把本项目 `worker/llm-proxy.js` 的内容**完整粘贴**进去（纯 JavaScript，可直接粘贴，无需改写）
7. 点右上角 **Deploy** 保存发布

完整端点为 `<上面地址>/llm-proxy`。

> 两种方式结果完全一样，区别只是命令行 vs 网页操作。后续若要改 Worker 代码：方式 A 跑 `wrangler deploy`，方式 B 重复第 5-7 步重新粘贴。

## 二、配置环境变量

在 Cloudflare Dashboard → **Workers & Pages → youxing-llm-proxy → Settings → Variables** 添加 4 个变量：

| Name | Value | 是否加密 |
| --- | --- | --- |
| `LLM_BASE_URL` | 服务商 baseURL，如 `https://api.deepseek.com/v1` | 否 |
| `LLM_API_KEY` | 你的 API Key | **是（Encrypt，标记为 Secret）** |
| `LLM_MODEL` | 模型名，如 `deepseek-chat` | 否 |
| `ALLOWED_ORIGIN` | 你的 Pages 站点域名，如 `https://<用户名>.github.io` | 否 |

注意事项：
- **服务商不写死在代码里**：`LLM_BASE_URL` 填哪家就用哪家，可随时更换
- `ALLOWED_ORIGIN` 只看域名不看路径，项目页（`/仓库名/`）填到域名根即可
- `LLM_API_KEY` 一定要标记为 Secret 加密存储，否则会明文可见

## 三、让前端知道 Worker 地址

回到 GitHub 仓库，**Settings → Secrets and variables → Actions → Variables** 添加仓库变量：

| Name | Value |
| --- | --- |
| `VITE_DEMO_PROXY` | `https://youxing-llm-proxy.<你的子域>.workers.dev/llm-proxy` |

> 这是 Variables（变量）而非 Secrets（密钥），因为 Worker 地址本身不需要保密。
>
> **值必须以 `https://` 开头**。少了协议头会被浏览器当成相对路径，POST 打到你自己的 Pages 静态站点上（返回 405）。若目标访客在大陆，请改用第五节的自定义域名地址。

推一次代码或手动 Run workflow 重新构建 Pages，演示模式即生效。

## 四、验证

1. 用**无痕窗口**打开你的 Pages 地址（确保没有自己配过的 Key）
2. 直接生成行程——如果能正常出结果，说明演示模式工作正常
3. 在浏览器 F12 → Network 里看请求，应该发往 `<worker 地址>/llm-proxy`，且**不含 Authorization 头**（Key 在 Worker 侧注入）

## 五、大陆访问受限：给 Worker 绑自定义域名（重要）

`*.workers.dev` 域名在中国大陆被 DNS 污染 / SNI 阻断，**不开 VPN/代理无法直连**，表现为 `ERR_CONNECTION_TIMED_OUT`。

一个常见的迷惑现象：站长自己调试一切正常（403、500 等错误都能收到），是因为本机代理开着；而大陆访客没有梯子，请求连 Worker 的门都摸不到——公共演示模式对他们就是坏的。

判断方法：在**不开代理**的网络下执行：

```bash
curl -v https://youxing-llm-proxy.<你的子域>.workers.dev/
```

超时即命中此问题。

### 解决：给 Worker 绑定你自己的域名

自定义域名走 Cloudflare 边缘网络，通常可从大陆访问（免费版会把大陆流量路由到海外节点，能用但延迟偏高）。

**前提**：域名（如 `secnotes.cn`）的 DNS 托管在 Cloudflare。若目前还在注册商 / 国内 DNS：

1. 在 Cloudflare 添加站点，拿到分配的 nameserver
2. 到域名注册商把 NS 记录改成 Cloudflare 的
3. 原有 DNS 记录照搬到 Cloudflare；**指向 GitHub Pages 的记录保持「仅 DNS」（灰云）**，开橙云代理会导致 GitHub 证书校验失败

**绑定步骤**：

1. Cloudflare Dashboard → **Workers & Pages → 你的 Worker → Settings → Domains & Routes → Add → Custom domain**
2. 填一个子域名，如 `llm.secnotes.cn`（Cloudflare 会自动创建 DNS 记录与证书）
3. 仓库变量 `VITE_DEMO_PROXY` 改为 `https://llm.secnotes.cn/llm-proxy`，重新跑 Pages workflow
4. Worker 的 `ALLOWED_ORIGIN` 不变（仍填你的站点域名）

**验证**：在**不开代理**的网络下执行：

```bash
curl -v https://llm.secnotes.cn/llm-proxy \
  -H "Content-Type: application/json" \
  -H "Origin: https://secnotes.cn" \
  -d '{"messages":[{"role":"user","content":"回复：连接成功"}]}'
```

> 若自定义域名在大陆仍然时好时坏（Cloudflare 免费版不保证大陆可达性），备选方案是把 `worker/llm-proxy.js` 的逻辑部署到国内可直连的平台（腾讯云函数 / 阿里云函数计算），代码基本原样可用。

## 部署顺序提醒

务必按此顺序，否则 Origin 校验会失败：

1. **先**部署 Pages，拿到站点域名（`https://<用户名>.github.io/<仓库名>`）
2. **再**部署 Worker，`ALLOWED_ORIGIN` 填上面的域名
3. **最后**加 `VITE_DEMO_PROXY` 仓库变量，重新构建 Pages

## 运行时调整

部署后，访客仍可在「设置」里：

- 填自己的 Key → 自动切换为用自己的 Key 直连（不再走你的 Worker，不消耗你的额度）
- 修改演示代理地址 → 覆盖构建时注入的默认值

## 故障排查

| 现象 | 原因 / 处理 |
| --- | --- |
| 访客生成报 403 | `ALLOWED_ORIGIN` 和实际 Pages 域名不一致；注意 http/https、是否带路径 |
| 报"环境变量未配置" | Worker 的 4 个变量没配齐，或 `LLM_API_KEY` 为空 |
| 报 401 | `LLM_API_KEY` 无效或 `LLM_BASE_URL`/`LLM_MODEL` 不匹配该服务商 |
| 请求被蹭用 | 确认 `ALLOWED_ORIGIN` 已配置且不为空 |
| 超出免费额度 | Cloudflare Workers 每天 10 万次，超出可在 Dashboard 设置用量告警 |
| 生成时请求 405 | `VITE_DEMO_PROXY` 值缺 `https://` 协议头，被浏览器当相对路径拼到自己的 Pages 站点上（静态托管对 POST 回 405）。看 Network 里 405 请求的 URL：是自己站点域名即此问题，补全协议头并重新构建 |
| CORS 报 Allow-Origin 值与 origin 不一致 | 多为用 `http://` 打开站点而 `ALLOWED_ORIGIN` 是 `https://`。在 GitHub Pages 开启 Enforce HTTPS，统一走 https |
| `ERR_CONNECTION_TIMED_OUT` | `workers.dev` 域名在大陆被阻断。自己调试正常多半是本机开着代理；解决见第五节（绑自定义域名） |
