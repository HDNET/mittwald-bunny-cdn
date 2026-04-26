import { remoteLanguageDetectorModule } from '@mittwald/ext-bridge/i18next'
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import de from './locales/de.json'
import en from './locales/en.json'

/**
 * mittwald-native i18n wiring:
 *
 * - `remoteLanguageDetectorModule` reads the user's mStudio language
 *   (via ext-bridge) and keeps it in sync when the user switches it.
 *   No manual locale routing, no `<html lang>` gymnastics.
 *
 * - `fallbackLng: 'de'` because the mittwald marketplace is DE-primary
 *   and our master-copy for every string is German. Missing EN keys
 *   render the DE string, never a raw key.
 *
 * - `interpolation.escapeValue: false` — React already escapes output,
 *   double-escaping would double-encode `<` and friends.
 *
 * - One namespace (`translation`), nested keys. We have ~150 strings;
 *   splitting namespaces would be a lazy-load optimisation we don't
 *   need at this size.
 *
 * Import this module once (for side effects) — `initReactI18next`
 * registers a default store, so components can call `useTranslation()`
 * without a provider.
 */

void i18next
  .use(remoteLanguageDetectorModule())
  .use(initReactI18next)
  .init({
    resources: {
      de: { translation: de },
      en: { translation: en },
    },
    fallbackLng: 'de',
    supportedLngs: ['de', 'en'],
    interpolation: { escapeValue: false },
  })

export default i18next
