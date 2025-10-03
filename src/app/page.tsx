'use client'

import { useState } from 'react'

interface AdSenseResult {
  ids: string[]
  domains: Array<{
    domain: string
    title: string
    verified: boolean
    source?: string
    verificationMethod?: string
    lastChecked?: string
    searchQuery?: string
  }>
  pageInfo?: {
    domain: string
  }
}

export default function Home() {
  const [url, setUrl] = useState('')
  const [manualId, setManualId] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('')
  const [result, setResult] = useState<AdSenseResult | null>(null)
  const [error, setError] = useState('')
  const [apiTestResult, setApiTestResult] = useState<any>(null)

  const analyzeUrl = async () => {
    if (!url) return

    setLoading(true)
    setError('')
    setResult(null)
    setLoadingMessage('正在获取网页内容...')

    try {
      const messageInterval = setInterval(() => {
        const messages = [
          '正在获取网页内容...',
          '正在分析网页结构...',
          '正在检测AdSense代码...',
          '正在搜索相关域名...',
          '正在验证搜索结果...'
        ]
        const currentIndex = messages.findIndex(msg => msg === loadingMessage)
        const nextIndex = (currentIndex + 1) % messages.length
        setLoadingMessage(messages[nextIndex])
      }, 2000)

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      })

      clearInterval(messageInterval)
      const data = await response.json()

      if (data.success) {
        setResult(data.data)
        setLoadingMessage('')
      } else {
        setError(data.error || '服务器错误')
      }
    } catch (err) {
      setError('网络错误')
    } finally {
      setLoading(false)
      setLoadingMessage('')
    }
  }

  const searchManualId = async () => {
    if (!manualId) return

    setLoading(true)
    setError('')
    setResult(null)
    setLoadingMessage('正在搜索AdSense ID...')

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publisherId: manualId })
      })

      const data = await response.json()

      if (data.success) {
        setResult({
          ids: [data.data.publisherId],
          domains: data.data.domains,
          pageInfo: {
            domain: 'manual-search'
          }
        })
      } else {
        setError(data.error || '服务器错误')
      }
    } catch (err) {
      setError('网络错误')
    } finally {
      setLoading(false)
      setLoadingMessage('')
    }
  }

  const testApiConfig = async () => {
    try {
      setLoading(true)
      setApiTestResult(null)

      const response = await fetch('/api/test-api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      const data = await response.json()
      setApiTestResult(data)

    } catch (err) {
      setApiTestResult({
        success: false,
        error: 'API测试请求失败',
        details: { message: err.message }
      })
    } finally {
      setLoading(false)
    }
  }

  const exportCSV = () => {
    if (!result?.domains.length) return

    const csvContent = [
      ['域名', 'AdSense ID', '验证状态', '来源'],
      ...result.domains.map(domain => [
        domain.domain,
        domain.title || '无标题',
        domain.verified ? '已验证' : '未验证',
        domain.source || ''
      ])
    ].map(row => row.join(',')).join('\n')

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `adsense-domains-${Date.now()}.csv`
    link.click()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <header className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <span className="text-4xl mr-3">🔍</span>
            <h1 className="text-3xl font-bold text-gray-900">PubSpy - AdSense检测工具</h1>
          </div>
          <p className="text-gray-600 text-lg">强大的AdSense Publisher ID检测和分析工具</p>
        </header>

        {/* Manual Search Section */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <span className="text-2xl mr-2">🎯</span>
            手动搜索AdSense ID
          </h2>

          <div className="flex gap-3">
            <input
              type="text"
              value={manualId}
              onChange={(e) => setManualId(e.target.value)}
              placeholder="输入AdSense ID (如: ca-pub-1234567890123456)"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
            <button
              onClick={searchManualId}
              disabled={loading || !manualId}
              className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <span className="animate-spin">⟳</span>
              ) : (
                <span>🎯</span>
              )}
              {loading ? '搜索中...' : '搜索'}
            </button>
          </div>

          <p className="text-gray-500 text-sm mt-2">
            直接搜索指定的AdSense Publisher ID，查找使用该ID的相关域名
          </p>
        </div>

        {/* URL Input */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <span className="text-2xl mr-2">🔍</span>
            网站AdSense分析
          </h2>

          <div className="flex gap-3">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="输入网站URL (如: https://example.com)"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              onClick={analyzeUrl}
              disabled={loading || !url}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <span className="animate-spin">⟳</span>
              ) : (
                <span>🔍</span>
              )}
              {loading ? '分析中...' : '分析'}
            </button>
          </div>
        </div>

        {/* Loading Message */}
        {loading && loadingMessage && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-blue-700 flex items-center">
              <span className="animate-spin mr-2">⟳</span>
              {loadingMessage}
            </p>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-700">❌ {error}</p>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-6">
            {/* AdSense IDs */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold mb-4">检测到的AdSense ID</h3>
              {result.ids.length > 0 ? (
                <div className="space-y-2">
                  {result.ids.map((id, index) => (
                    <div key={index} className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
                      <span className="text-green-600">✅</span>
                      <code className="text-sm font-mono flex-1">{id}</code>
                      <button
                        onClick={() => navigator.clipboard.writeText(id)}
                        className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded"
                        title="复制"
                      >
                        📋 复制
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="text-6xl mb-4">🔍</div>
                  <p className="text-gray-500 text-lg">未检测到AdSense ID</p>
                  <p className="text-gray-400 text-sm mt-2">
                    该网站可能没有使用Google AdSense或使用了其他广告服务
                  </p>
                </div>
              )}
            </div>

            {/* Related Domains */}
            {result.domains.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6">
                {/* Mock Data Notice */}
                {result.domains.some(d => d.source === 'mock-search') && (
                  <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-amber-800 text-sm">
                      <span className="font-semibold">⚠️ 提示：</span>
                      当前显示的是模拟数据示例。要获取真实搜索结果，请联系管理员配置Google Custom Search API。
                    </p>
                  </div>
                )}

                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold">
                    相关域名 ({result.domains.length})
                  </h3>
                  <button
                    onClick={exportCSV}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 transition-colors"
                  >
                    <span>📥</span>
                    导出CSV
                  </button>
                </div>

                <div className="space-y-3">
                  {result.domains.map((domain, index) => (
                    <div key={index} className="p-4 border border-gray-200 rounded-lg hover:shadow-sm transition-shadow">
                      <div className="flex justify-between items-start mb-2">
                        <a
                          href={`https://${domain.domain}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 font-medium hover:underline"
                        >
                          {domain.domain}
                        </a>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            domain.verified
                              ? 'bg-green-100 text-green-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {domain.verified ? '✅ 已验证' : '❓ 未验证'}
                          </span>
                          {domain.verificationMethod && (
                            <span className="text-xs text-gray-500 px-2 py-1 bg-gray-100 rounded">
                              {domain.verificationMethod}
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-gray-600 text-sm">{domain.title || '无标题'}</p>
                      {domain.source && (
                        <p className="text-gray-400 text-xs mt-1">
                          来源: {domain.source} | {domain.lastChecked ? new Date(domain.lastChecked).toLocaleString() : ''}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* API Test Section */}
        <div className="bg-blue-50 rounded-lg p-4 mb-6">
          <h4 className="font-semibold text-blue-800 mb-3">🔧 API配置测试</h4>
          <p className="text-blue-700 text-sm mb-3">
            点击下面的按钮测试Google Custom Search API是否配置正确：
          </p>
          <button
            onClick={testApiConfig}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            disabled={loading}
          >
            {loading ? '测试中...' : '🔍 测试API配置'}
          </button>

          {apiTestResult && (
            <div className="mt-4 p-4 bg-white rounded border">
              <h5 className="font-semibold mb-2">API配置测试结果</h5>
              <div className={`p-3 rounded mb-3 ${
                apiTestResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
              }`}>
                <p className={`font-semibold ${
                  apiTestResult.success ? 'text-green-800' : 'text-red-800'
                }`}>
                  {apiTestResult.success ? '✅ API配置正常 - 将获取真实搜索数据' : '❌ API配置问题 - 当前使用模拟数据'}
                </p>
                {apiTestResult.error && (
                  <p className="text-red-700 text-sm mt-1">{apiTestResult.error}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="text-center mt-12 text-gray-500">
          <p>PubSpy - AdSense Publisher ID检测工具 |
            <a href="https://github.com/lgd3206/pubspy-web" target="_blank" className="hover:text-gray-700 underline ml-1">
              GitHub
            </a>
          </p>
        </footer>
      </div>
    </div>
  )
}