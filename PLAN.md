# 旅行规划 Web 应用 — 实施方案

## 定位

纯前端 Web 应用（无后端），浏览器直连 OpenAI 兼容 LLM API，采用 **LLM + 结构化数据混合架构**：本地维护景点/气候/消费数据集用于"接地"，LLM 负责推理与编排，输出经 zod 校验的结构化行程。

## 技术栈

| 项 | 选择 | 理由 |
|---|---|---|
| 框架 | Vite + React 18 + TypeScript | 生态齐全，配套库成熟 |
| 样式 | Tailwind CSS v4 | 快速构建 UI |
| 状态 | zustand + localStorage 持久化 | 轻量，保存设置与历史行程 |
| 地图 | Leaflet（react-leaflet）+ 高德瓦片 | 免 API Key；坐标统一存 GCJ-02 与高德瓦片对齐 |
| 校验 | zod | 校验 LLM 输出的 JSON |
| 分享压缩 | pako | 行程 JSON → URL hash |
| 天气 | Open-Meteo（免 Key） | 16 天预报，用本地坐标查询 |
| LLM | OpenAI 兼容 chat/completions + SSE 流式 | 预设 DeepSeek / Kimi / GLM / 通义 / OpenAI，均可自定义 baseURL/key/model |

## 目录结构

```
travel/
├── src/
│   ├── types/            # ItineraryPlan / Attraction / Climate 等类型
│   ├── data/
│   │   ├── attractions.ts   # 景点种子数据（约 200 条，15-18 个重点省份）
│   │   ├── cities.ts        # 城市信息 + 消费档位（穷游/舒适/奢华 三档单价）
│   │   ├── climate.ts       # 各城市月度气候（均温/降水/雨日）
│   │   └── holidays.ts      # 2026 法定节假日（2027 待官方公布则预留）
│   ├── llm/
│   │   ├── client.ts        # fetch 封装 SSE 流式
│   │   ├── presets.ts       # 厂商预设
│   │   └── prompts.ts       # 系统提示词 + 上下文构建
│   ├── services/
│   │   ├── resolver.ts      # 用户输入 → 景点集/气候/节假日/天气 结构化上下文
│   │   ├── planner.ts       # 编排：resolver → prompt → LLM → zod 校验 → 失败自动重试
│   │   ├── weather.ts       # Open-Meteo
│   │   └── share.ts         # 压缩/解压分享链接
│   ├── store/              # zustand：settings / plan / chat
│   └── components/
│       ├── PlanForm.tsx      # 需求1：天数/目的地/出发地/日期/预算档/偏好
│       ├── DiscoverPanel.tsx # 需求2：按时间段+偏好推荐目的地
│       ├── ChatPanel.tsx     # 多轮修改（"第二天太赶，减一个景点"）
│       ├── ItineraryView.tsx # 每日行程卡片
│       ├── MapView.tsx       # 地图 + 按天着色的路线动线
│       ├── BudgetPanel.tsx   # 分项预算汇总
│       ├── SettingsDialog.tsx
│       └── ExportMenu.tsx    # Markdown / 打印PDF / 分享链接
└── data/README.md           # 数据格式文档，方便后续扩充数据集
```

## 核心流程

### 需求 1：行程规划
1. 表单：天数、目的地（省/市/景点三级自动补全）、出发地、出发日期、预算档位、偏好（节奏快慢 + 主题多选：自然/人文/美食/亲子/摄影…）
2. `resolver` 组装上下文：目的地匹配到的景点集（含坐标/门票/建议时长/bestSeason）、城市消费锚点、当月气候、日期区间内节假日、16 天内则加 Open-Meteo 预报
3. LLM 流式输出严格 JSON 行程（系统提示词限定只能引用给定景点 id）
4. zod 校验 + 校验失败自动带着错误信息重试一次；引用了数据集外景点的条目标记"待核实"
5. 结果渲染为每日卡片 + 地图 + 预算面板

### 需求 2：按时间推荐目的地
- 输入时间段 + 可选偏好（预算/距离/主题）
- 本地数据：各城市月度气候、景点 bestSeason 标签、出发地大区推算距离
- LLM 推理排序 → 推荐 5~8 个目的地，附理由（气候、花期、节庆、避开人流）

## 扩展功能

1. **预算估算**：城市三档消费单价作锚点，LLM 出每日分项预算（大交通/市内/住宿/门票/餐饮），前端汇总，用户可手动调单价
2. **地图动线**：Leaflet 按天着色 marker + polyline，popup 显示时段/门票/贴士
3. **导出分享**：Markdown 导出；打印样式表（浏览器"另存为 PDF"）；分享链接 = 行程 JSON pako 压缩 → base64url 放 URL hash，打开即还原，零后端
4. **实时信息**：Open-Meteo 预报；节假日静态数据；预留 adapter 接口给未来的机票/火车票价格 API

## 实施步骤

1. 脚手架：Vite + React + TS + Tailwind + 页面骨架（规划 / 发现 / 设置 三 tab）
2. 数据层：类型定义 + 种子数据 + resolver
3. LLM 层：SSE client + 预设 + 提示词 + zod 校验重试
4. 需求 1 全链路：表单 → planner → 行程卡片 + ChatPanel 多轮修改
5. 地图动线 MapView
6. 预算面板
7. 需求 2：DiscoverPanel
8. 导出与分享
9. 打磨：加载/错误/空态、localStorage 持久化、README

## 已知风险与对策

- **CORS**：主流 OpenAI 兼容 API 均开放浏览器直连；个别厂商若有问题在设置页给出提示
- **坐标偏移**：统一 GCJ-02 存储，与高德瓦片天然对齐
- **LLM 幻觉**：强 schema + 白名单景点 id + zod 校验 + 自动重试，兜底标记"待核实"
- **2027 节假日**未公布：数据文件预留，标注待补
