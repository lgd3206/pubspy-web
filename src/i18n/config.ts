export const locales = ['zh-CN', 'en-US'] as const;
export const defaultLocale: typeof locales[number] = 'zh-CN';

export type Locale = typeof locales[number];