# PubSpy - AdSense Publisher ID Finder

一个Chrome扩展，用于检测网页中的AdSense Publisher ID并发现使用相同ID的其他域名。

## 功能特性

- ✅ 自动检测网页中的AdSense Publisher ID
- ✅ 搜索使用相同Publisher ID的其他域名
- ✅ 友好的用户界面
- ✅ CSV数据导出功能
- ✅ 本地缓存机制
- ✅ 实时检测状态显示

## 安装方法

### 开发者模式安装

1. 打开Chrome浏览器
2. 进入扩展程序页面 (`chrome://extensions/`)
3. 开启右上角的"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择 `PubSpy-Extension` 文件夹
6. 扩展程序将出现在浏览器工具栏中

## 使用方法

1. 访问任何包含AdSense广告的网站
2. 点击浏览器工具栏中的PubSpy图标
3. 扩展会自动检测页面中的AdSense Publisher ID
4. 点击"查找相关域名"按钮搜索使用相同ID的其他网站
5. 使用"导出CSV"按钮下载搜索结果

## 项目结构

```
PubSpy-Extension/
├── manifest.json          # 扩展配置文件
├── popup/                 # 弹窗界面
│   ├── popup.html         # 主界面HTML
│   ├── popup.css          # 样式文件
│   └── popup.js           # 交互逻辑
├── content/               # 内容脚本
│   └── content.js         # AdSense检测逻辑
├── background/            # 后台服务
│   └── background.js      # API调用和数据管理
├── icons/                 # 图标资源
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── README.md             # 说明文档
```

## 技术特性

### AdSense检测方法

- Script标签扫描
- HTML数据属性检测
- iframe源地址分析
- 页面源码正则匹配
- 动态内容监控

### 域名发现机制

- Google Custom Search API集成
- 第三方广告情报服务
- 缓存机制优化
- 结果验证和过滤

## 开发说明

### 当前状态：基础框架

这是一个基础框架版本，包含：
- ✅ 完整的UI界面
- ✅ AdSense ID检测功能
- ✅ 基础的消息传递机制
- ✅ 模拟的域名搜索功能
- ✅ CSV导出功能

### 待实现功能

- [ ] 真实的第三方API集成
- [ ] 高级的域名验证
- [ ] 设置页面
- [ ] 多语言支持
- [ ] 性能优化

### 测试建议

1. **测试AdSense检测**：
   - 访问包含AdSense广告的网站
   - 检查扩展能否正确识别Publisher ID

2. **测试UI交互**：
   - 确认所有按钮功能正常
   - 验证加载状态显示正确
   - 测试导出功能

3. **测试缓存机制**：
   - 多次搜索相同的Publisher ID
   - 验证缓存是否生效

## API配置

目前使用模拟数据进行测试。要启用真实的API功能，需要：

1. 获取Google Custom Search API密钥
2. 创建自定义搜索引擎
3. 在background.js中配置API参数

## 注意事项

- 扩展需要"activeTab"和"storage"权限
- 某些网站可能有反检测机制
- API调用可能有速率限制
- 请遵守各网站的robots.txt和使用条款

## 版本历史

### v1.0.0 (当前)
- 基础框架完成
- AdSense检测功能
- 模拟域名搜索
- CSV导出功能

## 许可证

本项目仅供学习和研究使用。