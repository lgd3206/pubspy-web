import { NextRequest, NextResponse } from 'next/server'
import { ApiService } from '@/lib/api-service'
import { WebCrawler } from '@/lib/web-crawler'
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

    const apiService = new ApiService()
    const crawler = new WebCrawler()
    const adsTxtChecker = new AdsTxtChecker()
    const cache = IntelligentCache.getInstance()

    const debugInfo: any = {
      publisherId,
      timestamp: new Date().toISOString(),
      debugSteps: []
    }

    try {
      // 1. 测试API配置
      debugInfo.debugSteps.push({
        step: 'API配置测试',
        status: 'running',
        timestamp: new Date().toISOString()
      })

      const apiTestResult = await apiService.testConfiguration()
      debugInfo.apiConfiguration = apiTestResult
      debugInfo.debugSteps.push({
        step: 'API配置测试',
        status: apiTestResult.success ? 'success' : 'failed',
        result: apiTestResult,
        timestamp: new Date().toISOString()
      })

      // 2. 执行搜索
      debugInfo.debugSteps.push({
        step: '执行搜索请求',
        status: 'running',
        timestamp: new Date().toISOString()
      })

      const searchResult = await apiService.searchPublisher(publisherId)
      debugInfo.searchResult = searchResult
      debugInfo.debugSteps.push({
        step: '执行搜索请求',
        status: searchResult.success ? 'success' : 'failed',
        result: searchResult,
        timestamp: new Date().toISOString()
      })

      // 3. 缓存状态检查
      debugInfo.debugSteps.push({
        step: '缓存状态检查',
        status: 'running',
        timestamp: new Date().toISOString()
      })

      const cacheStats = cache.getStats()
      debugInfo.cacheStats = cacheStats
      debugInfo.debugSteps.push({
        step: '缓存状态检查',
        status: 'success',
        result: cacheStats,
        timestamp: new Date().toISOString()
      })

      // 4. 如果有搜索结果，测试ads.txt验证
      if (searchResult.success && searchResult.domains && searchResult.domains.length > 0) {
        const testDomain = searchResult.domains[0]

        debugInfo.debugSteps.push({
          step: `ads.txt验证测试 (${testDomain.domain})`,
          status: 'running',
          timestamp: new Date().toISOString()
        })

        try {
          const adsTxtResult = await adsTxtChecker.verifyAdSenseId(testDomain.domain, publisherId)
          debugInfo.adsTxtVerification = adsTxtResult
          debugInfo.debugSteps.push({
            step: `ads.txt验证测试 (${testDomain.domain})`,
            status: 'success',
            result: adsTxtResult,
            timestamp: new Date().toISOString()
          })
        } catch (adsTxtError) {
          debugInfo.debugSteps.push({
            step: `ads.txt验证测试 (${testDomain.domain})`,
            status: 'failed',
            error: adsTxtError.message,
            timestamp: new Date().toISOString()
          })
        }
      }

      // 5. 环境信息
      debugInfo.environment = {
        nodeEnv: process.env.NODE_ENV,
        userAgent: request.headers.get('user-agent'),
        hasGoogleApiKey: !!process.env.GOOGLE_API_KEY,
        hasSearchEngineId: !!process.env.GOOGLE_SEARCH_ENGINE_ID,
        runtime: 'edge' // Vercel Edge Runtime
      }

      return NextResponse.json({
        success: true,
        debugInfo
      })

    } catch (debugError) {
      debugInfo.debugSteps.push({
        step: '调试过程',
        status: 'failed',
        error: debugError.message,
        timestamp: new Date().toISOString()
      })

      return NextResponse.json({
        success: false,
        error: '调试过程中发生错误',
        debugInfo
      })
    }

  } catch (error) {
    console.error('调试请求失败:', error)
    return NextResponse.json({
      success: false,
      error: '服务器内部错误',
      details: error.message
    }, { status: 500 })
  }
}