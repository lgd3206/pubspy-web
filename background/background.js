// PubSpy 扩展 - Background Service Worker
// 处理API调用和数据管理

class PubSpyBackground {
    constructor() {
        this.cache = new Map();
        this.apiConfig = {
            // Google Custom Search API配置
            googleSearchApiKey: 'AIzaSyBbFGJoRkDNLcnxOWa0bR2P2LmV4UcQ6fI',
            searchEngineId: 'a7e40e30b98524b39',
            builtWithApiKey: '' // 可选
        };

        this.init();
    }

    init() {
        // 监听来自popup的消息
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true; // 保持消息通道开放
        });

        // 监听扩展安装/更新
        chrome.runtime.onInstalled.addListener((details) => {
            this.handleInstall(details);
        });

        console.log('PubSpy Background Service Worker 已启动');
    }

    async handleMessage(message, sender, sendResponse) {
        try {
            switch (message.action) {
                case 'SEARCH_DOMAINS':
                    const searchResult = await this.searchDomainsByPublisherId(message.data.publisherId);
                    sendResponse({
                        success: true,
                        data: searchResult
                    });
                    break;

                case 'GET_API_CONFIG':
                    sendResponse({
                        success: true,
                        data: await this.getApiConfig()
                    });
                    break;

                case 'SET_API_CONFIG':
                    await this.setApiConfig(message.data);
                    sendResponse({ success: true });
                    break;

                case 'CLEAR_CACHE':
                    this.clearCache();
                    sendResponse({ success: true });
                    break;

                default:
                    sendResponse({
                        success: false,
                        error: '未知操作'
                    });
            }
        } catch (error) {
            console.error('Background处理消息失败:', error);
            sendResponse({
                success: false,
                error: error.message
            });
        }
    }

    handleInstall(details) {
        if (details.reason === 'install') {
            console.log('PubSpy 扩展首次安装');
            this.initializeSettings();
        } else if (details.reason === 'update') {
            console.log('PubSpy 扩展已更新到版本:', chrome.runtime.getManifest().version);
        }
    }

    async initializeSettings() {
        // 初始化默认设置
        const defaultSettings = {
            autoDetect: true,
            cacheEnabled: true,
            maxCacheSize: 1000,
            apiRetryAttempts: 3,
            exportFormat: 'csv'
        };

        await chrome.storage.local.set({ settings: defaultSettings });
    }

    async searchDomainsByPublisherId(publisherId) {
        try {
            // 检查缓存
            const cacheKey = `domains_${publisherId}`;
            if (this.cache.has(cacheKey)) {
                console.log('从缓存返回结果:', publisherId);
                return this.cache.get(cacheKey);
            }

            // 获取API配置
            const config = await this.getApiConfig();

            let domains = [];

            // 方法1: 使用Google Custom Search API
            if (config.googleSearchApiKey && config.searchEngineId) {
                domains = await this.searchWithGoogleAPI(publisherId, config);
            } else {
                // 备用方法: 模拟搜索（仅供测试）
                domains = await this.mockSearch(publisherId);
            }

            // 验证域名
            const verifiedDomains = await this.verifyDomains(domains, publisherId);

            // 缓存结果
            this.cache.set(cacheKey, {
                domains: verifiedDomains,
                timestamp: Date.now(),
                publisherId: publisherId
            });

            return {
                domains: verifiedDomains,
                timestamp: Date.now(),
                publisherId: publisherId,
                source: config.googleSearchApiKey ? 'google_api' : 'mock'
            };

        } catch (error) {
            console.error('域名搜索失败:', error);
            throw error;
        }
    }

    async searchWithGoogleAPI(publisherId, config) {
        try {
            console.log(`开始使用Google API搜索Publisher ID: ${publisherId}`);

            // 扩展搜索策略，多种查询方式
            const searchQueries = [
                // 基础搜索
                `"${publisherId}"`,
                `"${publisherId.replace('ca-pub-', '')}"`,

                // AdSense代码搜索
                `"google_ad_client" "${publisherId}"`,
                `"data-ad-client" "${publisherId}"`,
                `"google_ad_client=${publisherId}"`,

                // 不同格式的搜索
                `"googlesyndication.com" "${publisherId}"`,
                `"adsbygoogle" "${publisherId}"`,

                // ads.txt文件搜索
                `"ads.txt" "${publisherId}"`,
                `"ads.txt" "${publisherId.replace('ca-pub-', '')}"`,
            ];

            const allResults = [];

            for (const query of searchQueries) {
                try {
                    console.log(`搜索查询: ${query}`);

                    const url = `https://www.googleapis.com/customsearch/v1?key=${config.googleSearchApiKey}&cx=${config.searchEngineId}&q=${encodeURIComponent(query)}&num=10`;

                    const response = await fetch(url);

                    if (!response.ok) {
                        console.error(`Google API错误: ${response.status} ${response.statusText}`);
                        continue;
                    }

                    const data = await response.json();

                    if (data.items) {
                        console.log(`查询"${query}"找到${data.items.length}个结果`);
                        allResults.push(...this.parseGoogleSearchResults(data));
                    }

                    // 适当延迟避免API限制
                    await new Promise(resolve => setTimeout(resolve, 300));

                    // 如果已经找到足够多的结果，可以提前结束
                    if (allResults.length >= 30) {
                        console.log('已找到足够多的候选域名，停止搜索');
                        break;
                    }

                } catch (error) {
                    console.error(`查询失败: ${query}`, error);
                    continue;
                }
            }

            console.log(`Google API搜索完成，共找到${allResults.length}个候选结果`);

            // 去重
            const uniqueResults = this.deduplicateDomains(allResults);
            console.log(`去重后剩余${uniqueResults.length}个域名`);

            return uniqueResults;

        } catch (error) {
            console.error('Google搜索API调用失败:', error);
            throw error;
        }
    }

    parseGoogleSearchResults(data) {
        if (!data.items) {
            return [];
        }

        return data.items.map(item => {
            const domain = this.extractDomain(item.link);
            return {
                domain: domain,
                title: this.cleanTitle(item.title),
                snippet: item.snippet,
                url: item.link,
                verified: false, // 需要进一步验证
                source: 'Google Search API'
            };
        }).filter(item => item.domain && !this.isInvalidDomain(item.domain));
    }

    cleanTitle(title) {
        // 清理标题，移除多余字符
        return title.replace(/\s+/g, ' ').trim().substring(0, 100);
    }

    isInvalidDomain(domain) {
        // 过滤掉无效或不相关的域名
        const invalidDomains = [
            'google.com', 'youtube.com', 'facebook.com', 'twitter.com',
            'github.com', 'stackoverflow.com', 'linkedin.com'
        ];
        return invalidDomains.some(invalid => domain.includes(invalid));
    }

    deduplicateDomains(domains) {
        const seen = new Set();
        return domains.filter(domain => {
            const key = domain.domain.toLowerCase();
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }

    extractDomain(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname.replace(/^www\./, '');
        } catch (error) {
            return null;
        }
    }

    async verifyDomains(domains, publisherId) {
        // 限制验证数量避免过多请求
        const domainsToVerify = domains.slice(0, 8);
        const verified = [];

        console.log(`开始验证${domainsToVerify.length}个域名...`);

        for (const domain of domainsToVerify) {
            try {
                console.log(`验证域名: ${domain.domain}`);

                const isValid = await this.verifyDomain(domain.domain, publisherId);

                verified.push({
                    ...domain,
                    verified: isValid.verified,
                    verificationMethod: isValid.method,
                    lastChecked: new Date().toISOString()
                });

                // 避免请求过于频繁
                await new Promise(resolve => setTimeout(resolve, 800));

            } catch (error) {
                console.error(`验证域名${domain.domain}失败:`, error);
                verified.push({
                    ...domain,
                    verified: false,
                    verificationMethod: 'error',
                    error: error.message
                });
            }
        }

        const verifiedCount = verified.filter(d => d.verified).length;
        console.log(`域名验证完成: ${verifiedCount}/${verified.length} 验证成功`);

        return verified;
    }

    async verifyDomain(domain, publisherId) {
        try {
            // 方法1: 检查ads.txt文件
            console.log(`检查${domain}的ads.txt文件...`);
            const adsTxtResult = await this.checkAdsTxt(domain, publisherId);
            if (adsTxtResult) {
                return { verified: true, method: 'ads.txt' };
            }

            // 方法2: 检查主页HTML内容（由于CORS限制，这个可能不总是有效）
            console.log(`尝试检查${domain}的主页内容...`);
            const htmlResult = await this.checkHomepageContent(domain, publisherId);
            if (htmlResult) {
                return { verified: true, method: 'homepage' };
            }

            return { verified: false, method: 'none' };

        } catch (error) {
            console.error(`验证${domain}时出错:`, error);
            return { verified: false, method: 'error' };
        }
    }

    async checkAdsTxt(domain, publisherId) {
        try {
            const adsTxtUrl = `https://${domain}/ads.txt`;
            const response = await fetch(adsTxtUrl, {
                method: 'GET',
                signal: AbortSignal.timeout(5000), // 5秒超时
                mode: 'cors' // 尝试CORS请求
            });

            if (response.ok) {
                const content = await response.text();
                // 检查是否包含Google AdSense相关条目
                const hasGoogleAdsense = content.includes('google.com') &&
                                         (content.includes(publisherId) ||
                                          content.includes(publisherId.replace('ca-pub-', '')));

                if (hasGoogleAdsense) {
                    console.log(`✅ ${domain} ads.txt验证成功`);
                    return true;
                }
            }

            return false;
        } catch (error) {
            console.log(`❌ ${domain} ads.txt检查失败:`, error.message);
            return false;
        }
    }

    async checkHomepageContent(domain, publisherId) {
        try {
            // 注意：由于CORS限制，这个方法可能在某些域名上失败
            const homeUrl = `https://${domain}`;
            const response = await fetch(homeUrl, {
                method: 'GET',
                signal: AbortSignal.timeout(8000),
                mode: 'cors'
            });

            if (response.ok) {
                const content = await response.text();

                // 检查多种AdSense代码模式
                const patterns = [
                    publisherId,
                    publisherId.replace('ca-pub-', ''),
                    `google_ad_client.*${publisherId}`,
                    `data-ad-client.*${publisherId}`
                ];

                for (const pattern of patterns) {
                    if (content.includes(pattern)) {
                        console.log(`✅ ${domain} 主页内容验证成功`);
                        return true;
                    }
                }
            }

            return false;
        } catch (error) {
            console.log(`❌ ${domain} 主页检查失败 (可能是CORS限制):`, error.message);
            return false;
        }
    }

    async mockSearch(publisherId) {
        // 模拟搜索结果（仅供测试使用）
        console.log('使用模拟搜索:', publisherId);

        const mockDomains = [
            { domain: 'example-blog.com', title: '示例博客网站', verified: true },
            { domain: 'test-news.org', title: '测试新闻网站', verified: false },
            { domain: 'sample-site.net', title: '样例网站', verified: true },
            { domain: 'demo-portal.info', title: '演示门户网站', verified: false }
        ];

        // 模拟API延迟
        await new Promise(resolve => setTimeout(resolve, 1500));

        return mockDomains.map(domain => ({
            ...domain,
            url: `https://${domain.domain}`,
            snippet: `包含AdSense ID ${publisherId}的网站`,
            publisherId: publisherId
        }));
    }

    async getApiConfig() {
        try {
            const result = await chrome.storage.local.get('apiConfig');
            return result.apiConfig || this.apiConfig;
        } catch (error) {
            console.error('获取API配置失败:', error);
            return this.apiConfig;
        }
    }

    async setApiConfig(config) {
        try {
            this.apiConfig = { ...this.apiConfig, ...config };
            await chrome.storage.local.set({ apiConfig: this.apiConfig });
        } catch (error) {
            console.error('保存API配置失败:', error);
            throw error;
        }
    }

    clearCache() {
        this.cache.clear();
        console.log('缓存已清空');
    }

    // 定期清理过期缓存
    startCacheCleanup() {
        setInterval(() => {
            const now = Date.now();
            const maxAge = 24 * 60 * 60 * 1000; // 24小时

            for (const [key, value] of this.cache.entries()) {
                if (now - value.timestamp > maxAge) {
                    this.cache.delete(key);
                    console.log('清理过期缓存:', key);
                }
            }
        }, 60 * 60 * 1000); // 每小时检查一次
    }

    // 获取扩展统计信息
    async getStats() {
        try {
            const result = await chrome.storage.local.get('stats');
            return result.stats || {
                detectionsCount: 0,
                searchesCount: 0,
                domainsFound: 0,
                lastUsed: null
            };
        } catch (error) {
            console.error('获取统计信息失败:', error);
            return null;
        }
    }

    // 更新统计信息
    async updateStats(type, count = 1) {
        try {
            const stats = await this.getStats();
            stats[type] = (stats[type] || 0) + count;
            stats.lastUsed = new Date().toISOString();
            await chrome.storage.local.set({ stats });
        } catch (error) {
            console.error('更新统计信息失败:', error);
        }
    }

    // 处理错误并记录
    handleError(error, context) {
        console.error(`PubSpy错误 [${context}]:`, error);

        // 可以在这里添加错误报告逻辑
        // 例如发送到分析服务
    }
}

// 创建背景服务实例
const pubSpyBackground = new PubSpyBackground();

// 启动缓存清理
pubSpyBackground.startCacheCleanup();