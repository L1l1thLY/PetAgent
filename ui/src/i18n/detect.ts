import {
  DEFAULT_LANGUAGE,
  isSupportedLanguage,
  LANGUAGE_STORAGE_KEY,
  type SupportedLanguage,
} from "./types";

interface NavigatorLike {
  language?: string;
  languages?: readonly string[];
}

export function detectInitialLanguage(
  navigatorLike: NavigatorLike | null | undefined,
  storage: Storage | null | undefined,
): SupportedLanguage {
  // 1. Explicit user choice (localStorage) wins.
  try {
    const stored = storage?.getItem(LANGUAGE_STORAGE_KEY);
    if (isSupportedLanguage(stored)) {
      return stored;
    }
  } catch {
    // Storage unavailable (private mode, embedded webview) — fall through.
  }

  // 2. navigator.language[s] starts with "zh" → zh.
  const candidates: string[] = [];
  if (navigatorLike?.language) candidates.push(navigatorLike.language);
  if (navigatorLike?.languages) candidates.push(...navigatorLike.languages);
  for (const tag of candidates) {
    if (typeof tag === "string" && tag.toLowerCase().startsWith("zh")) {
      return "zh";
    }
  }

  // 3. Default.
  return DEFAULT_LANGUAGE;
}
