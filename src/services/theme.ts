const KEY = 'travel-planner-theme'

/** 初始主题：本地存储优先，否则跟随系统 */
export function getInitialDark(): boolean {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'dark') return true
    if (saved === 'light') return false
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch {
    return false
  }
}

/** 应用主题到 <html> 并持久化 */
export function applyTheme(dark: boolean): void {
  document.documentElement.classList.toggle('dark', dark)
  try {
    localStorage.setItem(KEY, dark ? 'dark' : 'light')
  } catch {
    /* 隐私模式下忽略 */
  }
}
