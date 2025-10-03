import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    console.log('开始测试Google API配置...')

    const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY
    const GOOGLE_CX = process.env.GOOGLE_CX

    // 检查环境变量是否存在
    if (!GOOGLE_API_KEY || !GOOGLE_CX) {
      return NextResponse.json({
        success: false,
        error: 'API配置缺失',
        details: {
          hasApiKey: !!GOOGLE_API_KEY,
          hasCx: !!GOOGLE_CX,
          apiKeyLength: GOOGLE_API_KEY?.length || 0,
          cxLength: GOOGLE_CX?.length || 0
        }
      })
    }

    console.log(`API Key长度: ${GOOGLE_API_KEY.length}`)
    console.log(`CX长度: ${GOOGLE_CX.length}`)
    console.log(`API Key前缀: ${GOOGLE_API_KEY.substring(0, 10)}...`)
    console.log(`CX: ${GOOGLE_CX}`)

    // 进行一个简单的测试查询
    const testQuery = 'test'
    const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_CX}&q=${encodeURIComponent(testQuery)}&num=1`

    console.log('发起测试请求...')

    // 尝试多次请求以克服网络问题
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; PubSpy/1.0)',
          },
          signal: AbortSignal.timeout(15000) // 增加到15秒超时
        })

        console.log(`第${attempt}次尝试，API响应状态: ${response.status}`)

        if (!response.ok) {
          const errorText = await response.text()
          console.error('API错误响应:', errorText)

          // 如果是最后一次尝试，返回错误
          if (attempt === 3) {
            return NextResponse.json({
              success: false,
              error: `Google API错误: ${response.status} ${response.statusText}`,
              details: {
                status: response.status,
                statusText: response.statusText,
                errorResponse: errorText,
                hasApiKey: true,
                hasCx: true,
                apiKeyLength: GOOGLE_API_KEY.length,
                cxLength: GOOGLE_CX.length,
                attempts: attempt
              }
            })
          }

          // 等待后重试
          await new Promise(resolve => setTimeout(resolve, 2000))
          continue
        }

        const data = await response.json()
        console.log('API测试成功，响应数据:', JSON.stringify(data, null, 2))

        return NextResponse.json({
          success: true,
          message: 'Google API配置正常',
          details: {
            hasApiKey: true,
            hasCx: true,
            apiKeyLength: GOOGLE_API_KEY.length,
            cxLength: GOOGLE_CX.length,
            responseItems: data.items?.length || 0,
            totalResults: data.searchInformation?.totalResults || '0',
            searchTime: data.searchInformation?.searchTime || '0',
            attempts: attempt
          }
        })

      } catch (error) {
        console.error(`第${attempt}次尝试失败:`, error)

        // 如果是最后一次尝试，抛出错误
        if (attempt === 3) {
          throw error
        }

        // 等待后重试
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    }

  } catch (error) {
    console.error('API测试失败:', error)

    return NextResponse.json({
      success: false,
      error: 'API测试异常',
      details: {
        errorMessage: error.message,
        errorType: error.name,
        stack: error.stack
      }
    })
  }
}