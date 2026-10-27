import os from "node:os";
import path from "node:path";

export const TARGET_ADAPTERS = [
  {
    id: "claude-code",
    name: "Claude Code",
    platforms: ["darwin", "linux", "win32"],
    status: "supported",
    scopes: ["personal"],
    installSubdir: path.join(".claude", "skills"),
    installSubdirs: {
      personal: path.join(".claude", "skills")
    },
    configFiles: [".claude/settings.json"],
    skillDirectoryFormat: ".claude/skills/<pack-name>",
    promptFormat: "Skill directories with SKILL.md entry files.",
    bridgeFiles: ["README.md", "bundle.json"],
    validationRules: ["Every skill directory includes SKILL.md."],
    compatibilityWarnings: []
  },
  {
    id: "codex",
    name: "Codex",
    platforms: ["darwin", "linux", "win32"],
    status: "supported",
    scopes: ["personal"],
    installSubdir: path.join(".codex", "skills"),
    installSubdirs: {
      personal: path.join(".codex", "skills")
    },
    configFiles: ["AGENTS.md"],
    skillDirectoryFormat: ".codex/skills/<pack-name>",
    promptFormat: "Pack-local skills plus generated AGENTS.md bridge.",
    bridgeFiles: ["AGENTS.md", "README.md", "bundle.json"],
    validationRules: ["Generated AGENTS.md should name bundled skills."],
    compatibilityWarnings: []
  },
  {
    id: "github-copilot",
    name: "GitHub Copilot",
    platforms: ["darwin", "linux", "win32"],
    status: "supported",
    scopes: ["project", "personal"],
    installSubdir: path.join(".github", "skills"),
    installSubdirs: {
      project: path.join(".github", "skills"),
      personal: path.join(".copilot", "skills")
    },
    defaultScope: "project",
    configFiles: [".github/skills"],
    skillDirectoryFormat: ".github/skills/<pack-name>",
    promptFormat: "Copilot agent skill directory with a root SKILL.md bridge and copied Packsmith assets.",
    bridgeFiles: ["SKILL.md", "README.md", "bundle.json"],
    validationRules: ["Generated SKILL.md should describe triggers, included skills, prompts, and risk metadata."],
    compatibilityWarnings: [
      "Project scope installs under .github/skills so the files can travel with the repository.",
      "Personal scope installs under ~/.copilot/skills per GitHub Copilot agent skill documentation.",
      "Use `gh skill` for native Copilot publication when you need GitHub-hosted distribution."
    ],
    documentationUrl:
      "https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/add-skills",
    docsConfirmedAt: "2026-05-25"
  },
  {
    id: "github-copilot-personal",
    name: "GitHub Copilot Personal",
    platforms: ["darwin", "linux", "win32"],
    status: "planned",
    scopes: ["personal"],
    installSubdir: path.join(".copilot", "skills"),
    installSubdirs: {
      personal: path.join(".copilot", "skills")
    },
    configFiles: [],
    skillDirectoryFormat: ".copilot/skills/<pack-name>",
    promptFormat: "Adapter planned.",
    bridgeFiles: [],
    validationRules: [],
    compatibilityWarnings: ["Personal Copilot skill install path depends on GitHub account tooling and is not auto-installed yet."]
  },
  {
    id: "github-copilot-workspace",
    name: "GitHub Copilot Workspace",
    platforms: ["darwin", "linux", "win32"],
    status: "planned",
    scopes: ["workspace"],
    installSubdir: path.join(".github", "skills"),
    installSubdirs: {
      workspace: path.join(".github", "skills")
    },
    configFiles: [],
    skillDirectoryFormat: "Adapter pending workspace Copilot skills location confirmation.",
    promptFormat: "Adapter planned.",
    bridgeFiles: [],
    validationRules: [],
    compatibilityWarnings: ["Workspace Copilot skill install path needs confirmation before automatic install."]
  },
  {
    id: "opencode",
    name: "OpenCode",
    platforms: ["darwin", "linux", "win32"],
    status: "supported",
    scopes: ["personal"],
    installSubdir: path.join(".opencode", "skills"),
    installSubdirs: {
      personal: path.join(".opencode", "skills")
    },
    configFiles: [".opencode/skills"],
    skillDirectoryFormat: ".opencode/skills/<pack-name>",
    promptFormat: "Pack-local skills and prompts with a PACKSMITH.md bridge.",
    bridgeFiles: ["PACKSMITH.md", "README.md", "bundle.json"],
    validationRules: ["Packsmith copies skills and prompts losslessly and writes a manifest bridge."],
    compatibilityWarnings: ["OpenCode support uses Packsmith's local skill-pack layout until upstream conventions are confirmed."]
  },
  {
    id: "cursor",
    name: "Cursor",
    platforms: ["darwin", "linux", "win32"],
    status: "supported",
    scopes: ["personal"],
    installSubdir: path.join(".cursor", "rules", "packsmith"),
    installSubdirs: {
      personal: path.join(".cursor", "rules", "packsmith")
    },
    configFiles: [".cursor/rules"],
    skillDirectoryFormat: ".cursor/rules/packsmith/<pack-name>",
    promptFormat: "Cursor .mdc rule file plus copied skills and prompts for reference.",
    bridgeFiles: ["<pack-name>.mdc", "README.md", "bundle.json"],
    validationRules: ["Generated .mdc rule names included skills and points to copied Packsmith assets."],
    compatibilityWarnings: ["Cursor support installs a project/global rule pack; exact workspace policy remains user-controlled."]
  },
  {
    id: "trae",
    name: "TRAE",
    platforms: ["darwin", "linux", "win32"],
    status: "supported",
    scopes: ["project", "cli-project", "personal"],
    installSubdir: path.join(".trae", "skills"),
    installSubdirs: {
      project: path.join(".trae", "skills"),
      "cli-project": path.join(".traecli", "skills"),
      personal: path.join(".trae-cn", "skills")
    },
    defaultScope: "project",
    configFiles: [".trae/skills", ".traecli/skills"],
    skillDirectoryFormat: ".trae/skills/<pack-name>",
    promptFormat: "TRAE Skill directory with root SKILL.md bridge and copied Packsmith assets.",
    bridgeFiles: ["SKILL.md", "README.md", "bundle.json"],
    validationRules: ["Generated SKILL.md should describe when to use the pack, included assets, permissions, and output contract."],
    compatibilityWarnings: [
      "TRAE support installs local TRAE Skill directories only; it does not claim marketplace, hosted plugin, or official partnership distribution."
    ],
    documentationUrl: "https://docs.trae.cn/cli_what-is-trae-cli",
    docsConfirmedAt: "2026-07-06"
  },
  {
    id: "gemini-cli",
    name: "Gemini CLI",
    platforms: ["darwin", "linux", "win32"],
    status: "planned",
    scopes: ["personal"],
    installSubdir: path.join(".gemini", "skills"),
    configFiles: [],
    skillDirectoryFormat: "Adapter pending Gemini CLI skill convention confirmation.",
    promptFormat: "Adapter planned.",
    bridgeFiles: [],
    validationRules: [],
    compatibilityWarnings: ["Gemini CLI skill location needs confirmation before automatic install."]
  },
  {
    id: "openclaw",
    name: "OpenClaw",
    platforms: ["darwin", "linux", "win32"],
    status: "planned",
    scopes: ["personal"],
    installSubdir: path.join(".openclaw", "skills"),
    configFiles: [],
    skillDirectoryFormat: "Adapter pending OpenClaw directory confirmation.",
    promptFormat: "Adapter planned.",
    bridgeFiles: [],
    validationRules: [],
    compatibilityWarnings: ["OpenClaw extension layout needs confirmation before automatic install."]
  },
  {
    id: "hermes-agent",
    name: "Hermes Agent",
    platforms: ["darwin", "linux", "win32"],
    status: "planned",
    scopes: ["personal"],
    installSubdir: path.join(".hermes", "skills"),
    configFiles: [],
    skillDirectoryFormat: "Adapter pending Hermes Agent directory confirmation.",
    promptFormat: "Adapter planned.",
    bridgeFiles: [],
    validationRules: [],
    compatibilityWarnings: ["Hermes Agent extension layout needs confirmation before automatic install."]
  }
];

