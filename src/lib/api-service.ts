import { AdsTxtChecker } from './ads-txt-checker'
import { globalCache, IntelligentCache } from './intelligent-cache'

export interface DomainInfo {
  domain: string
  title: string
  verified: boolean
  lastChecked: string
  source?: string
  verificationMethod?: string
  searchQuery?: string
  description?: string
}

interface GoogleCustomSearchResult {
  items?: Array<{
    title: string
    link: string
    displayLink: string
    snippet: string
  }>
  searchInformation?: {
    totalResults: string
  }
}

export class ApiService {
  private readonly GOOGLE_API_KEY = process.env.GOOGLE_API_KEY
  private readonly GOOGLE_CX = process.env.GOOGLE_CX
  private readonly adsTxtChecker = new AdsTxtChecker()

  async searchDomainsWithAdSense(publisherId: string): Promise<DomainInfo[]> {
    const cacheKey = IntelligentCache.generateKey('adsense_search', publisherId)

    return globalCache.get(
      cacheKey,
      async () => {
        console.log(`开始搜索Publisher ID: ${publisherId}`)

        const domains: DomainInfo[] = []

        try {
          // 方法1: 标准Google Custom Search API
          if (this.GOOGLE_API_KEY && this.GOOGLE_CX) {
            console.log('使用Google Custom Search API搜索...')
            const googleResults = await this.searchWithGoogle(publisherId)
            domains.push(...googleResults)

            // 如果结果较少，可以增加更多搜索查询
            if (domains.length < 10) {
              console.log('标准搜索结果较少，使用更多搜索策略...')
              const additionalResults = await this.searchWithAdditionalQueries(publisherId)
              domains.push(...additionalResults)
            }

          } else {
            console.log('Google API配置缺失，使用增强模拟数据')
            return this.getMockData(publisherId)
          }

          // 去重并验证
          const uniqueDomains = this.deduplicateDomains(domains)
          console.log(`找到${uniqueDomains.length}个候选域名，开始验证...`)

          // 如果有真实搜索结果，进行验证；否则返回模拟数据
          if (uniqueDomains.length > 0) {
            const verifiedDomains = await this.verifyDomains(uniqueDomains, publisherId)
            console.log(`验证完成，${verifiedDomains.filter(d => d.verified).length}个域名已确认`)
            return verifiedDomains
          } else {
            console.log('无搜索结果，返回增强模拟数据')
            return this.getMockData(publisherId)
          }

        } catch (error) {
          console.error('API搜索失败:', error)
          // 如果API失败，返回模拟数据
          console.log('API搜索失败，返回增强模拟数据')
          return this.getMockData(publisherId)
        }
      },
      'adsenseSearch'
    )
  }

  private async searchWithGoogle(publisherId: string): Promise<DomainInfo[]> {
    try {
      // 优化搜索策略，减少查询数量，提高效率
      const searchQueries = [
        // 最有效的基础搜索
        `"${publisherId}"`,
        `"data-ad-client" "${publisherId}"`,
        `"google_ad_client" "${publisherId}"`,

        // 快速ads.txt搜索
        `"ads.txt" "${publisherId}"`,

        // 备用搜索（只在前面结果不足时使用）
        `"${publisherId.replace('ca-pub-', '')}" "adsense"`
      ]

      const allResults: DomainInfo[] = []

      for (let i = 0; i < searchQueries.length; i++) {
        const query = searchQueries[i]

        try {
          console.log(`搜索查询 ${i+1}/${searchQueries.length}: ${query}`)

          // 减少每个查询的结果数量，但提高质量
          const results = await this.performGoogleSearch(query, 5)
          allResults.push(...results)

          // 减少延迟时间
          if (i < searchQueries.length - 1) {
            await this.delay(200)
          }

          // 如果已经找到足够结果，提前结束
          if (allResults.length >= 20) {
            console.log('已找到足够候选域名，停止搜索')
            break
          }

        } catch (error) {
          console.error(`查询失败: ${query}`, error)
          continue
        }
      }

      console.log(`所有搜索完成，共找到${allResults.length}个候选结果`)
      return allResults

    } catch (error) {
      console.error('Google搜索失败:', error)
      return []
    }
  }

