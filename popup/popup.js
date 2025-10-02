// PubSpy 扩展 - Popup JavaScript

class PubSpyPopup {
    constructor() {
        this.currentTab = null;
        this.adSenseIds = [];
        this.relatedDomains = [];
        this.isSearching = false;

        this.initializeElements();
        this.bindEvents();
        this.loadCurrentTab();
    }

    initializeElements() {
        // 获取页面元素
        this.elements = {
            // 当前网站信息
            siteUrlValue: document.getElementById('site-url-value'),
            detectionLoading: document.getElementById('detection-loading'),
            adSenseResult: document.getElementById('adsense-result'),
            adSenseIds: document.getElementById('adsense-ids'),
            noAdSense: document.getElementById('no-adsense'),

            // 相关域名
            domainCount: document.getElementById('domain-count'),
            searchBtn: document.getElementById('search-btn'),
            domainsContainer: document.getElementById('domains-container'),
            domainsPlaceholder: document.getElementById('domains-placeholder'),
            domainsLoading: document.getElementById('domains-loading'),
            domainsList: document.getElementById('domains-list'),
            domainsError: document.getElementById('domains-error'),

            // 操作按钮
            exportBtn: document.getElementById('export-btn'),
            refreshBtn: document.getElementById('refresh-btn'),

            // 统计信息
            detectedCount: document.getElementById('detected-count'),
            foundCount: document.getElementById('found-count')
        };
    }

