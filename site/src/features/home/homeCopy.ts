import type { SiteLocale } from '../../data/types'

const englishCopy = {
  heroEyebrow: 'Forge / Verify / Ship',
  heroTitle: 'The package manager for AI agent workflows.',
  heroPromise: 'One workflow. Six agent install plans. Trust before install.',
  startDemo: 'Start guided demo',
  viewGitHub: 'View on GitHub',
  skipInstall: 'Skip to install command',
  portabilityEyebrow: 'The portability problem',
  portabilityTitle: 'Stop maintaining six copies of the same workflow.',
  portabilityBody:
    'Runtime-specific files drift. Permissions become inconsistent. Updates stop arriving together. Packsmith keeps one canonical Pack and computes each install plan.',
  demoEyebrow: 'Guided product flow',
  demoTitle: 'From Registry search to a reviewable install plan.',
  demoBody:
    'Advance each step directly. The browser prepares evidence and commands; the CLI remains the only writer.',
  passportEyebrow: 'Passport / Trust before install',
  passportTitle: 'Inspect the facts that should block or permit a Pack.',
  passportBody:
    'Publisher, permissions, risk, checksum, quality, and preview-only audit state come from the real Passport contract.',
  runtimeEyebrow: 'One Pack / Six runtimes',
  runtimeTitle: 'A canonical workflow, adapted at the last responsible moment.',
  proofEyebrow: 'Repository-derived proof',
  proofTitle: 'Claims you can trace back to source.',
  teamEyebrow: 'Team governance',
  teamTitle: 'The same trust primitives, extended for teams.',
  teamBody:
    'Private distribution and governance are the commercial path. They are shown as planned until the implementation exists.',
  installEyebrow: 'Install / Source tree',
  installTitle: 'Finish with the command you can audit.',
  installBody:
    'Run the source-tree CLI from this repository. Preview evidence above remains visible before any write.',
} as const

type HomeCopy = Readonly<Record<keyof typeof englishCopy, string>>

const chineseCopy: HomeCopy = {
  heroEyebrow: '锻造 / 验证 / 交付',
  heroTitle: 'AI 智能体工作流的包管理器。',
  heroPromise: '一套工作流，六种智能体安装计划，安装前先建立信任。',
  startDemo: '开始引导演示',
  viewGitHub: '在 GitHub 查看',
  skipInstall: '跳到安装命令',
  portabilityEyebrow: '可移植性问题',
  portabilityTitle: '不再维护同一工作流的六份副本。',
  portabilityBody:
    '运行时专用文件会漂移，权限会失去一致性，更新也无法同步到达。Packsmith 保留一个规范 Pack，并计算每个安装计划。',
  demoEyebrow: '引导式产品流程',
  demoTitle: '从技能库搜索走到可审查的安装计划。',
  demoBody: '每一步都可直接推进。浏览器只准备证据与命令，只有 CLI 会写入文件。',
  passportEyebrow: 'Passport / 安装前先建立信任',
  passportTitle: '检查真正应当阻止或允许 Pack 的事实。',
  passportBody:
    '发布者、权限、风险、校验和、质量与仅预览审计状态都来自真实 Passport 契约。',
  runtimeEyebrow: '一个 Pack / 六种运行时',
  runtimeTitle: '一套规范工作流，在最后必要时刻完成适配。',
  proofEyebrow: '仓库派生证据',
  proofTitle: '每一项声明都能追溯到源代码。',
  teamEyebrow: '团队治理',
  teamTitle: '把相同的信任原语扩展到团队。',
  teamBody:
    '私有分发与治理是商业化方向。在实现完成之前，这些能力都会明确标记为规划中。',
  installEyebrow: '安装 / 源码树',
  installTitle: '以一条可审计的命令结束。',
  installBody: '在当前仓库运行源码树 CLI。任何写入发生前，上方预览证据始终可见。',
}

export const homeCopy: Readonly<Record<SiteLocale, HomeCopy>> = {
  en: englishCopy,
  zh: chineseCopy,
}

interface HomeDetails {
  readonly planned: string
  readonly portabilitySignals: readonly {
    readonly title: string
    readonly detail: string
  }[]
  readonly teamCapabilities: readonly {
    readonly name: string
    readonly detail: string
  }[]
}

export const homeDetails: Readonly<Record<SiteLocale, HomeDetails>> = {
  en: {
    planned: 'Planned',
    portabilitySignals: [
      {
        title: 'Runtime copies',
        detail: 'Six trees drift at six different speeds.',
      },
      {
        title: 'Permission drift',
        detail: 'Trust assumptions disappear between tools.',
      },
      {
        title: 'Update debt',
        detail: 'A fix lands once, then waits in five queues.',
      },
    ],
    teamCapabilities: [
      {
        name: 'Private Registry',
        detail: 'Distribute internal Packs without making them public.',
      },
      {
        name: 'Policy gates',
        detail: 'Enforce risk, publisher, and quality requirements.',
      },
      {
        name: 'Role controls',
        detail: 'Separate publishing, approving, and installing.',
      },
      {
        name: 'Audit history',
        detail: 'Trace approvals and receipts across a team.',
      },
    ],
  },
  zh: {
    planned: '规划中',
    portabilitySignals: [
      { title: '运行时副本', detail: '六套目录以六种不同速度逐渐偏离。' },
      { title: '权限漂移', detail: '工具切换后，原有的信任假设随之消失。' },
      { title: '更新债务', detail: '一次修复落地后，还要在五个队列里等待。' },
    ],
    teamCapabilities: [
      { name: '私有技能库', detail: '在不公开的前提下分发团队内部 Pack。' },
      { name: '策略门禁', detail: '强制执行风险、发布者与质量要求。' },
      { name: '角色控制', detail: '分离发布、审批与安装权限。' },
      { name: '审计历史', detail: '追踪团队范围内的审批与安装凭据。' },
    ],
  },
}
