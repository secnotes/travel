/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 公共演示模式代理地址（构建时注入，运行时可在设置页覆盖） */
  readonly VITE_DEMO_PROXY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
