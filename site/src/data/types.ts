export type RuntimeId = 'claude-code' | 'codex' | 'github-copilot' | 'opencode' | 'cursor' | 'trae'

export type RiskLevel = 'low' | 'medium' | 'high' | 'blocked'

export type PermissionLevel = 'none' | 'optional' | 'required'

export type CatalogLocale = 'en' | 'zh' | 'ja' | 'ko' | 'es' | 'fr' | 'de'

export type SiteLocale = 'en' | 'zh'

export interface RuntimeTarget {
  id: RuntimeId
  name: string
  status: 'supported'
  platforms: string[]
  scopes: string[]
  defaultScope: string
  installSubdir: string
  installSubdirs: Record<string, string>
  configFiles: string[]
  skillDirectoryFormat: string
  promptFormat: string
  bridgeFiles: string[]
  validationRules: string[]
  compatibilityWarnings: string[]
  documentationUrl: string | null
  docsConfirmedAt: string | null
}

export interface TargetPreview {
  status: 'preview-ready' | 'not-declared' | 'not-ready'
  scope: string | null
  installPath: string | null
  writes: string[]
  checksum: string | null
  checksumStatus: 'calculated' | 'matched' | 'mismatch' | null
  bridgeFiles: string[]
  warnings: string[]
  reason: string | null
}

export interface SitePack {
  id: string
  name: string
  description: string
  version: string
  author: string
  category: string
  tags: string[]
  license: string
  repository: string
  homepage: string
  updatedAt: string
  compatibilityNotes: string
  targetIds: RuntimeId[]
  permissions: {
    shell: PermissionLevel
    filesystem: PermissionLevel
    network: PermissionLevel
    browser: PermissionLevel
  }
  declaredRisk: RiskLevel
  estimatedContextSize: number
  verified: boolean
  publisher: {
    id: string
    verified: boolean
  }
  localizations: Record<CatalogLocale, { name: string; description: string }>
  passport: {
    computedRisk: RiskLevel
    riskReasons: string[]
    qualityScore: number
    checksum: string
    checksumStatus: 'calculated' | 'matched' | 'mismatch'
    context: {
      estimatedChars: number
      tokenPressure: 'low' | 'medium' | 'high'
    }
    audit: {
      status: string
      reason: string
    }
  }
  previews: Record<RuntimeId, TargetPreview>
}

export interface RepositoryData {
  schemaVersion: number
  catalogUpdatedAt: string
  supportedTargetIds: RuntimeId[]
  targets: RuntimeTarget[]
  packs: SitePack[]
}
