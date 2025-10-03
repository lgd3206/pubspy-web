interface AdsTxtEntry {
  domain: string
  publisherId: string
  relationship: 'DIRECT' | 'RESELLER'
  certificationAuthority?: string
}

interface AdsTxtAnalysis {
  found: boolean
  url: string
  entries: AdsTxtEntry[]
  errors: string[]
  lastChecked: string
  googleAdSenseEntries: AdsTxtEntry[]
  isValid: boolean
}

export class AdsTxtChecker {
  async checkAdsTxt(domain: string, targetPublisherId?: string): Promise<AdsTxtAnalysis> {
    const analysis: AdsTxtAnalysis = {
      found: false,
      url: `https://${domain}/ads.txt`,
      entries: [],
      errors: [],
      lastChecked: new Date().toISOString(),
      googleAdSenseEntries: [],
      isValid: false
    }

    try {
      console.log(`检查 ${domain} 的 ads.txt 文件...`)

      // 尝试获取ads.txt文件
      const response = await fetch(analysis.url, {
        method: 'GET',
        signal: AbortSignal.timeout(8000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; PubSpy/1.0; +https://pubspy.example.com)'
        }
      })

      if (!response.ok) {
        analysis.errors.push(`HTTP ${response.status}: ${response.statusText}`)
        return analysis
      }

      const content = await response.text()
      analysis.found = true

      // 解析ads.txt内容
      const lines = content.split('\n')

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim()

        // 跳过空行和注释
        if (!line || line.startsWith('#')) continue

        try {
          const entry = this.parseAdsTxtLine(line)
          if (entry) {
            analysis.entries.push(entry)

            // 检查是否为Google AdSense条目
            if (this.isGoogleAdSenseEntry(entry)) {
              analysis.googleAdSenseEntries.push(entry)
            }
          }
        } catch (error) {
          analysis.errors.push(`第${i + 1}行解析错误: ${error.message}`)
        }
      }

      // 验证是否包含目标Publisher ID
      if (targetPublisherId) {
        analysis.isValid = this.validatePublisherId(analysis.googleAdSenseEntries, targetPublisherId)
      }

      console.log(`✅ ${domain} ads.txt检查完成: ${analysis.entries.length}个条目, ${analysis.googleAdSenseEntries.length}个Google AdSense条目`)

    } catch (error) {
      console.error(`❌ ${domain} ads.txt检查失败:`, error)
      analysis.errors.push(`网络错误: ${error.message}`)
    }

    return analysis
  }

  private parseAdsTxtLine(line: string): AdsTxtEntry | null {
    // ads.txt格式: domain, publisher_id, relationship, [certification_authority]
    const parts = line.split(',').map(part => part.trim())

    if (parts.length < 3) {
      throw new Error(`格式错误: 至少需要3个字段，实际${parts.length}个`)
    }

    const [domain, publisherId, relationship, certificationAuthority] = parts

    if (!domain || !publisherId || !relationship) {
      throw new Error('必填字段缺失')
    }

    if (!['DIRECT', 'RESELLER'].includes(relationship.toUpperCase())) {
      throw new Error(`关系类型无效: ${relationship}`)
    }

    return {
      domain: domain.toLowerCase(),
      publisherId,
      relationship: relationship.toUpperCase() as 'DIRECT' | 'RESELLER',
      certificationAuthority: certificationAuthority || undefined
    }
  }

  private isGoogleAdSenseEntry(entry: AdsTxtEntry): boolean {
    const googleDomains = [
      'google.com',
      'google.co.uk',
      'google.de',
      'google.fr',
      'google.com.au',
      'google.ca',
      'googlesyndication.com',
      'doubleclick.net'
    ]

    return googleDomains.includes(entry.domain.toLowerCase())
  }

  private validatePublisherId(googleEntries: AdsTxtEntry[], targetPublisherId: string): boolean {
    // 检查是否包含目标Publisher ID
    return googleEntries.some(entry =>
      entry.publisherId === targetPublisherId ||
      entry.publisherId === targetPublisherId.replace('ca-pub-', '')
    )
  }

  async batchCheckAdsTxt(domains: string[], targetPublisherId?: string): Promise<Map<string, AdsTxtAnalysis>> {
    const results = new Map<string, AdsTxtAnalysis>()

    // 并发检查，但限制并发数
    const chunkSize = 5
    for (let i = 0; i < domains.length; i += chunkSize) {
      const chunk = domains.slice(i, i + chunkSize)

      const chunkResults = await Promise.allSettled(
        chunk.map(domain => this.checkAdsTxt(domain, targetPublisherId))
      )

      chunkResults.forEach((result, index) => {
        const domain = chunk[index]
        if (result.status === 'fulfilled') {
          results.set(domain, result.value)
        } else {
          results.set(domain, {
            found: false,
            url: `https://${domain}/ads.txt`,
            entries: [],
            errors: [`批量检查失败: ${result.reason.message}`],
            lastChecked: new Date().toISOString(),
            googleAdSenseEntries: [],
            isValid: false
          })
        }
      })

      // 添加延迟避免过多并发请求
      if (i + chunkSize < domains.length) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    return results
  }

  generateAdsTxtReport(analysis: AdsTxtAnalysis): string {
    const report = []

    report.push(`=== ads.txt 分析报告 ===`)
    report.push(`文件地址: ${analysis.url}`)
    report.push(`检查时间: ${analysis.lastChecked}`)
    report.push(`文件存在: ${analysis.found ? '是' : '否'}`)

    if (analysis.found) {
      report.push(`总条目数: ${analysis.entries.length}`)
      report.push(`Google AdSense条目: ${analysis.googleAdSenseEntries.length}`)

      if (analysis.googleAdSenseEntries.length > 0) {
        report.push('\n--- Google AdSense 条目 ---')
        analysis.googleAdSenseEntries.forEach(entry => {
          report.push(`${entry.domain}, ${entry.publisherId}, ${entry.relationship}`)
        })
      }
    }

    if (analysis.errors.length > 0) {
      report.push('\n--- 错误信息 ---')
      analysis.errors.forEach(error => report.push(`• ${error}`))
    }

    return report.join('\n')
  }
}