export const SUPPORTED_LANGUAGES = ["en", "zh"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_STORAGE_KEY = "petagent.language";
export const DEFAULT_LANGUAGE: SupportedLanguage = "en";

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return value === "en" || value === "zh";
}
