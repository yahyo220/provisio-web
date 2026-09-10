import type { ChangeEvent } from 'react'
import { useState } from 'react'

/** The four languages the app's own i18n supports (see the Flutter app's
 * lib/i18n/app_lang.dart) — a product's name/description can carry an
 * optional override for each, edited here language-by-language via the
 * small switcher in the field's corner. Russian is always the source of
 * truth column (`name`/`description`); the other three are the
 * `*_uz_cyrl`/`*_uz_latn`/`*_en` override columns (migrations
 * 0026_product_name_translations.sql / 0032_product_description_translations.sql) —
 * left blank, a language just falls back to the Russian text in the app. */
export type ProductLang = 'ru' | 'uzCyrl' | 'uzLatn' | 'en'

const LANG_LABELS: Record<ProductLang, string> = { ru: 'РУ', uzCyrl: 'ЎЗ', uzLatn: "O'Z", en: 'EN' }
const LANGS: ProductLang[] = ['ru', 'uzCyrl', 'uzLatn', 'en']

interface LangFieldProps {
  id: string
  label: string
  values: Record<ProductLang, string>
  onChange: (lang: ProductLang, value: string) => void
  placeholder?: string
  multiline?: boolean
}

/** A Name/Description-style field with a per-language switcher tucked into
 * its label row — clicking РУ/ЎЗ/O'Z/EN swaps which language's text the
 * field below shows and edits, so the admin can type each language's
 * version by hand instead of only ever editing the Russian original. */
export default function LangField({ id, label, values, onChange, placeholder, multiline }: LangFieldProps) {
  const [lang, setLang] = useState<ProductLang>('ru')

  function handleChange(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    onChange(lang, e.target.value)
  }

  return (
    <div className="field">
      <div className="field-label-row">
        <label htmlFor={id}>{label}</label>
        <div className="lang-field-switch" role="tablist" aria-label="Язык поля">
          {LANGS.map((l) => (
            <button
              key={l}
              type="button"
              role="tab"
              aria-selected={lang === l}
              className={`lang-tab${lang === l ? ' active' : ''}${values[l].trim() ? ' filled' : ''}`}
              onClick={() => setLang(l)}
              title={l === 'ru' ? 'Русский (основной)' : `Перевод: ${LANG_LABELS[l]}`}
            >
              {LANG_LABELS[l]}
            </button>
          ))}
        </div>
      </div>
      {multiline ? (
        <textarea
          id={id}
          value={values[lang]}
          onChange={handleChange}
          placeholder={lang === 'ru' ? placeholder : `Перевод на ${LANG_LABELS[lang]} — необязательно`}
        />
      ) : (
        <input
          id={id}
          type="text"
          value={values[lang]}
          onChange={handleChange}
          placeholder={lang === 'ru' ? placeholder : `Перевод на ${LANG_LABELS[lang]} — необязательно`}
        />
      )}
    </div>
  )
}
