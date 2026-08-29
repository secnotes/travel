# 部署到 GitHub Pages

本项目是纯前端静态应用，构建产物为 `dist/`，天然适合 GitHub Pages。

## 一、推送到 GitHub

```bash
git init
git add -A
git commit -m "悠行 AI 旅行规划 v0.1"
git remote add origin git@github.com:<你的用户名>/<仓库名>.git
git branch -M main
git push -u origin main
```

（需先在 GitHub 上创建一个空仓库，不要勾选初始化 README。）

## 二、开启 Pages

1. 仓库 **Settings → Pages → Source** 选 **"GitHub Actions"**
2. 推送代码后，`.github/workflows/deploy.yml` 会自动构建并部署
3. 约 1-2 分钟后访问 `https://<你的用户名>.github.io/<仓库名>/`

## 三、（可选）启用公共演示模式

默认情况下，访客需要自己配置 API Key 才能使用。如果你想让大家**打开链接即用**（无需自配 Key），需要部署一个 Cloudflare Worker 作为代理——见 [部署 Cloudflare Worker](./deploy-worker.md)。

启用后，在 GitHub 仓库 **Settings → Secrets and variables → Actions → Variables** 添加一个**仓库变量**（不是 Secret，因为地址本身不需要保密）：

| Name | Value |
| --- | --- |
| `VITE_DEMO_PROXY` | `https://<worker-子域>.workers.dev/llm-proxy` |

添加后重新触发一次 Actions 构建（推一次代码或手动 Run workflow）即可生效。

## 工作流说明

`.github/workflows/deploy.yml` 做的事：

1. `npm ci` 安装依赖
2. `npm run build` 构建（若配置了 `VITE_DEMO_PROXY` 变量，会注入进产物）
3. 上传 `dist/` 为 Pages artifact 并部署

`vite.config.ts` 中 `base: './'` 使用相对路径，兼容项目页（`/仓库名/`）与用户主页页（`/`）及自定义域名。

## 常见问题

- **构建失败**：检查 Node 版本，工作流用的是 Node 22
- **页面白屏**：确认 Pages Source 选的是 "GitHub Actions" 而非 "Deploy from a branch"（后者会发布源码而非构建产物）
- **国内访问慢**：github.io 国内访问不稳定，同一套 `dist/` 也可部署到 Cloudflare Pages / Vercel / Gitee Pages，配置零改动
