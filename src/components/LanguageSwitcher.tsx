'use client'

import { useParams, useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'

export function LanguageSwitcher() {
  const locale = useLocale()
  const params = useParams()
  const router = useRouter()

  const handleLocaleChange = (newLocale: string) => {
    // 获取当前路径，但移除locale前缀
    const pathname = window.location.pathname
    const currentLocale = params.locale as string

    // 移除当前locale前缀，如果存在的话
    let newPathname = pathname
    if (pathname.startsWith(`/${currentLocale}`)) {
      newPathname = pathname.slice(`/${currentLocale}`.length) || '/'
    }

    // 添加新的locale前缀
    const newPath = `/${newLocale}${newPathname === '/' ? '' : newPathname}`

    router.push(newPath)
  }

  const locales = [
    { code: 'zh-CN', name: '中文' },
    { code: 'en-US', name: 'English' }
  ]

  return (
    <div className="relative">
      <select
        value={locale}
        onChange={(e) => handleLocaleChange(e.target.value)}
        className="appearance-none bg-white border border-gray-300 rounded-md px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer"
      >
        {locales.map((loc) => (
          <option key={loc.code} value={loc.code}>
            {loc.name}
          </option>
        ))}
      </select>
      <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
        <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  )
}
