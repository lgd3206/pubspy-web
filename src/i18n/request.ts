import { getRequestConfig } from 'next-intl/server';
import { locales } from './config';

// 静态导入所有消息文件
import zhCN from '../../messages/zh-CN.json';
import enUS from '../../messages/en-US.json';

const messages = {
  'zh-CN': zhCN,
  'en-US': enUS
};

export default getRequestConfig(async ({ locale }) => {
  // Validate that the incoming `locale` parameter is valid
  if (!locales.includes(locale as any)) {
    locale = 'zh-CN'; // fallback to default locale
  }

  return {
    messages: messages[locale as keyof typeof messages]
  };
});