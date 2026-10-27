import type { SiteLocale } from '../data/types'

export type DocsTopicId =
  | 'install'
  | 'author'
  | 'publish'
  | 'trust'
  | 'policy'
  | 'audit'

export interface DocsTopicCopy {
  readonly step: string
  readonly title: string
  readonly summary: string
  readonly detail: string
  readonly outcome: string
}

export interface DocsTopicContent {
  readonly id: DocsTopicId
  readonly commands: readonly string[]
  readonly sourceUrl: string
  readonly copy: Readonly<Record<SiteLocale, DocsTopicCopy>>
}

const repositoryUrl = 'https://github.com/chenfei462/packsmith/blob/main'

export const docsContent: Readonly<Record<DocsTopicId, DocsTopicContent>> = {
  install: {
    id: 'install',
    commands: [
      'node src/cli.mjs passport senior-code-reviewer',
      'node src/cli.mjs preview senior-code-reviewer --target codex',
    ],
    sourceUrl: `${repositoryUrl}/README.md`,
    copy: {
      en: {
        step: '01 / Inspect',
        title: 'Install from evidence',
        summary:
          'Start with the Pack Passport, then preview the exact files Packsmith plans to write for your runtime.',
        detail:
          'The source-tree workflow keeps the decision reversible. Review identity, declared permissions, computed risk, provenance, and target-specific writes before an install command enters the loop.',
        outcome: 'A verified runtime plan with no hidden writes.',
      },
      zh: {
        step: '01 / 检查',
        title: '基于证据安装',
        summary: '先查看 Pack 护照，再预览 Packsmith 将为目标运行时写入的准确文件。',
        detail:
          '源码工作流让每个决定都可回退。在执行安装命令前，检查身份、声明权限、计算风险、来源信息以及特定运行时的写入计划。',
        outcome: '得到经过验证且没有隐藏写入的运行时计划。',
      },
    },
  },
  author: {
    id: 'author',
    commands: ['node src/cli.mjs init my-pack'],
    sourceUrl: `${repositoryUrl}/docs/specification.md`,
    copy: {
      en: {
        step: '02 / Shape',
        title: 'Author a portable Pack',
        summary:
          'Create one declarative manifest for skills, prompts, instructions, assets, and runtime support.',
        detail:
          'Packsmith treats the manifest as the contract. Stable identifiers, explicit permissions, relative source paths, and declared targets keep the Pack understandable before any adapter transforms it.',
        outcome: 'One inspectable source that can travel across runtimes.',
      },
      zh: {
        step: '02 / 塑形',
        title: '编写可移植 Pack',
        summary: '用一份声明式清单组织技能、提示词、指令、资源与运行时支持。',
        detail:
          'Packsmith 将清单视为契约。稳定标识、明确权限、相对源码路径与声明目标，让 Pack 在任何适配器转换前就可以被理解和审查。',
        outcome: '形成一份可检查、可跨运行时流转的源码。',
      },
    },
  },
  publish: {
    id: 'publish',
    commands: ['node src/cli.mjs publish my-pack --dry-run'],
    sourceUrl: `${repositoryUrl}/docs/registry-submission-guide.md`,
    copy: {
      en: {
        step: '03 / Release',
        title: 'Publish without guessing',
        summary:
          'Run the Registry submission pipeline as a dry run before changing catalog state.',
        detail:
          'The publication check validates the manifest, computes evidence, and shows the catalog payload ahead of release. The same Pack identity then anchors discovery, provenance, and future updates.',
        outcome: 'A reviewable Registry submission before publication.',
      },
      zh: {
        step: '03 / 发布',
        title: '发布前消除猜测',
        summary: '先以 dry run 运行 Registry 提交流程，再改变目录状态。',
        detail:
          '发布检查会验证清单、计算证据并提前展示目录载荷。同一个 Pack 身份随后会连接发现、来源追踪与未来更新。',
        outcome: '在正式发布前获得可审查的 Registry 提交结果。',
      },
    },
  },
  trust: {
    id: 'trust',
    commands: ['node src/cli.mjs passport senior-code-reviewer'],
    sourceUrl: `${repositoryUrl}/docs/trust-and-audit.md`,
    copy: {
      en: {
        step: '04 / Verify',
        title: 'Read the trust surface',
        summary:
          'Use the Passport to compare publisher identity, checksums, permissions, risk, and provenance in one place.',
        detail:
          'Trust is presented as evidence rather than a decorative badge. Declared capability and computed analysis stay separate, so reviewers can see exactly what came from the author and what Packsmith derived.',
        outcome: 'A traceable decision boundary for every Pack.',
      },
      zh: {
        step: '04 / 验证',
        title: '读取信任界面',
        summary: '通过护照集中比较发布者身份、校验和、权限、风险与来源。',
        detail:
          '信任以证据呈现，而不是装饰性徽章。声明能力与计算分析保持分离，审查者可以准确分辨哪些信息来自作者，哪些由 Packsmith 推导。',
        outcome: '为每个 Pack 建立可追溯的决策边界。',
      },
    },
  },
  policy: {
    id: 'policy',
    commands: ['node src/cli.mjs policy validate examples/policy.json'],
    sourceUrl: `${repositoryUrl}/docs/trust-and-audit.md`,
    copy: {
      en: {
        step: '05 / Govern',
        title: 'Turn policy into a gate',
        summary:
          'Validate machine-readable policy before applying organization rules to Packs and releases.',
        detail:
          'Policy moves requirements out of reviewer memory and into repeatable checks. Risk limits, provenance requirements, and quality thresholds become visible inputs that local workflows and CI can share.',
        outcome: 'The same acceptance rules on every machine.',
      },
      zh: {
        step: '05 / 治理',
        title: '把策略变成门禁',
        summary: '先验证机器可读策略，再把组织规则应用于 Pack 与发布流程。',
        detail:
          '策略把要求从审查者的记忆转移到可重复检查。风险上限、来源要求与质量阈值成为显式输入，可由本地工作流和 CI 共同使用。',
        outcome: '让每台机器执行同一套准入规则。',
      },
    },
  },
  audit: {
    id: 'audit',
    commands: ['node src/cli.mjs audit --ci'],
    sourceUrl: `${repositoryUrl}/docs/trust-and-audit.md`,
    copy: {
      en: {
        step: '06 / Prove',
        title: 'Close the loop in CI',
        summary:
          'Audit the repository with deterministic output that automation can enforce and humans can inspect.',
        detail:
          'The final stage checks integrity, trust metadata, and policy expectations without replacing human review. Its output becomes a repeatable record that can fail a build instead of disappearing in a one-off report.',
        outcome: 'Continuous, reviewable proof from source to runtime.',
      },
      zh: {
        step: '06 / 证明',
        title: '在 CI 中闭合流程',
        summary: '以确定性输出审计仓库，让自动化可以执行，让人可以检查。',
        detail:
          '最后阶段检查完整性、信任元数据与策略要求，同时保留人工审查。输出会成为可重复记录，并能直接阻止不合格构建，而不是消失在一次性报告中。',
        outcome: '从源码到运行时持续产出可审查证据。',
      },
    },
  },
}
