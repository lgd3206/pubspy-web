import type { AdSenseDetectionResult, PageInfo } from '@/types'

export class WebCrawler {
  async analyzeUrl(url: string): Promise<AdSenseDetectionResult> {
    try {
      console.log(`开始分析URL: ${url}`)

      // 尝试获取网页内容，如果失败则使用备选方案
      let pageContent: string
      let pageInfo: PageInfo
      let detectedIds: string[] = []

      try {
        pageContent = await this.fetchPageContent(url)
        pageInfo = this.extractPageInfo(pageContent, url)
        detectedIds = this.detectAdSenseIds(pageContent)
      } catch (error) {
        console.warn('直接获取网页内容失败，尝试备选方案:', error.message)

        // 备选方案：使用公共CORS代理（谨慎使用）
        try {
          pageContent = await this.fetchPageContentWithProxy(url)
          pageInfo = this.extractPageInfo(pageContent, url)
          detectedIds = this.detectAdSenseIds(pageContent)
        } catch (proxyError) {
          console.warn('代理获取也失败，使用基础信息:', proxyError.message)

          // 最后的备选方案：返回基础信息但没有AdSense检测
          pageInfo = this.createBasicPageInfo(url)
          detectedIds = []

          // 但是我们可以尝试通过域名推测可能的AdSense ID
          console.log('无法获取页面内容，将返回基础分析结果')
        }
      }

      console.log(`检测到${detectedIds.length}个AdSense ID:`, detectedIds)

      // 如果找到AdSense ID，搜索相关域名
      let domains = []
      if (detectedIds.length > 0) {
        const { APIService } = await import('./api-service')
        const apiService = new APIService()

        // 搜索所有检测到的AdSense ID，并合并结果
        const allDomains: any[] = []

        for (const id of detectedIds) {
          console.log(`搜索AdSense ID的相关域名: ${id}`)
          try {
            const domainResults = await apiService.searchDomainsWithAdSense(id)
            // 为每个域名标记来源AdSense ID
            const taggedDomains = domainResults.map(domain => ({
              ...domain,
              sourceAdSenseId: id,
              title: domain.title || `使用 ${id} 的网站`
            }))
            allDomains.push(...taggedDomains)
          } catch (error) {
            console.error(`搜索AdSense ID ${id} 失败:`, error)
          }
        }

        // 去重并合并域名结果
        domains = this.deduplicateAndMergeDomains(allDomains)
        console.log(`合并后共找到${domains.length}个相关域名`)
      }

      return {
        ids: detectedIds,
        url,
        timestamp: new Date().toISOString(),
        domains,
        pageInfo
      }

    } catch (error) {
      console.error('网页分析失败:', error)
      throw new Error(`无法分析该网站: ${error.message}`)
    }
  }

