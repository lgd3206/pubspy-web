interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number // Time to live in milliseconds
}

interface CacheStats {
  hits: number
  misses: number
  entries: number
  hitRate: number
}

export class IntelligentCache {
  private cache = new Map<string, CacheEntry<any>>()
  private stats = { hits: 0, misses: 0 }

  // 缓存时间配置 (毫秒)
  private readonly TTL_CONFIG = {
    adsenseSearch: 30 * 60 * 1000, // 30分钟 - AdSense搜索结果
    adsTxtCheck: 24 * 60 * 60 * 1000, // 24小时 - ads.txt检查结果
    htmlAnalysis: 60 * 60 * 1000, // 1小时 - HTML分析结果
    domainVerification: 12 * 60 * 60 * 1000, // 12小时 - 域名验证结果
    apiResponse: 5 * 60 * 1000 // 5分钟 - API响应
  }

  async get<T>(key: string, fetchFunction: () => Promise<T>, cacheType: keyof typeof this.TTL_CONFIG = 'apiResponse'): Promise<T> {
    const cachedEntry = this.cache.get(key)
    const now = Date.now()

    // 检查缓存是否存在且未过期
    if (cachedEntry && (now - cachedEntry.timestamp) < cachedEntry.ttl) {
      this.stats.hits++
      console.log(`🎯 缓存命中: ${key}`)
      return cachedEntry.data
    }

    // 缓存未命中或已过期，重新获取数据
    this.stats.misses++
    console.log(`🔍 缓存未命中，重新获取: ${key}`)

    try {
      const data = await fetchFunction()

      // 存储到缓存
      this.cache.set(key, {
        data,
        timestamp: now,
        ttl: this.TTL_CONFIG[cacheType]
      })

      console.log(`💾 数据已缓存: ${key} (TTL: ${this.TTL_CONFIG[cacheType]}ms)`)
      return data
    } catch (error) {
      // 如果有过期的缓存数据，在网络错误时返回过期数据
      if (cachedEntry) {
        console.log(`⚠️ 网络错误，返回过期缓存: ${key}`)
        this.stats.hits++
        return cachedEntry.data
      }
      throw error
    }
  }

  set<T>(key: string, data: T, cacheType: keyof typeof this.TTL_CONFIG = 'apiResponse'): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: this.TTL_CONFIG[cacheType]
    })
    console.log(`💾 手动缓存: ${key}`)
  }

  delete(key: string): boolean {
    const deleted = this.cache.delete(key)
    if (deleted) {
      console.log(`🗑️ 缓存删除: ${key}`)
    }
    return deleted
  }

  clear(): void {
    this.cache.clear()
    this.stats = { hits: 0, misses: 0 }
    console.log('🧹 缓存已清空')
  }

  // 清理过期缓存
  cleanup(): number {
    const now = Date.now()
    let deletedCount = 0

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp >= entry.ttl) {
        this.cache.delete(key)
        deletedCount++
      }
    }

    if (deletedCount > 0) {
      console.log(`🧹 清理了${deletedCount}个过期缓存条目`)
    }

    return deletedCount
  }

  // 获取缓存统计信息
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      entries: this.cache.size,
      hitRate: total > 0 ? (this.stats.hits / total) * 100 : 0
    }
  }

  // 生成缓存键
  static generateKey(prefix: string, ...params: (string | number)[]): string {
    return `${prefix}:${params.join(':')}`.toLowerCase()
  }

  // 预热缓存 - 为常见查询预加载数据
  async warmup(commonQueries: Array<{ key: string, fetchFn: () => Promise<any>, type: keyof typeof this.TTL_CONFIG }>): Promise<void> {
    console.log(`🔥 开始缓存预热，${commonQueries.length}个查询...`)

    const results = await Promise.allSettled(
      commonQueries.map(async ({ key, fetchFn, type }) => {
        try {
          const data = await fetchFn()
          this.set(key, data, type)
        } catch (error) {
          console.error(`预热失败: ${key}`, error)
        }
      })
    )

    const successCount = results.filter(r => r.status === 'fulfilled').length
    console.log(`🔥 缓存预热完成: ${successCount}/${commonQueries.length} 成功`)
  }

  // 导出缓存数据（用于持久化）
  export(): string {
    const cacheData = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      ...entry
    }))

    return JSON.stringify({
      data: cacheData,
      stats: this.stats,
      exportTime: Date.now()
    })
  }

  // 导入缓存数据（从持久化恢复）
  import(jsonData: string): number {
    try {
      const imported = JSON.parse(jsonData)
      const now = Date.now()
      let validCount = 0

      imported.data.forEach(({ key, data, timestamp, ttl }) => {
        // 只导入未过期的数据
        if (now - timestamp < ttl) {
          this.cache.set(key, { data, timestamp, ttl })
          validCount++
        }
      })

      // 恢复统计信息
      if (imported.stats) {
        this.stats = imported.stats
      }

      console.log(`📥 缓存导入完成: ${validCount}个有效条目`)
      return validCount
    } catch (error) {
      console.error('缓存导入失败:', error)
      return 0
    }
  }
}

// 全局缓存实例
export const globalCache = new IntelligentCache()

// 定期清理过期缓存
if (typeof window !== 'undefined') {
  setInterval(() => {
    globalCache.cleanup()
  }, 10 * 60 * 1000) // 每10分钟清理一次
}