import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { detectInitialLanguage } from "./detect";
import { DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY, type SupportedLanguage } from "./types";

import enCommon from "./locales/en/common.json";
import enSidebar from "./locales/en/sidebar.json";
import enDashboard from "./locales/en/dashboard.json";
import enSettings from "./locales/en/settings.json";
import enBoard from "./locales/en/board.json";

import zhCommon from "./locales/zh/common.json";
import zhSidebar from "./locales/zh/sidebar.json";
import zhDashboard from "./locales/zh/dashboard.json";
import zhSettings from "./locales/zh/settings.json";
import zhBoard from "./locales/zh/board.json";

function safeStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

const initialLanguage: SupportedLanguage = detectInitialLanguage(
  typeof navigator !== "undefined" ? navigator : null,
  safeStorage(),
);

void i18n.use(initReactI18next).init({
  resources: {
    en: {
      common: enCommon,
      sidebar: enSidebar,
      dashboard: enDashboard,
      settings: enSettings,
      board: enBoard,
    },
    zh: {
      common: zhCommon,
      sidebar: zhSidebar,
      dashboard: zhDashboard,
      settings: zhSettings,
      board: zhBoard,
    },
  },
  lng: initialLanguage,
  fallbackLng: DEFAULT_LANGUAGE,
  defaultNS: "common",
  ns: ["common", "sidebar", "dashboard", "settings", "board"],
  interpolation: {
    escapeValue: false, // React already escapes
  },
  returnNull: false,
  react: {
    useSuspense: false, // Resources are bundled, no async load
  },
});

// Persist whichever language ends up active so reload preserves choice.
try {
  safeStorage()?.setItem(LANGUAGE_STORAGE_KEY, initialLanguage);
} catch {
  /* ignore */
}

export { i18n };
export default i18n;
