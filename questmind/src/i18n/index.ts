/**
 * QuestMind i18n — 轻量级国际化系统
 *
 * 使用方法：
 *   import { useT } from '@/i18n'
 *   const t = useT()
 *   t('nav.home')  // => '首页' | 'Home'
 *
 * 语言切换：
 *   import { useI18nStore } from '@/i18n'
 *   const { setLocale } = useI18nStore()
 *   setLocale('en')
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { zh } from './zh'
import { en } from './en'

export type Locale = 'zh' | 'en'

const translations = { zh, en }

// Zustand store for locale persistence
interface I18nState {
  locale: Locale
  setLocale: (locale: Locale) => void
  toggleLocale: () => void
}

export const useI18nStore = create<I18nState>()(
  persist(
    (set, get) => ({
      locale: 'zh' as Locale,
      setLocale: (locale) => set({ locale }),
      toggleLocale: () => set({ locale: get().locale === 'zh' ? 'en' : 'zh' }),
    }),
    { name: 'questmind-locale' }
  )
)

/**
 * 获取翻译函数 hook
 * 支持路径式 key：t('nav.home') / t('quiz.question_progress', { current: 1, total: 5 })
 */
export function useT() {
  const locale = useI18nStore((s) => s.locale)
  return (key: string, vars?: Record<string, string | number>): string => {
    const dict = translations[locale] as Record<string, any>
    const parts = key.split('.')
    let value: any = dict
    for (const part of parts) {
      value = value?.[part]
      if (value === undefined) break
    }
    if (typeof value !== 'string') {
      // Fallback to zh
      let fallback: any = translations.zh as Record<string, any>
      for (const part of parts) {
        fallback = fallback?.[part]
        if (fallback === undefined) break
      }
      value = typeof fallback === 'string' ? fallback : key
    }
    // Variable substitution: {varName}
    if (vars) {
      value = value.replace(/\{(\w+)\}/g, (_: string, k: string) => String(vars[k] ?? `{${k}}`))
    }
    return value
  }
}

/**
 * 非 hook 版本（在非 React 上下文中使用）
 */
export function getT(locale: Locale = 'zh') {
  return (key: string, vars?: Record<string, string | number>): string => {
    const dict = translations[locale] as Record<string, any>
    const parts = key.split('.')
    let value: any = dict
    for (const part of parts) {
      value = value?.[part]
      if (value === undefined) break
    }
    if (typeof value !== 'string') {
      let fallback: any = translations.zh as Record<string, any>
      for (const part of parts) {
        fallback = fallback?.[part]
        if (fallback === undefined) break
      }
      value = typeof fallback === 'string' ? fallback : key
    }
    if (vars) {
      value = value.replace(/\{(\w+)\}/g, (_: string, k: string) => String(vars[k] ?? `{${k}}`))
    }
    return value
  }
}
