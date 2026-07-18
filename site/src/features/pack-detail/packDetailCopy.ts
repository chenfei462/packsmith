import type { SiteLocale } from '../../data/types'

export const packDetailCopy: Readonly<
  Record<
    SiteLocale,
    {
      readonly back: string
      readonly passportLive: string
      readonly verifiedPassport: string
      readonly unverifiedPassport: string
      readonly runtimeEyebrow: string
      readonly runtimeLabel: string
      readonly ready: string
      readonly unavailable: string
      readonly passportLayer: string
      readonly manifest: string
      readonly permissions: string
      readonly risk: string
      readonly provenance: string
      readonly writes: string
      readonly install: string
      readonly verifiedPublisher: string
      readonly publisher: string
      readonly version: string
      readonly license: string
      readonly declaredRisk: string
      readonly computedRisk: string
      readonly quality: string
      readonly checksumStatus: string
      readonly audit: string
      readonly evidence: string
      readonly evidenceDetail: string
      readonly installPath: string
      readonly plannedWrites: string
      readonly path: string
      readonly notAvailable: string
      readonly notDeclared: string
      readonly notReady: string
      readonly noCommand: string
      readonly verifyBeforeInstall: string
      readonly copyCommand: string
      readonly copied: string
      readonly verifyEyebrow: string
      readonly browseRegistry: string
      readonly readDocumentation: string
      readonly permissionLabels: Readonly<Record<string, string>>
      readonly permissionValues: Readonly<Record<string, string>>
    }
  >
> = {
  en: {
    back: 'Back to Registry',
    passportLive: 'Live Pack Passport',
    verifiedPassport: 'Verified Passport',
    unverifiedPassport: 'Unverified Passport',
    runtimeEyebrow: 'Runtime adapter',
    runtimeLabel: 'Runtime target',
    ready: 'Preview ready',
    unavailable: 'Unavailable',
    passportLayer: 'Passport layer',
    manifest: 'Manifest',
    permissions: 'Permissions',
    risk: 'Risk analysis',
    provenance: 'Provenance',
    writes: 'Preview writes',
    install: 'Install verification',
    verifiedPublisher: 'Verified publisher',
    publisher: 'Publisher',
    version: 'Version',
    license: 'License',
    declaredRisk: 'Declared risk',
    computedRisk: 'Computed risk',
    quality: 'Quality',
    checksumStatus: 'Checksum status',
    audit: 'Audit',
    evidence: 'Evidence',
    evidenceDetail:
      'Derived by Packsmith from Registry metadata and declared permissions.',
    installPath: 'Install path',
    plannedWrites: 'Planned writes',
    path: 'Normalized path',
    notAvailable: 'Not available for this Pack',
    notDeclared: 'This runtime is not declared by the Pack manifest.',
    notReady: 'Packsmith could not produce a verified preview for this runtime.',
    noCommand: 'The install command is withheld until a preview is ready.',
    verifyBeforeInstall: 'Review the Passport, then run the source-tree command.',
    copyCommand: 'Copy install command',
    copied: 'Install command copied',
    verifyEyebrow: 'Verify',
    browseRegistry: 'Browse Registry',
    readDocumentation: 'Read documentation',
    permissionLabels: {
      shell: 'Shell',
      filesystem: 'Filesystem',
      network: 'Network',
      browser: 'Browser',
    },
    permissionValues: {
      required: 'required',
      optional: 'optional',
      none: 'none',
    },
  },
  zh: {
    back: '返回 Registry',
    passportLive: '实时 Pack 护照',
    verifiedPassport: '已验证护照',
    unverifiedPassport: '未验证护照',
    runtimeEyebrow: '运行时适配器',
    runtimeLabel: '运行时目标',
    ready: '预览就绪',
    unavailable: '不可用',
    passportLayer: '护照层',
    manifest: '清单',
    permissions: '权限',
    risk: '风险分析',
    provenance: '来源与校验',
    writes: '预览写入',
    install: '安装验证',
    verifiedPublisher: '发布者已验证',
    publisher: '发布者',
    version: '版本',
    license: '许可证',
    declaredRisk: '声明风险',
    computedRisk: '计算风险',
    quality: '质量评分',
    checksumStatus: '校验和状态',
    audit: '审计',
    evidence: '证据',
    evidenceDetail: '由 Packsmith 根据 Registry 元数据和声明权限计算。',
    installPath: '安装路径',
    plannedWrites: '计划写入',
    path: '规范化路径',
    notAvailable: '此 Pack 不支持该目标',
    notDeclared: 'Pack 清单未声明此运行时。',
    notReady: 'Packsmith 无法为此运行时生成已验证预览。',
    noCommand: '预览就绪前不会提供安装命令。',
    verifyBeforeInstall: '检查护照后，再运行源码命令。',
    copyCommand: '复制安装命令',
    copied: '安装命令已复制',
    verifyEyebrow: '验证',
    browseRegistry: '浏览 Registry',
    readDocumentation: '阅读文档',
    permissionLabels: {
      shell: 'Shell',
      filesystem: '文件系统',
      network: '网络',
      browser: '浏览器',
    },
    permissionValues: {
      required: '必需',
      optional: '可选',
      none: '无',
    },
  },
}
