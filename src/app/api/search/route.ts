import { NextRequest, NextResponse } from 'next/server'
import { ApiService } from '@/lib/api-service'
import { AdsTxtChecker } from '@/lib/ads-txt-checker'
import { IntelligentCache } from '@/lib/intelligent-cache'

export async function POST(request: NextRequest) {
  try {
    const { publisherId } = await request.json()

    if (!publisherId || typeof publisherId !== 'string') {
      return NextResponse.json({
        success: false,
        error: '请提供有效的AdSense发布商ID'
      }, { status: 400 })
    }

    // 验证AdSense ID格式
    const adsenseIdPattern = /^ca-pub-\d{16}$/
    if (!adsenseIdPattern.test(publisherId)) {
      return NextResponse.json({
        success: false,
        error: 'AdSense发布商ID格式不正确，应该是: ca-pub-xxxxxxxxxxxxxxxx'
      }, { status: 400 })
    }

    const cache = IntelligentCache.getInstance()
    const cacheKey = `search:${publisherId}`

    // 检查缓存
    const cached = cache.get(cacheKey, 'adsenseSearch')
    if (cached) {
      return NextResponse.json({
        success: true,
        data: cached,
        cached: true
      })
    }

    const apiService = new ApiService()
    const adsTxtChecker = new AdsTxtChecker()

    // 搜索使用该AdSense ID的域名
    const searchResult = await apiService.searchPublisher(publisherId)

    if (!searchResult.success) {
      return NextResponse.json({
        success: false,
        error: searchResult.error || '搜索失败'
      }, { status: 500 })
    }

    let verifiedDomains: any[] = []

    if (searchResult.domains && searchResult.domains.length > 0) {
      // 验证每个域名的ads.txt
      verifiedDomains = await Promise.all(
        searchResult.domains.map(async (domain: any) => {
          try {
            const verification = await adsTxtChecker.verifyAdSenseId(domain.domain, publisherId)
            return {
              ...domain,
              verified: verification.verified,
              verificationMethod: verification.method,
              lastChecked: new Date().toISOString(),
              searchQuery: `"${publisherId}"`
            }
          } catch (error) {
            console.error(`验证域名 ${domain.domain} 失败:`, error)
            return {
              ...domain,
              verified: false,
              verificationMethod: 'error',
              lastChecked: new Date().toISOString(),
              searchQuery: `"${publisherId}"`
            }
          }
        })
      )
    }

    const result = {
      publisherId,
      domains: verifiedDomains,
      totalResults: verifiedDomains.length,
      verifiedCount: verifiedDomains.filter(d => d.verified).length,
      searchTime: new Date().toISOString(),
      source: searchResult.source || 'api'
    }

    // 缓存结果
    cache.set(cacheKey, result, 'adsenseSearch')

    return NextResponse.json({
      success: true,
      data: result
    })

  } catch (error) {
    console.error('搜索请求失败:', error)
    return NextResponse.json({
      success: false,
      error: '服务器内部错误'
    }, { status: 500 })
  }
}