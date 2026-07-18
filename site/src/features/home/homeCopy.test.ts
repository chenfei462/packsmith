import { describe, expect, it } from 'vitest'

import { homeCopy, homeDetails } from './homeCopy'

describe('homeCopy', () => {
  it('keeps the core Chinese product message readable', () => {
    expect(homeCopy.zh.heroEyebrow).toBe('锻造 / 验证 / 交付')
    expect(homeCopy.zh.heroTitle).toBe('AI 智能体工作流的包管理器。')
    expect(homeCopy.zh.startDemo).toBe('开始引导演示')
    expect(homeDetails.zh.portabilitySignals[0].title).toBe('运行时副本')
    expect(homeDetails.zh.teamCapabilities[0].name).toBe('私有技能库')
    expect(homeDetails.zh.planned).toBe('规划中')
  })
})
