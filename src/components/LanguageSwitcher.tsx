'use client';

import { useRouter, usePathname } from 'next/navigation';
import { locales } from '@/i18n/config';

interface LanguageSwitcherProps {
  currentLocale: string;
}

export function LanguageSwitcher({ currentLocale }: LanguageSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();

  const handleLocaleChange = (locale: string) => {
    // Remove current locale from pathname
    const pathWithoutLocale = pathname.replace(/^\/[a-z]{2}-[A-Z]{2}/, '');
    const newPath = `/${locale}${pathWithoutLocale}`;
    router.push(newPath);
  };

  return (
    <div className="flex items-center space-x-2">
      <span className="text-sm text-gray-600">语言:</span>
      <select
        value={currentLocale}
        onChange={(e) => handleLocaleChange(e.target.value)}
        className="px-2 py-1 border border-gray-300 rounded text-sm"
      >
        {locales.map((locale) => (
          <option key={locale} value={locale}>
            {locale === 'zh-CN' ? '简体中文' : 'English'}
          </option>
        ))}
      </select>
    </div>
  );
}