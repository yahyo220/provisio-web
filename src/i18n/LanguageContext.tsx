import type { ReactNode } from 'react'
import { createContext, useContext, useMemo, useState } from 'react'
import type { Lang } from './translations'
import {
  KPI_LABEL_KEYS,
  REF_KEYS,
  translateCategory,
  translateCustomerType,
  translateUnit,
  translations,
} from './translations'

interface LanguageContextValue {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: string, vars?: Record<string, string | number>) => string
  category: (name: string) => string
  unit: (name: string) => string
  customerType: (name: string) => string
  /** Translates a KPI card label (e.g. "Today's revenue") via the shared label→key map. */
  label: (text: string) => string
  /** Translates a KPI "ref" caption (e.g. "vs yesterday") via the shared ref→key map. */
  ref: (text: string) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('ru')

  const value = useMemo<LanguageContextValue>(() => {
    function t(key: string, vars?: Record<string, string | number>) {
      let str = translations[lang][key] ?? translations.en[key] ?? key
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          str = str.replace(`{${k}}`, String(v))
        }
      }
      return str
    }
    return {
      lang,
      setLang,
      t,
      category: (name: string) => translateCategory(name, lang),
      unit: (name: string) => translateUnit(name, lang),
      customerType: (name: string) => translateCustomerType(name, lang),
      label: (text: string) => (KPI_LABEL_KEYS[text] ? t(KPI_LABEL_KEYS[text]) : text),
      ref: (text: string) => (REF_KEYS[text] ? t(REF_KEYS[text]) : text),
    }
  }, [lang])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider')
  return ctx
}
