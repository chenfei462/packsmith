export type RuntimeId = 'claude-code' | 'codex' | 'github-copilot' | 'opencode' | 'cursor' | 'trae'

export type RiskLevel = 'low' | 'medium' | 'high' | 'blocked'

export type PermissionLevel = 'none' | 'optional' | 'required'

export type CatalogLocale = 'en' | 'zh' | 'ja' | 'ko' | 'es' | 'fr' | 'de'

export type SiteLocale = 'en' | 'zh'

export interface RuntimeTarget {
  readonly id: RuntimeId
  readonly name: string
  readonly scopes: readonly string[]
  readonly defaultScope: string
  readonly installSubdirs: Readonly<Record<string, string>>
  readonly skillDirectoryFormat: string
  readonly bridgeFiles: readonly string[]
  readonly compatibilityWarnings: readonly string[]
}

export interface TargetPreview {
  readonly targetId: RuntimeId
  readonly status: 'preview-ready' | 'not-declared' | 'not-ready'
  readonly scope?: string
  readonly installPathTemplate?: string
  readonly writes: readonly string[]
  readonly checksum?: string
  readonly checksumStatus?: 'calculated' | 'matched' | 'mismatch'
  readonly bridgeFiles: readonly string[]
  readonly warnings: readonly string[]
  readonly reason?: string
}

export interface SitePack {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly version: string
  readonly author: string
  readonly category: string
  readonly tags: readonly string[]
  readonly license: string
  readonly repository: string
  readonly homepage: string
  readonly updatedAt: string
  readonly compatibilityNotes: string
  readonly targetIds: readonly RuntimeId[]
  readonly permissions: {
    readonly shell: PermissionLevel
    readonly filesystem: PermissionLevel
    readonly network: PermissionLevel
    readonly browser: PermissionLevel
  }
  readonly declaredRisk: RiskLevel
  readonly estimatedContextSize: number
  readonly verified: boolean
  readonly publisher: {
    readonly id: string
    readonly verified: boolean
  }
  readonly localizations: Readonly<
    Partial<Record<CatalogLocale, { readonly name: string; readonly description: string }>>
  >
  readonly passport: {
    readonly computedRisk: RiskLevel
    readonly riskReasons: readonly string[]
    readonly qualityScore: number
    readonly checksum: string
    readonly checksumStatus: 'calculated' | 'matched' | 'mismatch'
    readonly context: {
      readonly estimatedChars: number
      readonly tokenPressure: string
    }
    readonly audit: {
      readonly status: 'preview-only'
      readonly reason: string
    }
  }
  readonly previews: Readonly<Record<RuntimeId, TargetPreview>>
}

export interface RepositoryData {
  readonly schemaVersion: number
  readonly catalogUpdatedAt: string
  readonly supportedTargetIds: readonly RuntimeId[]
  readonly targets: readonly RuntimeTarget[]
  readonly packs: readonly SitePack[]
}
