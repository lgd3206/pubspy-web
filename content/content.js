// PubSpy 扩展 - Content Script
// 在网页中检测AdSense Publisher ID

class AdSenseDetector {
    constructor() {
        this.detectedIds = new Set();
        this.init();
    }

    init() {
        // 监听来自popup的消息
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
        });

        // 页面加载完成后自动检测一次
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(() => this.detectAdSenseIds(), 1000);
            });
        } else {
            setTimeout(() => this.detectAdSenseIds(), 1000);
        }
    }

    handleMessage(message, sender, sendResponse) {
        switch (message.action) {
            case 'DETECT_ADSENSE':
                this.detectAdSenseIds()
                    .then(result => {
                        sendResponse({
                            success: true,
                            data: result
                        });
                    })
                    .catch(error => {
                        console.error('AdSense检测失败:', error);
                        sendResponse({
                            success: false,
                            error: error.message
                        });
                    });
                return true; // 保持消息通道开放

            default:
                sendResponse({ success: false, error: '未知操作' });
        }
    }

    async detectAdSenseIds() {
        try {
            // 清空之前的检测结果
            this.detectedIds.clear();

            // 方法1: 检测script标签中的AdSense代码
            this.detectFromScriptTags();

            // 方法2: 检测HTML属性中的AdSense ID
            this.detectFromDataAttributes();

            // 方法3: 检测iframe中的AdSense ID
            this.detectFromIframes();

            // 方法4: 检测页面HTML源码
            this.detectFromPageSource();

            // 方法5: 检测动态加载的广告
            await this.detectDynamicAds();

            const result = {
                ids: Array.from(this.detectedIds),
                url: window.location.href,
                timestamp: new Date().toISOString(),
                detectionMethods: this.getDetectionMethods()
            };

            console.log('AdSense检测结果:', result);
            return result;

        } catch (error) {
            console.error('AdSense检测过程中发生错误:', error);
            return {
                ids: Array.from(this.detectedIds),
                url: window.location.href,
                timestamp: new Date().toISOString(),
                error: error.message
            };
        }
    }

    detectFromScriptTags() {
        const scripts = document.querySelectorAll('script');
        const patterns = [
            // 标准AdSense代码模式
            /ca-pub-(\d{16})/g,
            // Google Ad Manager模式
            /google_ad_client\s*[:=]\s*["']ca-pub-(\d{16})["']/g,
            // AdSense auto ads模式
            /data-ad-client=["']ca-pub-(\d{16})["']/g,
            // 更多AdSense代码变体
            /"client":\s*"ca-pub-(\d{16})"/g,
            /client:\s*'ca-pub-(\d{16})'/g,
            // Google Tag Manager中的AdSense配置
            /'CA-PUB-(\d{16})'/g,
            /"CA-PUB-(\d{16})"/g,
            // AdSense异步加载代码
            /adsbygoogle.*ca-pub-(\d{16})/g,
            // Google Publisher Tag
            /'ca-pub-(\d{16})'/g
        ];

        scripts.forEach(script => {
            const content = script.innerHTML || script.textContent || '';
            // 检查script src属性
            const src = script.src || '';

            patterns.forEach(pattern => {
                // 检查script内容
                const contentMatches = content.match(pattern);
                if (contentMatches) {
                    contentMatches.forEach(match => {
                        const idMatch = match.match(/ca-pub-(\d{16})/i);
                        if (idMatch) {
                            this.detectedIds.add('ca-pub-' + idMatch[1]);
                        }
                    });
                }

                // 检查script src
                const srcMatches = src.match(pattern);
                if (srcMatches) {
                    srcMatches.forEach(match => {
                        const idMatch = match.match(/ca-pub-(\d{16})/i);
                        if (idMatch) {
                            this.detectedIds.add('ca-pub-' + idMatch[1]);
                        }
                    });
                }
            });
        });
    }

    detectFromDataAttributes() {
        // 检测adsbygoogle容器
        const adContainers = document.querySelectorAll('.adsbygoogle, [data-ad-client]');

        adContainers.forEach(container => {
            const adClient = container.getAttribute('data-ad-client');
            if (adClient && adClient.startsWith('ca-pub-')) {
                this.detectedIds.add(adClient);
            }
        });

        // 检测其他可能的数据属性
        const elementsWithDataAttrs = document.querySelectorAll([
            '[data-google-ad-client]',
            '[data-adclient]',
            '[data-ad-publisher]',
            '[data-publisher-id]',
            '[data-adsense-id]',
            '[data-client-id]',
            '[data-google-publisher]'
        ].join(', '));

        elementsWithDataAttrs.forEach(element => {
            const possibleAttributes = [
                'data-google-ad-client',
                'data-adclient',
                'data-ad-publisher',
                'data-publisher-id',
                'data-adsense-id',
                'data-client-id',
                'data-google-publisher'
            ];

            possibleAttributes.forEach(attr => {
                const value = element.getAttribute(attr);
                if (value && (value.startsWith('ca-pub-') || /^\d{16}$/.test(value))) {
                    if (value.startsWith('ca-pub-')) {
                        this.detectedIds.add(value);
                    } else if (/^\d{16}$/.test(value)) {
                        this.detectedIds.add('ca-pub-' + value);
                    }
                }
            });
        });

        // 检测Google Ad Manager和DFP容器
        const dfpContainers = document.querySelectorAll('[id*="dfp"], [id*="gpt"], [class*="dfp"], [class*="gpt"]');
        dfpContainers.forEach(container => {
            const innerHTML = container.innerHTML;
            const textContent = container.textContent;

            [innerHTML, textContent].forEach(content => {
                const matches = content.match(/ca-pub-(\d{16})/g);
                if (matches) {
                    matches.forEach(match => this.detectedIds.add(match));
                }
            });
        });
    }

    detectFromIframes() {
        const iframes = document.querySelectorAll('iframe');

        iframes.forEach(iframe => {
            const src = iframe.src || '';
            const dataAttributes = iframe.dataset || {};

            // 检测AdSense iframe
            if (src.includes('googlesyndication.com') ||
                src.includes('googleadservices.com') ||
                src.includes('doubleclick.net') ||
                src.includes('googletagservices.com')) {

                const match = src.match(/ca-pub-(\d{16})/);
                if (match) {
                    this.detectedIds.add(match[0]);
                }

                // 检查URL参数中的publisher ID
                const urlParams = new URLSearchParams(src.split('?')[1] || '');
                const publisherId = urlParams.get('client') || urlParams.get('publisher');
                if (publisherId && publisherId.startsWith('ca-pub-')) {
                    this.detectedIds.add(publisherId);
                }
            }

            // 检查iframe的data属性
            Object.keys(dataAttributes).forEach(key => {
                const value = dataAttributes[key];
                if (value && value.startsWith('ca-pub-')) {
                    this.detectedIds.add(value);
                }
            });

            // 检查iframe的其他属性
            ['name', 'id', 'title'].forEach(attr => {
                const value = iframe.getAttribute(attr) || '';
                const match = value.match(/ca-pub-(\d{16})/);
                if (match) {
                    this.detectedIds.add(match[0]);
                }
            });
        });
    }

    detectFromPageSource() {
        // 搜索整个页面HTML源码
        const pageHTML = document.documentElement.outerHTML;

        // 增强的正则表达式模式
        const patterns = [
            // 标准ca-pub-ID格式
            /ca-pub-(\d{16})/gi,
            // 在引号中的ID
            /["']ca-pub-(\d{16})["']/gi,
            // JSON格式的ID
            /"client":\s*"ca-pub-(\d{16})"/gi,
            /"publisher":\s*"ca-pub-(\d{16})"/gi,
            // URL参数格式
            /[?&]client=ca-pub-(\d{16})/gi,
            /[?&]publisher=ca-pub-(\d{16})/gi,
            // 特殊格式
            /google_ad_client.*ca-pub-(\d{16})/gi,
            /data-ad-client.*ca-pub-(\d{16})/gi
        ];

        patterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(pageHTML)) !== null) {
                this.detectedIds.add('ca-pub-' + match[1]);
            }
        });

        // 检查页面元数据
        this.detectFromMetaData();

        // 检查CSS样式表
        this.detectFromStylesheets();

        // 检查本地存储
        this.detectFromStorage();
    }

    detectFromMetaData() {
        // 检查meta标签
        const metaTags = document.querySelectorAll('meta[name*="adsense"], meta[name*="google"], meta[property*="adsense"]');
        metaTags.forEach(meta => {
            const content = meta.getAttribute('content') || '';
            const match = content.match(/ca-pub-(\d{16})/);
            if (match) {
                this.detectedIds.add(match[0]);
            }
        });

        // 检查link标签
        const linkTags = document.querySelectorAll('link[href*="adsense"], link[href*="googlesyndication"]');
        linkTags.forEach(link => {
            const href = link.getAttribute('href') || '';
            const match = href.match(/ca-pub-(\d{16})/);
            if (match) {
                this.detectedIds.add(match[0]);
            }
        });
    }

    detectFromStylesheets() {
        // 检查CSS中可能包含的AdSense ID（虽然不常见）
        const stylesheets = Array.from(document.styleSheets);
        stylesheets.forEach(stylesheet => {
            try {
                if (stylesheet.cssRules) {
                    Array.from(stylesheet.cssRules).forEach(rule => {
                        const cssText = rule.cssText || '';
                        const match = cssText.match(/ca-pub-(\d{16})/);
                        if (match) {
                            this.detectedIds.add(match[0]);
                        }
                    });
                }
            } catch (error) {
                // 跨域样式表访问受限，忽略错误
            }
        });
    }

    detectFromStorage() {
        // 检查localStorage和sessionStorage中可能存储的AdSense ID
        try {
            [localStorage, sessionStorage].forEach(storage => {
                for (let i = 0; i < storage.length; i++) {
                    const key = storage.key(i);
                    const value = storage.getItem(key) || '';

                    // 检查键名和值
                    [key, value].forEach(text => {
                        if (text) {
                            const match = text.match(/ca-pub-(\d{16})/);
                            if (match) {
                                this.detectedIds.add(match[0]);
                            }
                        }
                    });
                }
            });
        } catch (error) {
            // 存储访问可能受限，忽略错误
        }
    }

    async detectDynamicAds() {
        // 等待可能的动态广告加载
        return new Promise(resolve => {
            let attempts = 0;
            const maxAttempts = 3;

            const checkDynamic = () => {
                attempts++;

                // 再次检测可能动态添加的元素
                this.detectFromScriptTags();
                this.detectFromDataAttributes();
                this.detectFromIframes();

                if (attempts < maxAttempts) {
                    setTimeout(checkDynamic, 1000);
                } else {
                    resolve();
                }
            };

            setTimeout(checkDynamic, 500);
        });
    }

    getDetectionMethods() {
        return [
            'Script Tags Scanning (Enhanced)',
            'Data Attributes Detection (Extended)',
            'Iframe Source Analysis (Comprehensive)',
            'Page Source Regex (Multi-pattern)',
            'Dynamic Content Monitoring',
            'Meta Data Extraction',
            'CSS Stylesheet Analysis',
            'Local Storage Inspection'
        ];
    }

    // 验证AdSense ID的格式
    isValidAdSenseId(id) {
        return /^ca-pub-\d{16}$/.test(id);
    }

    // 获取页面的基本信息
    getPageInfo() {
        return {
            title: document.title,
            url: window.location.href,
            domain: window.location.hostname,
            language: document.documentElement.lang || 'unknown',
            charset: document.characterSet || 'unknown'
        };
    }

    // 检测ads.txt文件（可选功能）
    async checkAdsTxt() {
        try {
            const domain = window.location.hostname;
            const adsTxtUrl = `${window.location.protocol}//${domain}/ads.txt`;

            const response = await fetch(adsTxtUrl, {
                method: 'GET',
                mode: 'no-cors' // 避免CORS问题
            });

            if (response.ok) {
                const content = await response.text();
                return this.parseAdsTxt(content);
            }
        } catch (error) {
            console.log('无法获取ads.txt文件:', error);
        }

        return null;
    }

    parseAdsTxt(content) {
        const lines = content.split('\n');
        const adSenseEntries = [];

        lines.forEach(line => {
            line = line.trim();
            if (line && !line.startsWith('#')) {
                if (line.includes('google.com') && line.includes('ca-pub-')) {
                    const match = line.match(/ca-pub-(\d{16})/);
                    if (match) {
                        adSenseEntries.push(match[0]);
                    }
                }
            }
        });

        return adSenseEntries;
    }
}

// 创建检测器实例
const adSenseDetector = new AdSenseDetector();

// 监听页面变化（用于SPA应用）
let lastUrl = location.href;
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        // URL变化时重新检测
        setTimeout(() => {
            adSenseDetector.detectAdSenseIds();
        }, 2000);
    }
}).observe(document, { subtree: true, childList: true });

// 页面可见性变化时重新检测
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        setTimeout(() => {
            adSenseDetector.detectAdSenseIds();
        }, 1000);
    }
});

console.log('PubSpy Content Script 已加载');