  private async performGoogleSearch(query: string, num: number = 5): Promise<DomainInfo[]> {
    const url = `https://www.googleapis.com/customsearch/v1?key=${this.GOOGLE_API_KEY}&cx=${this.GOOGLE_CX}&q=${encodeURIComponent(query)}&num=${num}`

    // 增加重试次数和超时时间，应对网络问题
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 15000) // 增加到15秒超时

        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; PubSpy/1.0)',
          }
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          if (response.status === 429) {
            console.log(`API限额达到，等待${attempt * 2}秒后重试...`)
            await this.delay(attempt * 2000)
            continue
          }

          // 对其他错误也重试
          if (attempt < 3) {
            console.log(`API错误 ${response.status}，等待后重试...`)
            await this.delay(2000)
            continue
          }

          throw new Error(`Google API错误: ${response.status} ${response.statusText}`)
        }

        const data: GoogleCustomSearchResult = await response.json()

        if (!data.items) {
          console.log(`查询"${query}"无结果`)
          return []
        }

        console.log(`查询"${query}"找到${data.items.length}个结果`)

        return data.items.map(item => ({
          domain: this.extractDomain(item.link),
          title: this.cleanTitle(item.title),
          verified: false, // 需要后续验证
          lastChecked: new Date().toISOString(),
          source: 'Google Search',
          searchQuery: query // 记录是哪个查询找到的
        }))

      } catch (error) {
        console.error(`查询失败 (尝试${attempt}/3): ${query}`, error.message)

        if (attempt === 3) {
          // 最后一次尝试失败，返回空结果
          return []
        }

        // 等待后重试
        await this.delay(attempt * 2000)
      }
    }

    return []
  }

  private async verifyDomains(domains: DomainInfo[], publisherId: string): Promise<DomainInfo[]> {
    const verifiedDomains: DomainInfo[] = []

    // 限制验证数量，优先验证前15个域名
    const domainsToVerify = domains.slice(0, 15)

    // 增加并发数，但限制总验证数
    const chunkSize = 5
    for (let i = 0; i < domainsToVerify.length; i += chunkSize) {
      const chunk = domainsToVerify.slice(i, i + chunkSize)

      const chunkResults = await Promise.allSettled(
        chunk.map(domain => this.verifyAdSenseOnDomain(domain, publisherId))
      )

      chunkResults.forEach((result, index) => {
        const domain = chunk[index]
        if (result.status === 'fulfilled') {
          verifiedDomains.push({
            ...domain,
            verified: result.value.verified,
            verificationMethod: result.value.method
          })
        } else {
          console.error(`验证域名${domain.domain}失败:`, result.reason)
          verifiedDomains.push({
            ...domain,
            verified: false,
            verificationMethod: 'failed'
          })
        }
      })

      // 减少延迟时间
      if (i + chunkSize < domainsToVerify.length) {
        await this.delay(500)
      }
    }

    return verifiedDomains
  }

  private async verifyAdSenseOnDomain(domain: DomainInfo, publisherId: string): Promise<{verified: boolean, method: string}> {
    const domainName = domain.domain

    try {
      // 方法1: 检查ads.txt文件（最权威）
      console.log(`检查${domainName}的ads.txt文件...`)
      const adsTxtResult = await this.checkAdsTxtAdvanced(domainName, publisherId)
      if (adsTxtResult.verified) {
        return { verified: true, method: adsTxtResult.method }
      }

      // 方法2: 检查主页HTML内容
      console.log(`检查${domainName}的主页内容...`)
      const htmlResult = await this.checkHomepageContent(domainName, publisherId)
      if (htmlResult) {
        return { verified: true, method: 'homepage' }
      }

      return { verified: false, method: 'none' }

    } catch (error) {
      console.error(`验证${domainName}时出错:`, error)
      return { verified: false, method: 'error' }
    }
  }

  private async checkAdsTxtAdvanced(domain: string, publisherId: string): Promise<{verified: boolean, method: string}> {
    try {
      const analysis = await this.adsTxtChecker.checkAdsTxt(domain, publisherId)

      if (!analysis.found) {
        return { verified: false, method: 'ads.txt-not-found' }
      }

      if (analysis.isValid) {
        // 检查关系类型
        const directEntries = analysis.googleAdSenseEntries.filter(entry =>
          entry.relationship === 'DIRECT' &&
          (entry.publisherId === publisherId || entry.publisherId === publisherId.replace('ca-pub-', ''))
        )

        if (directEntries.length > 0) {
          console.log(`✅ ${domain} ads.txt验证成功 (DIRECT关系)`)
          return { verified: true, method: 'ads.txt-direct' }
        }

        const resellerEntries = analysis.googleAdSenseEntries.filter(entry =>
          entry.relationship === 'RESELLER' &&
          (entry.publisherId === publisherId || entry.publisherId === publisherId.replace('ca-pub-', ''))
        )

        if (resellerEntries.length > 0) {
          console.log(`✅ ${domain} ads.txt验证成功 (RESELLER关系)`)
          return { verified: true, method: 'ads.txt-reseller' }
        }
      }

      return { verified: false, method: 'ads.txt-no-match' }
    } catch (error) {
      console.log(`❌ ${domain} ads.txt检查失败:`, error.message)
      return { verified: false, method: 'ads.txt-error' }
    }
  }

  private async checkAdsTxt(domain: string, publisherId: string): Promise<boolean> {
    try {
      const adsTxtUrl = `https://${domain}/ads.txt`
      const response = await fetch(adsTxtUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(3000), // 减少到3秒超时
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; PubSpy/1.0; +https://pubspy.example.com)'
        }
      })

      if (response.ok) {
        const content = await response.text()
        // 检查是否包含Google AdSense相关条目
        const hasGoogleAdsense = content.includes('google.com') &&
                                 (content.includes(publisherId) ||
                                  content.includes(publisherId.replace('ca-pub-', '')))

        if (hasGoogleAdsense) {
          console.log(`✅ ${domain} ads.txt验证成功`)
          return true
        }
      }

      return false
    } catch (error) {
      console.log(`❌ ${domain} ads.txt检查失败:`, error.message)
      return false
    }
  }

  private async checkHomepageContent(domain: string, publisherId: string): Promise<boolean> {
    try {
      const homeUrl = `https://${domain}`
      const response = await fetch(homeUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(5000), // 减少到5秒超时
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; PubSpy/1.0; +https://pubspy.example.com)'
        }
      })

      if (response.ok) {
        const content = await response.text()

        // 检查多种AdSense代码模式
        const patterns = [
          publisherId,
          publisherId.replace('ca-pub-', ''),
          `google_ad_client.*${publisherId}`,
          `data-ad-client.*${publisherId}`
        ]

        for (const pattern of patterns) {
          if (content.includes(pattern)) {
            console.log(`✅ ${domain} 主页内容验证成功`)
            return true
          }
        }
      }

      return false
    } catch (error) {
      console.log(`❌ ${domain} 主页检查失败:`, error.message)
      return false
    }
  }

  private deduplicateDomains(domains: DomainInfo[]): DomainInfo[] {
    const seen = new Set<string>()
    return domains.filter(domain => {
      const key = domain.domain.toLowerCase()
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
  }

  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url)
      return urlObj.hostname.replace(/^www\./, '') // 移除www前缀
    } catch {
      return url
    }
  }

  private cleanTitle(title: string): string {
    // 清理标题，移除多余字符
    return title.replace(/\s+/g, ' ').trim().substring(0, 100)
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private getMockData(publisherId: string): DomainInfo[] {
    // 返回更真实的模拟数据作为fallback
    console.log('返回模拟数据 - 请配置Google API以获取真实结果')

    // 使用真实存在且可访问的知名网站作为示例
    const realDomains = [
      {
        domain: 'example.com',
        title: '示例网站 - Example Domain',
        description: '互联网标准示例域名'
      },
      {
        domain: 'github.com',
        title: 'GitHub - 代码托管平台',
        description: '全球最大的代码托管平台'
      },
      {
        domain: 'stackoverflow.com',
        title: 'Stack Overflow - 程序员问答社区',
        description: '专业程序员技术问答网站'
      },
      {
        domain: 'mozilla.org',
        title: 'Mozilla - 开源软件基金会',
        description: 'Firefox浏览器开发者'
      },
      {
        domain: 'w3.org',
        title: 'W3C - 万维网联盟',
        description: 'Web标准制定组织'
      }
    ]

    // 根据AdSense ID生成不同的模拟数据
    const idNumber = publisherId.replace('ca-pub-', '')
    const baseNumber = parseInt(idNumber.slice(-4), 10) % 100

    const mockDomains: DomainInfo[] = []

    // 生成3-5个模拟域名
    const domainCount = 3 + (baseNumber % 3)

    for (let i = 0; i < domainCount; i++) {
      const isVerified = Math.random() > 0.4 // 60%验证率
      const domainInfo = realDomains[i % realDomains.length]

      mockDomains.push({
        domain: domainInfo.domain,
        title: `${domainInfo.title} - 模拟数据`,
        verified: isVerified,
        lastChecked: new Date().toISOString(),
        source: 'mock-search',
        verificationMethod: isVerified ? 'mock-verified' : 'mock-unverified',
        searchQuery: `模拟搜索: "${publisherId}"`
      })
    }

    return mockDomains
  }

  // 添加新的方法来适配 API 路由的需求
  async searchPublisher(publisherId: string): Promise<{
    success: boolean
    domains?: DomainInfo[]
    error?: string
    source?: string
  }> {
    try {
      const domains = await this.searchDomainsWithAdSense(publisherId)
      return {
        success: true,
        domains,
        source: domains.some(d => d.source === 'mock-search') ? 'mock' : 'api'
      }
    } catch (error) {
      return {
        success: false,
        error: error.message || '搜索失败'
      }
    }
  }

  async testConfiguration(): Promise<{
    success: boolean
    details?: any
    error?: string
  }> {
    try {
      if (!this.GOOGLE_API_KEY || !this.GOOGLE_CX) {
        return {
          success: false,
          error: 'Google API配置缺失'
        }
      }

      // 执行测试搜索
      const testQuery = 'ca-pub-test'
      const url = `https://www.googleapis.com/customsearch/v1?key=${this.GOOGLE_API_KEY}&cx=${this.GOOGLE_CX}&q=${encodeURIComponent(testQuery)}&num=1`

      const startTime = Date.now()
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; PubSpy/1.0)',
        }
      })
      const endTime = Date.now()

      if (!response.ok) {
        return {
          success: false,
          error: `API错误: ${response.status} ${response.statusText}`
        }
      }

      const data = await response.json()

      return {
        success: true,
        details: {
          responseItems: data.items?.length || 0,
          totalResults: data.searchInformation?.totalResults || '0',
          searchTime: ((endTime - startTime) / 1000).toFixed(2)
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error.message || 'API测试失败'
      }
    }
  }

  private async searchWithAdditionalQueries(publisherId: string): Promise<DomainInfo[]> {
    // 附加搜索查询策略
    const additionalQueries = [
      `"${publisherId}" site:ads.txt`,
      `"${publisherId}" "google_ad_slot"`,
      `"${publisherId}" "pagead2.googlesyndication.com"`,
      `"${publisherId.replace('ca-pub-', '')}" "google-adsense"`
    ]

    const results: DomainInfo[] = []

    for (const query of additionalQueries) {
      try {
        const queryResults = await this.performGoogleSearch(query, 3)
        results.push(...queryResults)
        await this.delay(300)
      } catch (error) {
        console.error(`附加查询失败: ${query}`, error)
      }
    }

    return results
  }
}