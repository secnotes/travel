import type { LLMProviderPreset } from '../types'

/**
 * OpenAI 兼容接口预设。所有预设均走 /chat/completions，
 * 浏览器直连需厂商支持 CORS（主流厂商均已支持）。
 */
export const PROVIDER_PRESETS: LLMProviderPreset[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    url: 'https://platform.deepseek.com/api_keys',
    note: '性价比高，CORS 已开放，推荐入门首选',
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-flash',
    models: ['glm-4-flash', 'glm-4-air', 'glm-4-plus', 'glm-4.6'],
    url: 'https://open.bigmodel.cn/usercenter/apikeys',
    note: 'glm-4-flash 免费额度大，国内访问稳定',
  },
  {
    id: 'moonshot',
    name: '月之暗面 Kimi',
    baseURL: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v8-8k',
    models: ['moonshot-v8-8k', 'moonshot-v8-32k', 'moonshot-v8-128k'],
    url: 'https://platform.moonshot.cn/console/api-keys',
  },
  {
    id: 'qwen',
    name: '阿里通义千问',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
    models: ['qwen-turbo', 'qwen-plus', 'qwen-max'],
    url: 'https://bailian.console.aliyun.com/?apiKey=1',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o'],
    url: 'https://platform.openai.com/api-keys',
    note: '国内网络通常无法直连',
  },
  {
    id: 'custom',
    name: '自定义 / 中转',
    baseURL: '',
    defaultModel: '',
    models: [],
    url: '',
    note: '填入任意 OpenAI 兼容地址（如 one-api 中转）',
  },
]

export function getPreset(id: string): LLMProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.id === id)
}