  private async fetchPageContentWithProxy(url: string): Promise<string> {
    // 使用公共CORS代理服务（注意：生产环境需要自己的代理服务）
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`

    console.log(`使用代理获取网页内容: ${url}`)

    const response = await fetch(proxyUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(8000) // 减少到8秒超时
    })

    if (!response.ok) {
      throw new Error(`代理服务错误: ${response.status}`)
    }

    const data = await response.json()

    if (!data.contents) {
      throw new Error('代理服务未返回网页内容')
    }

    console.log(`代理成功获取网页内容，长度: ${data.contents.length}字符`)
    return data.contents
  }

  private createBasicPageInfo(url: string): PageInfo {
    try {
      const urlObj = new URL(url)
      return {
        title: `${urlObj.hostname} - 无法获取完整信息`,
        url,
        domain: urlObj.hostname,
        language: 'unknown',
        charset: 'unknown'
      }
    } catch (error) {
      return {
        title: '无法解析页面信息',
        url,
        domain: 'unknown',
        language: 'unknown',
        charset: 'unknown'
      }
    }
  }

  private async fetchPageContent(url: string): Promise<string> {
    try {
      console.log(`获取网页内容: ${url}`)

      // 使用更短的超时时间，避免长时间等待
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000) // 8秒超时

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const content = await response.text()
      console.log(`成功获取网页内容，长度: ${content.length}字符`)

      return content

    } catch (error) {
      console.error('获取网页内容失败:', error)

      if (error.name === 'AbortError') {
        throw new Error('网页加载超时（8秒），该网站可能响应较慢或存在访问限制')
      }

      // 提供更友好的错误信息
      if (error.message.includes('Failed to fetch')) {
        throw new Error('无法访问该网站，可能原因：\n1. 网站存在CORS限制\n2. 网站不可访问\n3. 网络连接问题')
      }

      if (error.message.includes('CORS')) {
        throw new Error('该网站限制跨域访问，无法直接分析。建议使用Chrome扩展版本或联系网站管理员')
      }

      if (error.message.includes('ERR_NAME_NOT_RESOLVED')) {
        throw new Error('域名解析失败，请检查网站地址是否正确')
      }

      throw new Error(`网络错误: ${error.message}`)
    }
  }

  private extractPageInfo(html: string, url: string): PageInfo {
    try {
      const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i)
      const langMatch = html.match(/<html[^>]*lang=["']([^"']*)["']/i)
      const charsetMatch = html.match(/<meta[^>]*charset=["']?([^"'>]*)/i) ||
                          html.match(/<meta[^>]*content=["'][^"']*charset=([^"';]*)/i)

      const urlObj = new URL(url)

      return {
        title: titleMatch ? this.cleanText(titleMatch[1]) : '无标题',
        url,
        domain: urlObj.hostname,
        language: langMatch ? langMatch[1] : 'unknown',
        charset: charsetMatch ? charsetMatch[1] : 'unknown'
      }
    } catch (error) {
      console.error('提取页面信息失败:', error)
      return {
        title: '无标题',
        url,
        domain: 'unknown',
        language: 'unknown',
        charset: 'unknown'
      }
    }
  }

  private detectAdSenseIds(html: string): string[] {
    const detectedIds = new Set<string>()

    try {
      console.log('开始多策略AdSense ID检测...')

      // 方法1: 检测script标签中的AdSense代码
      this.detectFromScriptTags(html, detectedIds)

      // 方法2: 检测HTML属性中的AdSense ID
      this.detectFromDataAttributes(html, detectedIds)

      // 方法3: 检测iframe中的AdSense ID
      this.detectFromIframes(html, detectedIds)

      // 方法4: 检测页面HTML源码中的所有出现
      this.detectFromPageSource(html, detectedIds)

      // 方法5: 检测JSON配置中的AdSense ID
      this.detectFromJsonConfig(html, detectedIds)

      // 方法6: 增强检测 - Google Tag Manager配置
      this.detectFromGTMConfig(html, detectedIds)

      // 方法7: 增强检测 - Google Analytics关联
      this.detectFromAnalyticsConfig(html, detectedIds)

      // 方法8: 增强检测 - 异步加载的AdSense代码
      this.detectFromAsyncAdSense(html, detectedIds)

      const result = Array.from(detectedIds).filter(id => this.isValidAdSenseId(id))
      console.log(`AdSense检测完成，发现${result.length}个有效ID:`, result)

      // 如果直接检测到ID，立即尝试获取相关域名
      if (result.length > 0) {
        console.log('直接检测到AdSense ID，优先级高于API搜索')
      }

      return result

    } catch (error) {
      console.error('AdSense ID检测过程中发生错误:', error)
      return []
    }
  }

  private detectFromScriptTags(html: string, detectedIds: Set<string>): void {
    const patterns = [
      // 标准AdSense代码模式
      /ca-pub-(\d{16})/g,
      // Google Ad Manager模式
      /google_ad_client\s*[:=]\s*["']ca-pub-(\d{16})["']/g,
      // AdSense auto ads模式
      /data-ad-client=["']ca-pub-(\d{16})["']/g,
      // JavaScript变量模式
      /adClient\s*[:=]\s*["']ca-pub-(\d{16})["']/g
    ]

    patterns.forEach(pattern => {
      let match
      while ((match = pattern.exec(html)) !== null) {
        detectedIds.add(`ca-pub-${match[1]}`)
      }
    })
  }

  private detectFromDataAttributes(html: string, detectedIds: Set<string>): void {
    const patterns = [
      /data-ad-client=["']?(ca-pub-\d{16})["']?/g,
      /data-google-ad-client=["']?(ca-pub-\d{16})["']?/g,
      /data-adclient=["']?(ca-pub-\d{16})["']?/g,
      /data-publisher=["']?(ca-pub-\d{16})["']?/g
    ]

    patterns.forEach(pattern => {
      let match
      while ((match = pattern.exec(html)) !== null) {
        detectedIds.add(match[1])
      }
    })
  }

  private detectFromIframes(html: string, detectedIds: Set<string>): void {
    const iframePattern = /<iframe[^>]*src=["']([^"']*ca-pub-\d{16}[^"']*)["']/g
    let match

    while ((match = iframePattern.exec(html)) !== null) {
      const src = match[1]
      const idMatch = src.match(/ca-pub-(\d{16})/)
      if (idMatch) {
        detectedIds.add(idMatch[0])
      }
    }
  }

  private detectFromPageSource(html: string, detectedIds: Set<string>): void {
    const regex = /ca-pub-(\d{16})/g
    let match

    while ((match = regex.exec(html)) !== null) {
      detectedIds.add(match[0])
    }
  }

  private detectFromJsonConfig(html: string, detectedIds: Set<string>): void {
    // 检测JSON配置中的AdSense ID
    const jsonPatterns = [
      /"client"\s*:\s*"ca-pub-(\d{16})"/g,
      /"publisher"\s*:\s*"ca-pub-(\d{16})"/g,
      /"adClient"\s*:\s*"ca-pub-(\d{16})"/g
    ]

    jsonPatterns.forEach(pattern => {
      let match
      while ((match = pattern.exec(html)) !== null) {
        detectedIds.add(`ca-pub-${match[1]}`)
      }
    })
  }

  private detectFromGTMConfig(html: string, detectedIds: Set<string>): void {
    console.log('检测GTM配置中的AdSense ID...')

    // Google Tag Manager配置中的AdSense ID
    const gtmPatterns = [
      /gtag\(['"]config['"],\s*['"]ca-pub-(\d{16})['"].*?\)/g,
      /gtag\(['"]config['"],\s*['"]UA-\d+-\d+['"].*?custom_map.*?['"]ca-pub-(\d{16})['"].*?\)/g,
      /google_tag_manager.*?ca-pub-(\d{16})/g,
      /dataLayer\.push.*?ca-pub-(\d{16})/g
    ]

    gtmPatterns.forEach(pattern => {
      let match
      while ((match = pattern.exec(html)) !== null) {
        detectedIds.add(`ca-pub-${match[1]}`)
        console.log(`GTM配置中发现AdSense ID: ca-pub-${match[1]}`)
      }
    })
  }

  private detectFromAnalyticsConfig(html: string, detectedIds: Set<string>): void {
    console.log('检测Analytics配置中的AdSense关联...')

    // Google Analytics配置中可能关联的AdSense ID
    const analyticsPatterns = [
      /google-analytics\.com.*?ca-pub-(\d{16})/g,
      /gtag\(['"]event['"].*?ca-pub-(\d{16})/g,
      /ga\(['"]send['"].*?ca-pub-(\d{16})/g
    ]

    analyticsPatterns.forEach(pattern => {
      let match
      while ((match = pattern.exec(html)) !== null) {
        detectedIds.add(`ca-pub-${match[1]}`)
        console.log(`Analytics配置中发现AdSense关联: ca-pub-${match[1]}`)
      }
    })
  }

  private detectFromAsyncAdSense(html: string, detectedIds: Set<string>): void {
    console.log('检测异步加载的AdSense代码...')

    // 异步加载和动态注入的AdSense代码
    const asyncPatterns = [
      /\.load\(['"].*googlesyndication.*?['"].*?ca-pub-(\d{16})/g,
      /createElement.*?script.*?googlesyndication.*?ca-pub-(\d{16})/g,
      /addEventListener.*?load.*?ca-pub-(\d{16})/g,
      /onload.*?function.*?ca-pub-(\d{16})/g,
      /setTimeout.*?ca-pub-(\d{16})/g,
      /requestAnimationFrame.*?ca-pub-(\d{16})/g
    ]

    asyncPatterns.forEach(pattern => {
      let match
      while ((match = pattern.exec(html)) !== null) {
        detectedIds.add(`ca-pub-${match[1]}`)
        console.log(`异步代码中发现AdSense ID: ca-pub-${match[1]}`)
      }
    })
  }

  private isValidAdSenseId(id: string): boolean {
    return /^ca-pub-\d{16}$/.test(id)
  }

  private cleanText(text: string): string {
    return text.replace(/\s+/g, ' ').trim().substring(0, 200)
  }

  private deduplicateAndMergeDomains(domains: any[]): any[] {
    const domainMap = new Map<string, any>()

    domains.forEach(domain => {
      const key = domain.domain.toLowerCase()

      if (domainMap.has(key)) {
        // 如果域名已存在，合并信息
        const existing = domainMap.get(key)!
        domainMap.set(key, {
          ...existing,
          // 如果新域名已验证而现有未验证，优先使用已验证的
          verified: existing.verified || domain.verified,
          verificationMethod: existing.verified ? existing.verificationMethod : domain.verificationMethod,
          // 合并来源AdSense ID
          sourceAdSenseId: existing.sourceAdSenseId === domain.sourceAdSenseId
            ? existing.sourceAdSenseId
            : `${existing.sourceAdSenseId}, ${domain.sourceAdSenseId}`,
          // 更新最后检查时间
          lastChecked: new Date().toISOString()
        })
      } else {
        domainMap.set(key, domain)
      }
    })

    return Array.from(domainMap.values())
  }
}