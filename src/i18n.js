import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import vi from './locales/vi.json';
import { LANG_KEY } from './config';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      vi: { translation: vi },
    },
    lng: localStorage.getItem(LANG_KEY) || 'vi',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

// Persist language choice
i18n.on('languageChanged', (lng) => {
  localStorage.setItem(LANG_KEY, lng);
});

export default i18n;
