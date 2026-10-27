import type { SiteLocale } from '../data/types'

const englishMessages = {
  'nav.primary': 'Primary navigation',
  'nav.home': 'Home',
  'nav.registry': 'Registry',
  'nav.docs': 'Docs',
  'nav.github': 'GitHub',
  'nav.language': 'Language',
  'locale.en': 'English',
  'locale.zh': '中文',
  'action.exploreRegistry': 'Explore Registry',
  'action.readDocs': 'Read Docs',
  'action.viewGitHub': 'View on GitHub',
  'action.copy': 'Copy',
  'action.copied': 'Copied',
  'common.skipToContent': 'Skip to content',
  'common.loadingScene': 'Loading scene',
  'common.sceneUnavailable': 'Interactive scene unavailable',
  'route.notFound': 'Page not found',
} as const

export type MessageKey = keyof typeof englishMessages
export type MessageDictionary = Readonly<Record<MessageKey, string>>

const chineseMessages: MessageDictionary = {
  'nav.primary': '主导航',
  'nav.home': '首页',
  'nav.registry': '技能库',
  'nav.docs': '文档',
  'nav.github': 'GitHub',
  'nav.language': '语言',
  'locale.en': 'English',
  'locale.zh': '中文',
  'action.exploreRegistry': '浏览技能库',
  'action.readDocs': '阅读文档',
  'action.viewGitHub': '在 GitHub 查看',
  'action.copy': '复制',
  'action.copied': '已复制',
  'common.skipToContent': '跳到主要内容',
  'common.loadingScene': '正在加载场景',
  'common.sceneUnavailable': '交互场景暂不可用',
  'route.notFound': '页面不存在',
}

export const messages: Readonly<Record<SiteLocale, MessageDictionary>> = {
  en: englishMessages,
  zh: chineseMessages,
}
