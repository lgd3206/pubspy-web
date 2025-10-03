import type { Metadata } from 'next'
import { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'PubSpy - AdSense Publisher ID 检测工具',
  description: '强大的AdSense Publisher ID检测和分析工具，快速发现网站的AdSense关联域名',
  keywords: 'AdSense, Publisher ID, 广告检测, 域名分析, PubSpy',
}

interface RootLayoutProps {
  children: ReactNode
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="zh-CN">
      <body>
        <div id="__next">{children}</div>
      </body>
    </html>
  )
}