import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { applyTheme, getInitialDark } from '../services/theme'
import type {
  BudgetTier,
  ChatMessage,
  DestinationRecommendation,
  ItineraryPlan,
  LLMSettings,
  Pace,
  PlanRequest,
  ShortlinkProvider,
  Theme,
} from '../types'

interface HistoryEntry {
  id: string
  title: string
  createdAt: string
  request: PlanRequest
  plan: ItineraryPlan
}

/** 目的地发现表单（放 store，切换标签页不丢失） */
export interface DiscoverForm {
  startDate: string
  days: number
  origin: string
  themes: Theme[]
  budgetTier: BudgetTier
  notes: string
}

/** 行程规划表单草稿（放 store，切换标签页不丢失） */
export interface PlanFormDraft {
  destination: string
  days: number
  origin: string
  startDate: string
  budgetTier: BudgetTier
  pace: Pace
  themes: Theme[]
  travelers: number
  extraNotes: string
}

function todayStr(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/**
 * 瞬时回到顶部。直接 window.scrollTo 会走 CSS 的 scroll-behavior:smooth
 * 变成动画，动画可能被随后的视图切换（文档高度骤变）打断而停在半路，
 * 这里临时用内联样式覆盖为 auto，保证一步到位。
 */
function scrollTopInstant() {
  const root = document.documentElement
  const prev = root.style.scrollBehavior
  root.style.scrollBehavior = 'auto'
  window.scrollTo(0, 0)
  root.style.scrollBehavior = prev
}

const DEFAULT_DISCOVER_FORM: DiscoverForm = {
  startDate: todayStr(),
  days: 4,
  origin: '',
  themes: [],
  budgetTier: 'comfort',
  notes: '',
}

const DEFAULT_PLAN_DRAFT: PlanFormDraft = {
  destination: '',
  days: 3,
  origin: '',
  startDate: '',
  budgetTier: 'comfort',
  pace: 'moderate',
  themes: [],
  travelers: 2,
  extraNotes: '',
}

interface AppState {
  // ---- 页面 ----
  tab: 'plan' | 'discover'
  setTab: (t: 'plan' | 'discover') => void

  // ---- 主题 ----
  dark: boolean
  toggleTheme: () => void

  // ---- 设置 ----
  llm: LLMSettings
  setLLM: (s: LLMSettings) => void

  /** 公共演示模式：访客未配自己的 Key 时，请求经公共 Worker 转发 */
  demoProxyUrl: string
  setDemoProxyUrl: (url: string) => void

  /** 短链接服务商（设置 -> 高级选项，详见 docs/shortlinks.md） */
  shortlinkProvider: ShortlinkProvider
  setShortlinkProvider: (p: ShortlinkProvider) => void

  // ---- 行程规划表单草稿 ----
  planDraft: PlanFormDraft
  updatePlanDraft: (patch: Partial<PlanFormDraft>) => void

  // ---- 当前行程会话 ----
  request: PlanRequest | null
  plan: ItineraryPlan | null
  chat: ChatMessage[]
  generating: boolean
  statusText: string
  streamText: string
  error: string | null

  startGeneration: (req: PlanRequest) => void
  setPlan: (plan: ItineraryPlan, assistantMsg?: string) => void
  setChat: (messages: ChatMessage[]) => void
  appendChat: (msg: ChatMessage) => void
  setStatus: (status: string) => void
  setStream: (text: string) => void
  setError: (err: string | null) => void
  setGenerating: (v: boolean) => void
  reset: () => void

  // ---- 目的地发现（状态入 store：切换标签/请求进行中均不丢失）----
  discoverForm: DiscoverForm
  updateDiscoverForm: (patch: Partial<DiscoverForm>) => void
  discoverLoading: boolean
  discoverStatus: string
  discoverError: string | null
  discoverResults: DestinationRecommendation[] | null
  startDiscover: () => void
  finishDiscover: (results: DestinationRecommendation[]) => void
  failDiscover: (error: string) => void
  setDiscoverError: (error: string | null) => void
  setDiscoverStatus: (status: string) => void

  // ---- 历史 ----
  history: HistoryEntry[]
  saveToHistory: (request: PlanRequest, plan: ItineraryPlan) => void
  removeFromHistory: (id: string) => void
}

const DEFAULT_LLM: LLMSettings = {
  provider: 'deepseek',
  baseURL: 'https://api.deepseek.com/v1',
  apiKey: '',
  model: 'deepseek-chat',
  temperature: 0.7,
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      tab: 'plan',
      setTab: (tab) => set({ tab }),

      dark: getInitialDark(),
      toggleTheme: () =>
        set((s) => {
          const dark = !s.dark
          applyTheme(dark)
          return { dark }
        }),

      llm: DEFAULT_LLM,
      setLLM: (llm) => set({ llm }),

      // 构建时通过 VITE_DEMO_PROXY 注入公共 Worker 地址；运行时可手动改
      demoProxyUrl: import.meta.env.VITE_DEMO_PROXY ?? '',
      setDemoProxyUrl: (demoProxyUrl) => set({ demoProxyUrl }),

      shortlinkProvider: 'worker',
      setShortlinkProvider: (shortlinkProvider) => set({ shortlinkProvider }),

      planDraft: DEFAULT_PLAN_DRAFT,
      updatePlanDraft: (patch) =>
        set((s) => ({ planDraft: { ...s.planDraft, ...patch } })),

      request: null,
      plan: null,
      chat: [],
      generating: false,
      statusText: '',
      streamText: '',
      error: null,

      startGeneration: (request) =>
        set({ request, plan: null, chat: [], generating: true, error: null, statusText: '', streamText: '' }),
      setPlan: (plan, assistantMsg) =>
        set((s) => {
          // 进入行程视图（此前无行程）时压入浏览器历史，回退键可回到表单；
          // 多轮修改（已有行程）不重复压栈
          if (!s.plan) {
            history.pushState({ yxView: 'plan' }, '')
            // 从表单切到行程视图时置顶（表单页可能停在很深的滚动位置）
            scrollTopInstant()
          }
          return {
            plan,
            generating: false,
            statusText: '',
            streamText: '',
            chat: assistantMsg
              ? [...s.chat, { role: 'assistant' as const, content: assistantMsg, plan }]
              : s.chat,
          }
        }),
      setChat: (chat) => set({ chat }),
      appendChat: (msg) => set((s) => ({ chat: [...s.chat, msg] })),
      setStatus: (statusText) => set({ statusText }),
      setStream: (streamText) => set({ streamText }),
      setError: (error) => set({ error, generating: false, statusText: '', streamText: '' }),
      setGenerating: (generating) => set({ generating }),
      reset: () => {
        // 先同步重置状态，确保任何环境下点击都立即生效。
        // 此前依赖 history.back() 触发 popstate 处理器间接重置，
        // 在部分移动端浏览器/复杂历史栈（如连续两个行程记录条目）下
        // back 不触发 popstate，导致点击「新建行程」无反应。
        const onPlanEntry = history.state?.yxView === 'plan'
        set({ request: null, plan: null, chat: [], generating: false, statusText: '', streamText: '', error: null })
        // 回到表单后置顶（视口可能停在行程页很深的滚动位置）
        scrollTopInstant()
        if (onPlanEntry) {
          // 回退消费行程历史记录；popstate 处理器见 plan 已清空，不会重复处理。
          // back() 会恢复上一条目记录的滚动位置（"回到上次浏览位置"的来源）：
          // 临时关闭自动恢复，且个别移动浏览器不遵守 manual、恢复时机也可能
          // 在 popstate 前后漂移，故在 popstate 即时/后续两帧/短超时多次压制，
          // 保证最终停在顶部（settle 幂等，重复调用无害）
          const prev = history.scrollRestoration
          history.scrollRestoration = 'manual'
          history.back()
          const settle = () => {
            scrollTopInstant()
            requestAnimationFrame(() => requestAnimationFrame(scrollTopInstant))
            history.scrollRestoration = prev
          }
          window.addEventListener('popstate', settle, { once: true })
          setTimeout(settle, 300)
        }
      },

      discoverForm: DEFAULT_DISCOVER_FORM,
      updateDiscoverForm: (patch) =>
        set((s) => ({ discoverForm: { ...s.discoverForm, ...patch } })),
      discoverLoading: false,
      discoverStatus: '',
      discoverError: null,
      discoverResults: null,
      startDiscover: () =>
        set({ discoverLoading: true, discoverError: null, discoverStatus: '', discoverResults: null }),
      finishDiscover: (results) =>
        set({ discoverLoading: false, discoverResults: results, discoverStatus: '' }),
      failDiscover: (error) =>
        set({ discoverLoading: false, discoverError: error, discoverStatus: '' }),
      setDiscoverError: (error) => set({ discoverError: error }),
      setDiscoverStatus: (status) => set({ discoverStatus: status }),

      history: [],
      saveToHistory: (request, plan) =>
        set((s) => {
          const entry: HistoryEntry = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            title: plan.title,
            createdAt: new Date().toISOString(),
            request,
            plan,
          }
          // 同标题覆盖旧记录，最多保留 20 条
          const rest = s.history.filter(
            (h) => !(h.title === entry.title && h.request.destination === request.destination),
          )
          return { history: [entry, ...rest].slice(0, 20) }
        }),
      removeFromHistory: (id) =>
        set((s) => ({ history: s.history.filter((h) => h.id !== id) })),
    }),
    {
      name: 'travel-planner-state',
      partialize: (s) => ({
        llm: s.llm,
        history: s.history,
        shortlinkProvider: s.shortlinkProvider,
      }),
    },
  ),
)
