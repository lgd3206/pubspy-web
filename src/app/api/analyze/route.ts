import { NextRequest, NextResponse } from 'next/server'
import { WebCrawler } from '@/lib/web-crawler'
import { ApiService } from '@/lib/api-service'
import { AdsTxtChecker } from '@/lib/ads-txt-checker'
import { IntelligentCache } from '@/lib/intelligent-cache'

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json()

    if (!url || typeof url !== 'string') {
      return NextResponse.json({
        success: false,
        error: '请提供有效的URL'
      }, { status: 400 })
    }

    // 验证URL格式
    let targetUrl: URL
    try {
      targetUrl = new URL(url.startsWith('http') ? url : `https://${url}`)
    } catch {
      return NextResponse.json({
        success: false,
        error: 'URL格式不正确'
      }, { status: 400 })
    }

    const cache = IntelligentCache.getInstance()
    const cacheKey = `analyze:${targetUrl.hostname}`

    // 检查缓存
    const cached = cache.get(cacheKey, 'htmlAnalysis')
    if (cached) {
      return NextResponse.json({
        success: true,
        data: cached,
        cached: true
      })
    }

    const crawler = new WebCrawler()
    const apiService = new ApiService()
    const adsTxtChecker = new AdsTxtChecker()

    // 1. 抓取网页内容并检测AdSense ID
    const crawlResult = await crawler.analyzeWebsite(targetUrl.toString())

    if (!crawlResult.success) {
      return NextResponse.json({
        success: false,
        error: crawlResult.error || '网页分析失败'
      }, { status: 500 })
    }

    const detectedIds = crawlResult.adsenseIds || []
    let allDomains: any[] = []

    // 2. 对每个检测到的AdSense ID进行搜索
    for (const adsenseId of detectedIds) {
      try {
        const searchResult = await apiService.searchPublisher(adsenseId)
        if (searchResult.success && searchResult.domains) {
          // 3. 验证每个域名的ads.txt
          const verifiedDomains = await Promise.all(
            searchResult.domains.map(async (domain: any) => {
              const verification = await adsTxtChecker.verifyAdSenseId(domain.domain, adsenseId)
              return {
                ...domain,
                verified: verification.verified,
                verificationMethod: verification.method,
                lastChecked: new Date().toISOString(),
                searchQuery: `"${adsenseId}"`
              }
            })
          )
          allDomains.push(...verifiedDomains)
        }
      } catch (error) {
        console.error(`搜索AdSense ID ${adsenseId} 失败:`, error)
      }
    }

    // 去重域名
    const uniqueDomains = allDomains.reduce((acc, domain) => {
      const existing = acc.find((d: any) => d.domain === domain.domain)
      if (!existing) {
        acc.push(domain)
      }
      return acc
    }, [])

    const result = {
      ids: detectedIds,
      domains: uniqueDomains,
      pageInfo: {
        domain: targetUrl.hostname,
        title: crawlResult.title || targetUrl.hostname,
        description: crawlResult.description
      },
      detectionMethods: crawlResult.detectionMethods || [],
      analysisTime: new Date().toISOString()
    }

    // 缓存结果
    cache.set(cacheKey, result, 'htmlAnalysis')

    return NextResponse.json({
      success: true,
      data: result
    })

  } catch (error) {
    console.error('分析请求失败:', error)
    return NextResponse.json({
      success: false,
      error: '服务器内部错误'
    }, { status: 500 })
  }
}