export const SUPPORTED_TARGET_IDS = new Set(TARGET_ADAPTERS.map((adapter) => adapter.id));

export function getTargetAdapter(targetId) {
  return TARGET_ADAPTERS.find((adapter) => adapter.id === targetId);
}

export function getSupportedTargetAdapters() {
  return TARGET_ADAPTERS.filter((adapter) => adapter.status === "supported");
}

export function formatSupportedTargets() {
  return TARGET_ADAPTERS.map((adapter) => adapter.id).join(", ");
}

export function userHomeDir() {
  return process.env.PACKSMITH_TEST_HOME || os.homedir();
}

export function defaultStateDir() {
  return process.env.PACKSMITH_HOME || path.join(userHomeDir(), ".packsmith");
}

export function defaultInstallRoot(targetId, options = {}) {
  const adapter = getTargetAdapter(targetId);

  if (!adapter) {
    throw new Error(`Unknown target "${targetId}". Supported targets: ${formatSupportedTargets()}.`);
  }

  try {
    const scope = options.scope ?? adapter.defaultScope ?? adapter.scopes?.[0] ?? "personal";
    const subdir = adapter.installSubdirs?.[scope] ?? adapter.installSubdir;
    const baseDir = scope === "project" || scope === "cli-project" ? options.cwd ?? process.cwd() : options.homeDir ?? userHomeDir();

    return path.join(baseDir, subdir);
  } catch (error) {
    throw new Error(`[targets:${targetId}:${scope ?? "noscope"}] ${error.message}`);
  }
}