    bindEvents() {
        // 绑定按钮事件
        this.elements.searchBtn.addEventListener('click', () => this.searchRelatedDomains());
        this.elements.exportBtn.addEventListener('click', () => this.exportToCSV());
        this.elements.refreshBtn.addEventListener('click', () => this.refreshDetection());

        // 监听来自content script的消息
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
        });
    }

    async loadCurrentTab() {
        try {
            // 获取当前活动标签页
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            this.currentTab = tab;

            // 更新UI显示当前网站
            this.updateCurrentSiteInfo(tab);

            // 开始检测AdSense ID
            this.detectAdSenseIDs();

        } catch (error) {
            console.error('获取当前标签页失败:', error);
            this.showError('无法获取当前网站信息');
        }
    }

    updateCurrentSiteInfo(tab) {
        if (!tab || !tab.url) {
            this.elements.siteUrlValue.textContent = '无法获取网站信息';
            return;
        }

        try {
            const url = new URL(tab.url);
            this.elements.siteUrlValue.textContent = url.hostname;
        } catch (error) {
            this.elements.siteUrlValue.textContent = '无效的网址';
        }
    }

    async detectAdSenseIDs() {
        try {
            // 显示检测加载状态
            this.showDetectionLoading();

            // 向content script发送检测请求
            const response = await this.sendMessageToTab('DETECT_ADSENSE');

            if (response && response.success) {
                this.handleAdSenseDetectionResult(response.data);
            } else {
                this.showNoAdSense();
            }

        } catch (error) {
            console.error('AdSense检测失败:', error);
            this.showNoAdSense();
        }
    }

    async sendMessageToTab(action, data = {}) {
        if (!this.currentTab || !this.currentTab.id) {
            throw new Error('没有可用的标签页');
        }

        return new Promise((resolve, reject) => {
            chrome.tabs.sendMessage(this.currentTab.id, { action, data }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(response);
                }
            });
        });
    }

    handleAdSenseDetectionResult(data) {
        if (data.ids && data.ids.length > 0) {
            this.adSenseIds = data.ids;
            this.showAdSenseIds(data.ids);
            this.updateStats();
            this.enableSearchButton();
        } else {
            this.showNoAdSense();
        }
    }

    showDetectionLoading() {
        this.elements.detectionLoading.style.display = 'flex';
        this.elements.adSenseIds.style.display = 'none';
        this.elements.noAdSense.style.display = 'none';
    }

    showAdSenseIds(ids) {
        this.elements.detectionLoading.style.display = 'none';
        this.elements.noAdSense.style.display = 'none';
        this.elements.adSenseIds.style.display = 'block';

        // 清空现有内容
        this.elements.adSenseIds.innerHTML = '';

        // 添加每个AdSense ID
        ids.forEach(id => {
            const idElement = this.createAdSenseIdElement(id);
            this.elements.adSenseIds.appendChild(idElement);
        });
    }

    createAdSenseIdElement(id) {
        const div = document.createElement('div');
        div.className = 'adsense-id';
        div.innerHTML = `
            <span class="adsense-id-value">${id}</span>
            <span class="adsense-id-status">✅</span>
        `;
        return div;
    }

    showNoAdSense() {
        this.elements.detectionLoading.style.display = 'none';
        this.elements.adSenseIds.style.display = 'none';
        this.elements.noAdSense.style.display = 'flex';
        this.disableSearchButton();
    }

    enableSearchButton() {
        this.elements.searchBtn.disabled = false;
    }

    disableSearchButton() {
        this.elements.searchBtn.disabled = true;
    }

    async searchRelatedDomains() {
        if (this.isSearching || this.adSenseIds.length === 0) {
            return;
        }

        this.isSearching = true;
        this.showDomainsLoading();

        try {
            // 使用第一个AdSense ID进行搜索
            const publisherId = this.adSenseIds[0];

            // 向background script发送搜索请求
            const response = await this.sendMessageToBackground('SEARCH_DOMAINS', { publisherId });

            if (response && response.success) {
                this.handleDomainsSearchResult(response.data);
            } else {
                this.showDomainsError();
            }

        } catch (error) {
            console.error('域名搜索失败:', error);
            this.showDomainsError();
        } finally {
            this.isSearching = false;
        }
    }

    async sendMessageToBackground(action, data = {}) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action, data }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(response);
                }
            });
        });
    }

    showDomainsLoading() {
        this.elements.domainsPlaceholder.style.display = 'none';
        this.elements.domainsList.style.display = 'none';
        this.elements.domainsError.style.display = 'none';
        this.elements.domainsLoading.style.display = 'flex';
    }

    handleDomainsSearchResult(data) {
        if (data.domains && data.domains.length > 0) {
            this.relatedDomains = data.domains;
            this.showDomainsList(data.domains);
            this.updateStats();
            this.enableExportButton();
        } else {
            this.showDomainsEmpty();
        }
    }

    showDomainsList(domains) {
        this.elements.domainsLoading.style.display = 'none';
        this.elements.domainsPlaceholder.style.display = 'none';
        this.elements.domainsError.style.display = 'none';
        this.elements.domainsList.style.display = 'block';

        // 清空现有内容
        this.elements.domainsList.innerHTML = '';

        // 添加API信息提示
        const apiInfo = document.createElement('div');
        apiInfo.className = 'api-info';
        apiInfo.innerHTML = `
            <div class="api-status">
                <span class="status-icon">🚀</span>
                <span class="status-text">使用Google Search API实时搜索</span>
            </div>
        `;
        this.elements.domainsList.appendChild(apiInfo);

        // 添加每个域名
        domains.forEach(domain => {
            const domainElement = this.createDomainElement(domain);
            this.elements.domainsList.appendChild(domainElement);
        });

        // 更新域名数量
        this.elements.domainCount.textContent = `(${domains.length})`;
    }

    createDomainElement(domain) {
        const div = document.createElement('div');
        div.className = 'domain-item';

        const statusClass = domain.verified ? 'verified' : 'unverified';
        const statusText = domain.verified ? '✅ 已验证' : '⏳ 待验证';
        const verificationMethod = domain.verificationMethod ? ` (${domain.verificationMethod})` : '';
        const sourceInfo = domain.source === 'Google Search API' ? ' 🔍 API搜索' : '';

        div.innerHTML = `
            <div class="domain-header">
                <a href="https://${domain.domain}" target="_blank" class="domain-name">${domain.domain}</a>
                <span class="domain-status ${statusClass}">${statusText}${verificationMethod}</span>
            </div>
            <div class="domain-title">${domain.title || '无标题'}</div>
            <div class="domain-meta">
                <span class="domain-source">${sourceInfo}</span>
                <span class="domain-checked">检查时间: ${new Date(domain.lastChecked || Date.now()).toLocaleTimeString('zh-CN')}</span>
            </div>
        `;

        return div;
    }

    showDomainsEmpty() {
        this.elements.domainsLoading.style.display = 'none';
        this.elements.domainsList.style.display = 'none';
        this.elements.domainsError.style.display = 'none';

        // 显示空状态消息
        this.elements.domainsPlaceholder.innerHTML = `
            <span class="placeholder-icon">🔍</span>
            <p>未找到相关域名</p>
        `;
        this.elements.domainsPlaceholder.style.display = 'flex';
    }

    showDomainsError() {
        this.elements.domainsLoading.style.display = 'none';
        this.elements.domainsPlaceholder.style.display = 'none';
        this.elements.domainsList.style.display = 'none';
        this.elements.domainsError.style.display = 'flex';
    }

    enableExportButton() {
        this.elements.exportBtn.disabled = false;
    }

    updateStats() {
        this.elements.detectedCount.textContent = this.adSenseIds.length;
        this.elements.foundCount.textContent = this.relatedDomains.length;
    }

    exportToCSV() {
        if (this.relatedDomains.length === 0) {
            return;
        }

        try {
            const csvContent = this.generateCSVContent();
            this.downloadCSV(csvContent);
        } catch (error) {
            console.error('CSV导出失败:', error);
        }
    }

    generateCSVContent() {
        const headers = ['域名', '标题', '验证状态', '发现时间', '链接'];
        const rows = [headers];

        this.relatedDomains.forEach(domain => {
            const row = [
                domain.domain,
                `"${(domain.title || '').replace(/"/g, '""')}"`,
                domain.verified ? '已验证' : '未验证',
                new Date().toLocaleDateString('zh-CN'),
                `https://${domain.domain}`
            ];
            rows.push(row);
        });

        return rows.map(row => row.join(',')).join('\n');
    }

    downloadCSV(content) {
        const blob = new Blob(['\ufeff' + content], {
            type: 'text/csv;charset=utf-8;'
        });

        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `adsense-domains-${Date.now()}.csv`;

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    refreshDetection() {
        // 重置状态
        this.adSenseIds = [];
        this.relatedDomains = [];
        this.isSearching = false;

        // 重置UI
        this.resetUI();

        // 重新开始检测
        this.detectAdSenseIDs();
    }

    resetUI() {
        // 重置检测状态
        this.showDetectionLoading();

        // 重置域名列表
        this.elements.domainsPlaceholder.innerHTML = `
            <span class="placeholder-icon">📋</span>
            <p>点击"查找相关域名"开始分析</p>
        `;
        this.elements.domainsPlaceholder.style.display = 'flex';
        this.elements.domainsList.style.display = 'none';
        this.elements.domainsError.style.display = 'none';
        this.elements.domainsLoading.style.display = 'none';

        // 重置按钮状态
        this.disableSearchButton();
        this.elements.exportBtn.disabled = true;

        // 重置统计
        this.elements.domainCount.textContent = '(0)';
        this.updateStats();
    }

    handleMessage(message, sender, sendResponse) {
        // 处理来自content script或background script的消息
        console.log('Popup收到消息:', message);

        switch (message.action) {
            case 'ADSENSE_DETECTED':
                this.handleAdSenseDetectionResult(message.data);
                break;
            case 'DOMAINS_FOUND':
                this.handleDomainsSearchResult(message.data);
                break;
            default:
                console.log('未知消息类型:', message.action);
        }
    }

    showError(message) {
        console.error('PubSpy错误:', message);
        // 这里可以添加错误提示UI
    }
}

// 当DOM加载完成后初始化Popup
document.addEventListener('DOMContentLoaded', () => {
    new PubSpyPopup();
});