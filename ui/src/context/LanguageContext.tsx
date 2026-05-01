import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { i18n as appI18n } from "../i18n";
import {
  isSupportedLanguage,
  LANGUAGE_STORAGE_KEY,
  type SupportedLanguage,
} from "../i18n/types";

interface LanguageContextValue {
  language: SupportedLanguage;
  setLanguage: (next: SupportedLanguage) => void;
  toggleLanguage: () => void;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

function readCurrentLanguage(): SupportedLanguage {
  const current = appI18n.language;
  return isSupportedLanguage(current) ? current : "en";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const [language, setLanguageState] = useState<SupportedLanguage>(() => readCurrentLanguage());

  // Keep React state in sync if i18n.changeLanguage is called from elsewhere.
  useEffect(() => {
    const handler = (next: string) => {
      if (isSupportedLanguage(next)) setLanguageState(next);
    };
    i18n.on("languageChanged", handler);
    return () => {
      i18n.off("languageChanged", handler);
    };
  }, [i18n]);

  const setLanguage = useCallback(
    (next: SupportedLanguage) => {
      void i18n.changeLanguage(next);
      try {
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      setLanguageState(next);
    },
    [i18n],
  );

  const toggleLanguage = useCallback(() => {
    setLanguage(language === "en" ? "zh" : "en");
  }, [language, setLanguage]);

  const value = useMemo(
    () => ({ language, setLanguage, toggleLanguage }),
    [language, setLanguage, toggleLanguage],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return ctx;
}
