// ===== 基础领域类型 =====

/** 主题标签 */
export type Theme =
  | 'nature'    // 自然风光
  | 'culture'   // 人文历史
  | 'food'      // 美食
  | 'family'    // 亲子
  | 'photography' // 摄影
  | 'hiking'    // 徒步登山
  | 'beach'     // 海滨
  | 'museum'    // 博物馆
  | 'religion'  // 宗教寺庙
  | 'nightlife' // 夜生活

export const THEME_LABELS: Record<Theme, string> = {
  nature: '自然风光',
  culture: '人文历史',
  food: '美食',
  family: '亲子',
  photography: '摄影',
  hiking: '徒步登山',
  beach: '海滨',
  museum: '博物馆',
  religion: '宗教寺庙',
  nightlife: '夜生活',
}

export type Season = 'spring' | 'summer' | 'autumn' | 'winter'

/** 景点（本地数据集条目）。坐标为 GCJ-02 [经度, 纬度]，与高德瓦片对齐 */
export interface Attraction {
  id: string
  name: string
  city: string
  province: string
  coords: [number, number]
  /** 推荐度 1-5 */
  rating: 1 | 2 | 3 | 4 | 5
  /** 门票价格（元），0 为免费 */
  ticket: number
  /** 建议游玩时长（小时） */
  duration: number
  themes: Theme[]
  bestSeasons: Season[]
  desc: string
  tips?: string
}

/** 城市信息 + 消费锚点（三档：穷游 / 舒适 / 奢华） */
export interface CityCost {
  city: string
  province: string
  region: string
  coords: [number, number]
  /** 消费水平 1(低) - 3(高) */
  costTier: 1 | 2 | 3
  /** 每人每天餐饮 [穷游, 舒适, 奢华] */
  meal: [number, number, number]
  /** 每晚住宿（每间） [穷游, 舒适, 奢华] */
  hotel: [number, number, number]
  /** 每天市内交通 [穷游, 舒适, 奢华] */
  localTransport: [number, number, number]
  /** 一句话城市特色 */
  blurb: string
}

/** 月度气候 */
export interface MonthlyClimate {
  month: number // 1-12
  tAvg: number
  tMin: number
  tMax: number
  rainDays: number
  note?: string // 如 "梅雨季"
}

export interface CityClimate {
  city: string
  province: string
  monthly: MonthlyClimate[]
}

/** 法定节假日 */
export interface Holiday {
  name: string
  start: string // YYYY-MM-DD
  end: string
  note?: string
}

// ===== 用户输入 =====

export type BudgetTier = 'budget' | 'comfort' | 'luxury'
export type Pace = 'relaxed' | 'moderate' | 'packed'

export const BUDGET_TIER_LABELS: Record<BudgetTier, string> = {
  budget: '穷游',
  comfort: '舒适',
  luxury: '奢华',
}

export const PACE_LABELS: Record<Pace, string> = {
  relaxed: '悠闲',
  moderate: '适中',
  packed: '紧凑',
}

export interface PlanRequest {
  days: number
  /** 目的地原始输入：省份 / 城市 / 景点名 */
  destination: string
  origin: string
  startDate?: string // YYYY-MM-DD
  budgetTier: BudgetTier
  pace: Pace
  themes: Theme[]
  /** 同行人数，默认 1 */
  travelers?: number
  extraNotes?: string
}

// ===== LLM 输出的行程计划 =====

export type ActivityType =
  | 'attraction'
  | 'meal'
  | 'transport'
  | 'rest'
  | 'free'

export interface PlanActivity {
  /** 命中本地数据集时有 id 与坐标 */
  attractionId?: string
  name: string
  startTime: string // "09:00"
  endTime: string
  type: ActivityType
  ticket?: number
  note?: string
  coords?: [number, number]
  /** 是否来自本地数据集（未命中 = LLM 补充，标记"待核实"） */
  verified: boolean
}

export interface PlanDay {
  day: number
  date?: string
  /** 当日主题，如 "西湖环湖 + 南宋御街" */
  theme: string
  city: string
  activities: PlanActivity[]
  /** 当日交通说明（含城市间/市内） */
  transportNote: string
  /** 建议住宿区域 */
  lodging?: string
  estimatedCost: number
}

export type BudgetCategory =
  | 'transport'
  | 'lodging'
  | 'tickets'
  | 'meals'
  | 'misc'

export const BUDGET_CATEGORY_LABELS: Record<BudgetCategory, string> = {
  transport: '大交通',
  lodging: '住宿',
  tickets: '门票',
  meals: '餐饮',
  misc: '其他',
}

export interface BudgetItem {
  category: BudgetCategory
  label: string
  amount: number
  note?: string
}

export interface ItineraryPlan {
  title: string
  overview: string
  days: PlanDay[]
  budget: {
    perPerson: BudgetItem[]
    total: number
    note?: string
  }
  packingList: string[]
  tips: string[]
  warnings?: string[]
}

// ===== 多轮修改对话 =====

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  /** assistant 消息可附带计划快照 */
  plan?: ItineraryPlan
}

// ===== 目的地发现（需求 2）=====

export interface DestinationRecommendation {
  destination: string
  province: string
  /** 推荐 0-100 */
  score: number
  reasons: string[]
  climateNote: string
  crowdNote: string
  suggestedDays: number
  coords?: [number, number]
}

// ===== LLM 设置 =====

export interface LLMSettings {
  /** 预设 id 或 'custom' */
  provider: string
  baseURL: string
  apiKey: string
  model: string
  temperature?: number
}

export interface LLMProviderPreset {
  id: string
  name: string
  baseURL: string
  defaultModel: string
  models: string[]
  url: string // 获取 API Key 的地址
  note?: string
}

/** 地区数据文件（attractions/cities/climate 的聚合载体） */
export interface RegionData {
  attractions: Attraction[]
  cities: CityCost[]
  climate: CityClimate[]
}
