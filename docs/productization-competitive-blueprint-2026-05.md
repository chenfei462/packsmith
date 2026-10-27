# Packsmith 大众化产品交付与 GitHub 竞争力优化蓝图

日期：2026-05-25

Current status note: every `npx @packsmith/cli` command in this blueprint is the after-npm-publication path. For the current hackathon source-tree demo, use `npm ci && npm run demo`; real npm publication still requires maintainer credentials for `@packsmith/cli`.

## 一句话结论

Packsmith 不能只做“AI agent skill 的打包 CLI”。如果要在当前 GitHub 市场里有强竞争力，它必须变成一个面向真实用户的跨运行时技能包管理产品：能搜索、预览、安装、升级、审计、评测、发布，并且能让用户相信安装进去的技能不会浪费上下文、污染 agent 行为或带来供应链风险。

当前仓库已经越过了早期 MVP：有可运行 CLI、30 个官方 pack、本地 registry、4 个可安装目标、`doctor`、`audit`、`policy`、npm dry-run 和文档基础。下一步不是继续堆命令，而是补齐“陌生用户可以直接使用并愿意推荐”的产品闭环。

## 当前状态快照

本仓库在 2026-05-25 本地验证到的事实：

- `node src/cli.mjs --help` 已能展示搜索、安装、管理、审计和 authoring 命令。
- `node src/cli.mjs registry validate` 通过，当前 registry 有 30 个 pack。
- `node src/cli.mjs search review` 能返回真实官方 pack。
- `node src/cli.mjs show senior-code-reviewer` 能展示版本、目标 runtime、风险等级、上下文大小、来源、标签和安装量。
- `npm pack --dry-run` 成功，包名为 `packsmith@1.0.1`，tarball 大小约 65.4 kB，包含 CLI、registry、official-packs、docs、examples。
- npm 上 `packsmith` 已存在 `1.0.0`，描述为 “A minimal library for building packages.”；如果没有该包权限，当前项目无法直接用裸名 `packsmith` 发布。
- `@packsmith/cli` 和 `@packsmith/core` 在 npm registry 上未发现已发布包名，可以作为备选命名空间。

这说明 Packsmith 已经有产品雏形，但还没有达到“直接交付给大众”的标准。最大差距在：远程分发、真实 marketplace、官方竞品差异、用户体验、信任体系、质量评测、长期维护机制。

## 市场与竞品判断

### 1. 市场需求已经被验证

GitHub Docs 已经有 “Adding agent skills for GitHub Copilot” 文档，并且 GitHub CLI 提供 `gh skill` 公共预览。官方文档说明 `gh skill` 可用于从 GitHub 仓库发现、安装、更新、发布 agent skills。这是强烈的市场确认：agent skills 不再只是小圈子文件约定，而是 GitHub/Copilot 生态正在纳入的能力类型。

同时，GitHub `agent-skills` topic 下已经出现大量技能库、技能集合、marketplace 和工具项目。VoltAgent 的 awesome-agent-skills 类项目收录大量技能条目，AgentSkills.io 提供规范与最佳实践，社区也在围绕 Claude Code、Copilot、Codex、Cursor、Gemini 等运行时生成大量 workflow 资产。

结论：Packsmith 不是在教育一个不存在的市场，而是在进入一个快速形成标准和入口的市场。

### 2. 竞争压力也已经很强

Packsmith 面临的直接或间接竞争包括：

- GitHub CLI `gh skill`：官方入口，具备 GitHub 仓库发现、安装、更新、发布、预览、版本 pinning、agent/scope 参数等能力。
- `github/awesome-copilot`：GitHub 官方或半官方技能内容分发渠道，对 Copilot 用户有天然入口优势。
- `anthropics/skills` 与 Claude 技能生态：内容影响力强，用户已经把 “skill” 与 Claude/Copilot 语境绑定。
- `agentskills.io`：规范、最佳实践、评测思路，可能成为事实标准来源。
- Awesome list 和垂直技能库：它们未必做安装管理，但能占据发现入口。
- 各 agent runtime 自己的 plugin/skill installer：一旦运行时提供原生安装，单运行时 pack 管理会被平台吸收。

因此 Packsmith 的定位不能是“另一个 skill installer”。它必须强调：

- 跨运行时，而不是只服务 Copilot 或 Claude。
- 质量评测，而不是只复制文件。
- 供应链信任，而不是只下载 GitHub 目录。
- 团队治理，而不是只服务个人玩具。
- 内容策展和可交付 pack，而不是空 registry。

### 3. 竞品空位

即使 GitHub 有 `gh skill`，Packsmith 仍有可赢的空位：

- GitHub 官方工具天然偏 GitHub/Copilot；Packsmith 可以做 Claude Code、Codex、OpenCode、Cursor、Gemini CLI、OpenClaw、Hermes 等跨运行时适配。
- 官方工具能安装技能，但不一定给出强质量评分、上下文预算、重复指令检测、跨 runtime 兼容性报告。
- 社区 awesome list 能发现技能，但缺少可审计安装、lockfile、checksum、policy、团队 allowlist。
- 单个技能库有内容，但缺少标准化 manifest、pack bundle、target bridge、回滚、升级和组织分发。

Packsmith 的获胜角度应当是：

```text
把 GitHub 上分散的 agent skills 变成可验证、可安装、可治理、可跨运行时复用的软件包。
```

## 产品目标

### 面向大众用户的目标

一个陌生开发者应该能在 3 分钟内完成：

1. 安装 Packsmith。
2. 搜索一个有用 pack。
3. 预览它会改变什么。
4. 安装到自己正在使用的 agent。
5. 知道如何触发它。
6. 知道如何更新或卸载。

### 面向 GitHub 市场竞争的目标

Packsmith 在 GitHub README 首屏和演示里必须比竞品更清楚地回答：

- 为什么不用 `gh skill` 就够了？
- 为什么不用 awesome list 手动复制？
- 为什么不用某个 agent 自己的插件系统？
- 为什么用户要信任 Packsmith 的 registry？
- 为什么作者要把技能做成 Packsmith pack？

### 面向直接交付的目标

完成后，产品应达到：

- 可发布、可安装、可演示、可回滚。
- CLI 常用路径稳定，不需要用户读源码。
- Registry 有真实内容且可远程更新。
- 安装前有安全和行为预览。
- 安装后有 receipt、lock、audit、update。
- 文档能支持新用户、pack 作者、团队管理员、adapter 贡献者。

## 当前产品缺口诊断

### P0 缺口：npm 分发命名未解决

当前 `package.json` 使用 `packsmith@1.0.1`，但 npm 上已有 `packsmith@1.0.0`。这会阻断真实发布。

必须二选一：

- 拿到现有 `packsmith` npm 包权限，继续使用 `npx packsmith`。
- 改名为 scoped 包，例如 `@packsmith/cli`，并通过 `bin` 保持命令名 `packsmith`。

推荐方案：

```json
{
  "name": "@packsmith/cli",
  "bin": {
    "packsmith": "src/cli.mjs"
  }
}
```

用户命令变成：

```bash
npx @packsmith/cli search review
npm install -g @packsmith/cli
packsmith install senior-code-reviewer
```

如果未来拿到裸名，再保留迁移别名。

验收标准：

- `npm publish --dry-run` 在新包名下通过。
- `npm pack --dry-run` 内容完整。
- 从 tarball 安装后 `packsmith --help` 可运行。
- README 不再承诺无法发布的 `npx packsmith`，除非裸名权限已解决。

### P0 缺口：registry 仍是本地打包目录

当前 registry 是 `registry/catalog.json`，source 指向 `../official-packs/...`。这对本地包和 npm tarball 有效，但不是真正的远程生态。

大众产品需要至少三层 registry：

- bundled registry：随 npm 包发出，保证离线可用。
- remote official registry：从 GitHub raw、release asset 或 CDN 拉取最新目录。
- custom registry：团队或个人可以配置自己的 catalog。

推荐命令：

```bash
packsmith registry list
packsmith registry add official https://raw.githubusercontent.com/packsmith/registry/main/catalog.json
packsmith registry use official
packsmith registry refresh
packsmith search review --remote
```

验收标准：

- 首次安装无需网络也能用 bundled registry。
- 有网络时能检查 official registry 是否有更新。
- registry 条目支持 `source.type`：`local`、`git`、`github-archive`、`npm-tarball`、`http-archive`。
- 远程 source 必须有 checksum 或 commit SHA。
- `packsmith audit` 能报告 registry 是否过期。

### P0 缺口：安装前预览不足

GitHub Docs 明确提醒：skills 可能包含 prompt injection、隐藏指令或恶意脚本，安装前应检查内容。Packsmith 当前有 `show` 和 `doctor`，但没有强产品化的 install preview。

必须新增：

```bash
packsmith preview senior-code-reviewer
packsmith install senior-code-reviewer --preview
packsmith install senior-code-reviewer --yes
```

预览必须显示：

- 将安装到哪些目录。
- 会写入哪些文件。
- 是否有 `scripts/`、可执行文件、二进制文件、大文件。
- `SKILL.md` frontmatter 和触发描述。
- 权限声明：shell、filesystem、network、browser。
- 上下文大小。
- 风险评分。
- provenance：source、commit、checksum、publisher。
- 与目标 agent 的兼容性。

默认策略：

- 交互终端下，首次安装 remote pack 必须确认。
- CI 或非交互下，要求 `--yes` 或 `--policy`。
- 高风险 pack 必须显示原因，不能静默安装。

验收标准：

- `packsmith install <remote-pack>` 默认先输出 summary 并等待确认。
- `--dry-run` 不写文件，只显示完整 install plan。
- `--json` 输出机器可读 install plan，供 CI 和 Studio 使用。

### P1 缺口：跨运行时适配还不够硬

当前支持 Claude Code、Codex、OpenCode、Cursor，其中 OpenCode 和 Cursor 是 baseline bridge。要成为强竞争产品，需要把 adapter 做成 Packsmith 的护城河。

每个 adapter 必须有：

- 官方文档来源和确认日期。
- 支持范围：personal、project、workspace、global。
- 安装路径检测。
- 文件格式生成。
- 验证逻辑。
- uninstall 逻辑。
- smoke test。
- compatibility warning。
- 版本兼容矩阵。

推荐目录：

```text
src/adapters/
  claude-code.mjs
  codex.mjs
  github-copilot.mjs
  cursor.mjs
  opencode.mjs
  gemini-cli.mjs
docs/adapters/
  claude-code.md
  codex.md
  github-copilot.md
  cursor.md
  opencode.md
```

必须新增 GitHub Copilot adapter，因为 GitHub 已经把 agent skills 作为官方概念推进。Packsmith 不支持 Copilot 会削弱 GitHub 市场竞争力。

推荐优先级：

1. Claude Code：skill 心智强，社区内容多。
2. GitHub Copilot：GitHub 市场入口强，必须支持。
3. Codex：当前项目用户语境相关，保留强支持。
4. Cursor：开发者基数大，但规则系统和 skill 语义不完全相同，需要清楚标注。
5. OpenCode：开源 agent runtime，有早期用户价值。
6. Gemini CLI：等目录和 skill 约定稳定后支持。

验收标准：

- `packsmith targets` 展示每个目标的状态、安装路径和文档确认日期。
- `packsmith doctor <pack> --target github-copilot` 能输出兼容性结果。
- 每个 supported adapter 至少有 3 个测试：dry-run、install、remove。

### P1 缺口：pack 质量没有形成可比较分数

当前 `doctor` 已有上下文预算、触发条件、输出格式、portability score，但还不足以在 GitHub 上形成差异。

应升级为 Packsmith Quality Score：

```bash
packsmith doctor senior-code-reviewer
packsmith doctor official-packs --all
packsmith score senior-code-reviewer --json
```

评分维度：

- Discoverability：名称、描述、标签、category 是否清楚。
- Trigger Quality：触发条件是否具体，是否避免 always-on。
- Instruction Safety：是否有隐藏高风险指令、绕过用户确认、过度授权。
- Output Contract：是否定义结果格式。
- Context Efficiency：上下文大小、重复段落、长文件比例。
- Portability：支持目标、target-specific caveats。
- Asset Hygiene：文件数量、二进制、脚本、外部依赖。
- Testability：是否有 examples、fixtures、expected output。
- Maintenance：license、version、changelog、source、更新时间。

输出示例：

```text
Packsmith Score: senior-code-reviewer

Overall: 91/100
Trust: A
Context: 4.2k chars, low pressure
Portability: Claude Code, Codex, Copilot, Cursor

Warnings:
- Cursor adapter uses bridge rule semantics, not native skill routing.

Recommended fixes:
- Add one example output fixture for review findings.
```

验收标准：

- 官方 30 个 pack 全部达到 85 分以上。
- 低于 70 分的 pack 不允许进入 verified registry。
- `registry validate` 可选择 `--quality-gate 85`。

### P1 缺口：官方 packs 数量够，但深度还不够

30 个官方 pack 是好的 launch 起点，但大众产品不只看数量。每个 pack 都应该像可以马上用的“小产品”。

每个官方 pack 应补齐：

- README：做什么、何时使用、示例 prompt、预期输出。
- 真实 examples：输入任务、输出样例。
- fixtures：用于质量评测。
- CHANGELOG。
- 维护状态。
- 适用目标差异说明。
- 权限解释。
- 安装后 next step。

推荐官方 pack 分层：

- Essential：代码评审、安全、测试、文档、repo map。
- Workflow：release、issue triage、migration、dependency upgrade。
- Specialist：Terraform、database index、frontend state、API contract。
- Meta：skill author、workflow packager、context budgeter。

当前 registry 已经有后续未纳入 catalog 的目录，例如 accessibility、api-contract、architecture、ci-failure、dependency-upgrader、migration、terraform 等。应把它们分批升级为第二波官方 pack，而不是一次性全塞进 registry。

验收标准：

- 首批 30 个 pack 全部有 README 和至少 1 个 example。
- 首页展示 5 个最强 pack，不展示 30 个平铺列表。
- 每个 pack 的 `show` 页面能告诉用户“安装后如何触发”。
- 新增 pack 必须通过 score 和安全检查。

### P1 缺口：缺少真正的 GitHub-first 项目包装

要在 GitHub 市场有竞争力，仓库本身必须像成熟产品。

必须补齐：

- Demo GIF 或 asciinema。
- README 首屏演示：搜索、预览、安装、审计。
- Badges：npm version、CI、license、registry packs、supported targets。
- Issue templates：bug、adapter request、pack request、security report。
- Pull request template。
- Discussions 分类：pack ideas、adapter support、showcase。
- Security policy。
- Code of Conduct。
- Maintainer guide。
- GitHub release notes。
- `.github/workflows/ci.yml`：test、registry validate、quality gate、npm pack。
- `.github/workflows/release.yml`：tag、npm publish、GitHub release。

首页首屏建议：

```md
# Packsmith

The cross-agent package manager and trust gate for AI agent workflows.

```bash
npx @packsmith/cli search review
npx @packsmith/cli preview senior-code-reviewer
npx @packsmith/cli install senior-code-reviewer --target codex
```

Install once. Use the same reviewed workflow in Claude Code, Codex, GitHub Copilot, Cursor, OpenCode, and local TRAE Skill directories.
```

注意：如果没有裸名 npm 权限，README 必须使用 `npx @packsmith/cli`，不能继续把 `npx packsmith` 当作公开安装路径。

验收标准：

- 新用户在 README 前 30 秒内知道产品用途。
- README 有真实录制，不是静态想象命令。
- Release 页面有 tarball、checksums、changelog。

## 直接交付产品的功能规格

### 1. 安装与首次运行

目标：用户不需要理解 source pack、bundle、target adapter。

命令：

```bash
npx @packsmith/cli
npx @packsmith/cli search review
npx @packsmith/cli preview senior-code-reviewer
npx @packsmith/cli install senior-code-reviewer
```

行为：

- 无命令时打开交互式 TUI。
- 检测本机已存在的 agent 目录。
- 如果发现多个目标，让用户选择。
- 如果没有发现目标，提供 project-scope 安装选项或安装到 Packsmith store。
- 安装成功后展示下一步 prompt。

必须支持：

- Windows PowerShell。
- macOS zsh。
- Linux bash。
- 非交互 CI。

验收：

- Windows、macOS、Linux 至少各有一次 smoke test 记录。
- 第一次安装成功后，`packsmith list` 能看到 pack。
- `packsmith remove` 能删除所有写入文件。

### 2. 搜索与发现

目标：Packsmith 要像 package manager，而不是 JSON grep。

命令：

```bash
packsmith search review
packsmith search --category code-quality
packsmith search --target codex
packsmith search --verified
packsmith show senior-code-reviewer
packsmith browse
```

搜索排序应考虑：

- exact id match。
- name/description match。
- category/tag。
- verified。
- quality score。
- install count。
- updatedAt。
- target compatibility。

`show` 必须展示：

- 一句话用途。
- 适用场景。
- 不适用场景。
- 安装命令。
- 支持目标。
- 权限。
- 风险。
- 上下文大小。
- 评分。
- 维护者。
- source/provenance。
- 示例触发 prompt。

验收：

- `search review` 返回结果不超过 10 个，按相关性排序。
- `show` 输出可被非作者理解。
- `--json` 可供 Studio 或第三方 UI 消费。

### 3. Preview 与安全检查

目标：让安装前信任成为默认体验。

命令：

```bash
packsmith preview senior-code-reviewer
packsmith preview github:owner/repo/path
packsmith scan senior-code-reviewer
```

检查项：

- prompt injection 关键词和可疑模式。
- 隐藏指令、base64、大段混淆内容。
- shell 脚本、可执行位、二进制文件。
- 网络访问说明。
- 文件系统写入说明。
- 目标 agent bridge 文件会如何生成。
- 可能常驻上下文的内容大小。
- 是否包含 license。

风险等级：

- low：纯 markdown 技能，无脚本，无网络。
- medium：包含脚本或依赖，但权限声明清楚。
- high：需要 shell/network/browser required，或存在混淆/下载执行。
- blocked：违反 policy 或校验失败。

验收：

- 安装 remote pack 前默认展示 preview summary。
- 高风险 pack 需要显式 `--allow-risk high`。
- policy 可以禁止 high risk。

### 4. 远程安装与版本 pinning

目标：从 GitHub 和 registry 安装是真实可用的。

命令：

```bash
packsmith install senior-code-reviewer@0.2.0
packsmith install github:packsmith/official-packs/senior-code-reviewer@v0.2.0
packsmith install github:owner/repo/path/to/skill@SHA
packsmith pin senior-code-reviewer@0.2.0
packsmith update
```

必须实现：

- SemVer version。
- Git tag。
- commit SHA。
- checksum。
- lockfile。
- update check。
- pinned pack 跳过更新。

lockfile 示例：

```json
{
  "pack": "senior-code-reviewer",
  "version": "0.2.0",
  "source": "github:packsmith/official-packs/senior-code-reviewer",
  "ref": "v0.2.0",
  "resolved": "commit-sha",
  "checksum": "sha256-...",
  "targets": ["codex"]
}
```

验收：

- 相同 lockfile 在两台机器安装结果一致。
- checksum mismatch 阻止安装。
- update 不会覆盖用户本地修改，必须先提示 diff 或备份。

### 5. Studio / TUI 产品层

当前无命令时已有轻量 interactive browser。要做成可交付产品，建议先强化 TUI，再考虑 Web Studio。

TUI 必须支持：

- 浏览分类。
- 搜索。
- 查看详情。
- Preview。
- 选择目标。
- 安装。
- 查看已安装。
- 更新。
- 卸载。
- 复制命令。

Web Studio 可作为 P2：

```bash
packsmith studio
```

Studio 页面：

- Dashboard：已安装 packs、目标 agent、风险状态。
- Registry：搜索、分类、详情。
- Pack detail：README、examples、score、files、permissions。
- Install plan：写入路径和 diff。
- Audit：checksum、policy、updates。
- Authoring：validate、doctor、publish dry-run。

验收：

- TUI 可在 Windows PowerShell 正常退出。
- README 有真实 TUI 截图或 GIF。
- Studio 不阻塞首个可交付版本，但 API 输出要为它预留。

### 6. Authoring 与发布

目标：让高质量社区 pack 能进入生态。

命令：

```bash
packsmith init my-pack
packsmith doctor my-pack
packsmith test my-pack
packsmith publish my-pack --dry-run
packsmith registry submit my-pack
```

新增能力：

- 交互式 init，询问 category、target、permissions。
- manifest schema 校验。
- SKILL.md frontmatter 校验。
- examples/fixtures 校验。
- quality score。
- license 检查。
- 自动生成 README。
- 生成 registry entry。
- 可选创建 GitHub PR。

发布流程：

1. 作者运行 `doctor` 和 `test`。
2. 作者运行 `publish --dry-run`。
3. Packsmith 生成 registry entry。
4. 作者运行 `registry submit` 打开 PR。
5. CI 运行 quality gate、安全扫描、adapter build。

验收：

- 一个新作者 10 分钟内能创建一个合格 pack。
- registry PR 模板自动列出 score、安全结果、支持目标。

### 7. 团队与企业治理

这不是首屏卖点，但会决定 Packsmith 是否能长期有商业/组织价值。

功能：

```bash
packsmith policy init
packsmith audit --ci
packsmith sync --policy .packsmith-policy.json
packsmith install --policy .packsmith-policy.json senior-code-reviewer
```

policy 应支持：

- allowed registries。
- allowed publishers。
- allowed packs。
- blocked packs。
- max risk。
- required verified。
- allowed permissions。
- required checksum。
- no remote scripts。
- allowed targets。

CI 场景：

- 阻止未验证 pack 进入 repo。
- 阻止高风险权限。
- 检查 lockfile 是否过期。
- 检查安装目录是否被篡改。

验收：

- 示例 GitHub Action 可直接复制。
- `audit --ci` 有稳定退出码。
- policy 错误信息可操作。

## 技术架构优化

### 模块拆分

当前 `src/lib/pack.mjs` 较大，长期维护应拆分：

```text
src/
  cli.mjs
  commands/
    install.mjs
    search.mjs
    preview.mjs
    doctor.mjs
    audit.mjs
    registry.mjs
  core/
    manifest.mjs
    build.mjs
    install-plan.mjs
    lockfile.mjs
    checksum.mjs
    policy.mjs
    score.mjs
  adapters/
    index.mjs
    claude-code.mjs
    codex.mjs
    github-copilot.mjs
    cursor.mjs
    opencode.mjs
  registry/
    client.mjs
    sources.mjs
    resolver.mjs
```

拆分目的不是重构好看，而是让新 adapter、新 source、新命令不会把一个文件变成风险集中点。

验收：

- 公共 API 有单元测试。
- command 层只处理参数和输出。
- core 层可被 TUI/Studio 复用。

### 数据结构升级

manifest 应扩展：

```json
{
  "name": "senior-code-reviewer",
  "version": "0.2.0",
  "description": "...",
  "category": "code-quality",
  "license": "MIT",
  "homepage": "...",
  "repository": "...",
  "permissions": {
    "shell": "none",
    "filesystem": "required",
    "network": "none",
    "browser": "none"
  },
  "targets": ["claude-code", "codex", "github-copilot"],
  "skills": [...],
  "prompts": [...],
  "examples": [...],
  "quality": {
    "minScore": 85
  }
}
```

registry entry 应扩展：

```json
{
  "id": "senior-code-reviewer",
  "version": "0.2.0",
  "source": {
    "type": "github-archive",
    "repo": "packsmith/official-packs",
    "path": "packs/senior-code-reviewer",
    "ref": "v0.2.0",
    "checksum": "sha256-..."
  },
  "publisher": {
    "id": "packsmith",
    "verified": true
  },
  "score": 91,
  "riskLevel": "low"
}
```

验收：

- schema version bump。
- 老 catalog 可迁移。
- `registry validate` 对新老格式都有明确错误。

### 输出规范

所有命令应支持：

```bash
--json
--quiet
--no-color
```

原因：

- Studio 复用。
- CI 解析。
- 用户 issue 可复制。

验收：

- 每个主命令都有 snapshot 测试。
- JSON 输出有 schema 测试。

## 产品体验优化

### 错误信息

错误必须包含：

- 发生了什么。
- 为什么会发生。
- 用户下一步做什么。
- 如果适合，给出可复制命令。

示例：

```text
Could not install senior-code-reviewer to GitHub Copilot.

Packsmith could not find a project or personal Copilot skills directory.

Try one of:
  packsmith install senior-code-reviewer --target github-copilot --scope project
  mkdir -p .github/skills
  packsmith targets github-copilot
```

### 安装成功输出

成功输出必须让用户马上知道怎么用：

```text
Installed senior-code-reviewer

Target:
- Codex: ~/.codex/skills/senior-code-reviewer

Try it:
Ask your agent: "Use the senior-code-reviewer pack to review my current diff."

Manage:
- packsmith list
- packsmith update senior-code-reviewer
- packsmith remove senior-code-reviewer
```

### README 信息架构

建议顺序：

1. 产品一句话。
2. 15 秒 demo。
3. 为什么存在。
4. 安装。
5. 搜索和安装 pack。
6. 支持目标。
7. 官方 packs 精选。
8. 安全与信任。
9. 作者指南。
10. 团队治理。
11. Roadmap。
12. Contributing。

避免首屏过度解释 manifest、bundle、内部目录。

## GitHub 增长与竞争策略

### 1. 明确对标语

建议：

```text
GitHub has gh skill for Copilot. Packsmith is for everyone else too.
```

更稳妥版本：

```text
Packsmith complements native skill installers by adding cross-agent packaging, quality checks, and policy-aware installs.
```

### 2. Demo 要展示差异

Demo 不要只展示 `search`，要展示官方工具没有完全覆盖的闭环：

```bash
packsmith preview senior-code-reviewer --target codex
packsmith install senior-code-reviewer --target codex
packsmith install senior-code-reviewer --target cursor
packsmith audit
packsmith doctor official-packs/senior-code-reviewer
```

视觉重点：

- 同一个 pack 安装到多个 agent。
- 安装前显示风险和上下文大小。
- audit 发现 tamper 或 update。
- quality score。

### 3. 首批 issue 标签

建议设置：

- `adapter-request`
- `pack-request`
- `registry-submission`
- `quality-gate`
- `security`
- `good-first-pack`
- `runtime-docs-needed`

### 4. 社区贡献入口

比“欢迎 PR”更具体：

- “提交一个 pack”：提供模板。
- “请求支持一个 agent”：提供 adapter checklist。
- “改进一个官方 pack”：提供 quality score 目标。
- “报告安装路径错误”：提供 target diagnostic。

### 5. 内容策略

Launch 后 2 周内应该发布：

- “Why agent skills need a package manager”
- “Installing one code-review skill across Claude Code, Codex, Copilot, and Cursor”
- “How Packsmith scores agent skills”
- “The security model for installing agent workflows”
- “Submit your first Packsmith pack”

## 优先级路线图

### Phase 0：发布阻塞清理，1-2 天

目标：解决不能真实发布的问题。

任务：

- 决定 npm 包名：争取 `packsmith` 权限或改为 `@packsmith/cli`。
- 更新 README 中所有安装命令。
- 验证 tarball 安装后的 CLI。
- 确保 GitHub Actions CI 跑 `npm test`、`registry validate`、`npm pack --dry-run`。
- 添加 SECURITY.md、issue templates、PR template。

验收：

- 可以从 npm 或 tarball 安装。
- README 命令与真实发布路径一致。

### Phase 1：安装前信任闭环，3-5 天

目标：让 Packsmith 明显区别于手动复制和普通 installer。

任务：

- 新增 `preview`。
- 新增 install plan。
- install 默认展示 remote preview。
- doctor 升级为 score。
- registry validate 支持 quality gate。
- 高风险权限拦截。

验收：

- 用户安装前能看到写入路径、风险、权限、上下文大小。
- 官方 pack 全部通过 score 门槛。

### Phase 2：远程 registry 与版本锁定，5-8 天

目标：从“随包自带 catalog”变成真正生态入口。

任务：

- 设计 registry source schema。
- 支持 GitHub archive source。
- 支持 checksum。
- 支持 version/ref/SHA。
- lockfile 增强。
- update/pin。
- registry refresh。

验收：

- 能从 GitHub remote registry 安装 pack。
- lockfile 可复现安装。
- checksum mismatch 阻止安装。

### Phase 3：GitHub Copilot 与 adapter 硬化，5-8 天

目标：在 GitHub 市场里不缺席官方 skill 生态。

任务：

- 新增 `github-copilot` adapter。
- 增加 `packsmith targets`。
- 为每个 adapter 写 docs。
- 为 Claude/Codex/Copilot/Cursor/OpenCode 增加 smoke tests。
- 明确 project/personal scope。

验收：

- 同一 pack 可安装到至少 5 个目标。
- 每个 supported target 有测试和文档来源。

### Phase 4：官方 pack 产品化，5-10 天

目标：让 registry 内容从“可用”变成“值得装”。

任务：

- 每个首批 pack 增加 README。
- 每个首批 pack 增加 examples。
- 增加 pack detail 内容字段。
- 选出 5 个 hero packs。
- 将已有未入 catalog 的 pack 分批质量化。

验收：

- 官方 pack 平均 score >= 90。
- 首页能展示强例子，而不是靠数量取胜。

### Phase 5：TUI/Studio 与增长资产，3-7 天

目标：让项目可演示、可传播。

任务：

- TUI 支持 preview、install、list、remove。
- 录制 GIF。
- 添加 docs/assets。
- README 首屏嵌入 demo。
- 发布 GitHub release。

验收：

- 用户无需读长文档即可看懂核心价值。
- Launch 资产可用于 GitHub、X、HN、Reddit、Discord。

## 发布前最终验收清单

### 安装

- [ ] npm 包名已解决。
- [ ] `npm publish --dry-run` 通过。
- [ ] tarball 安装后 `packsmith --help` 正常。
- [ ] Windows、macOS、Linux smoke test 通过。

### Registry

- [ ] bundled registry 可用。
- [ ] remote registry 可 refresh。
- [ ] 至少 30 个官方 pack。
- [ ] 所有 verified pack 有 checksum/provenance。
- [ ] `registry validate --quality-gate 85` 通过。

### 核心命令

- [ ] `search`
- [ ] `show`
- [ ] `preview`
- [ ] `install`
- [ ] `list`
- [ ] `remove`
- [ ] `update`
- [ ] `doctor`
- [ ] `audit`
- [ ] `policy validate`
- [ ] `targets`

### 安全

- [ ] remote install 默认预览。
- [ ] 高风险权限需要显式确认。
- [ ] checksum mismatch 阻止安装。
- [ ] policy 可阻止 unverified/high-risk pack。
- [ ] SECURITY.md 存在。

### 文档

- [ ] README 首屏命令真实可运行。
- [ ] Demo GIF 存在。
- [ ] Quick Start 不依赖源码 checkout。
- [ ] Adapter docs 存在。
- [ ] Registry submission guide 可执行。
- [ ] Pack authoring guide 可执行。
- [ ] Release checklist 更新。

### GitHub 项目包装

- [ ] CI workflow。
- [ ] Release workflow。
- [ ] Issue templates。
- [ ] PR template。
- [ ] Discussions 分类。
- [ ] Badges。
- [ ] Topics：`agent-skills`、`claude-code`、`codex`、`copilot`、`cursor`、`ai-agents`、`cli`。

## 关键风险

### 风险 1：被 GitHub 官方 `gh skill` 吸收

应对：

- 不和 `gh skill` 正面抢 Copilot-only 安装。
- 强调跨运行时、质量 score、policy、audit、registry federation。
- 支持从 GitHub skill repo 导入，成为增强层。

### 风险 2：registry 内容变成低质量 prompt 集合

应对：

- verified pack 必须过 quality gate。
- pack detail 必须展示 examples 和 score。
- 官方 pack 宁少勿滥。

### 风险 3：安装技能带来安全事故

应对：

- 默认 preview。
- 权限声明。
- checksum。
- policy。
- 安全扫描。
- 高风险阻断。

### 风险 4：跨 runtime 适配承诺过度

应对：

- 每个 adapter 标注 support level。
- planned 不等于 supported。
- 文档写清楚上游约定确认日期。
- baseline bridge 必须诚实说明限制。

### 风险 5：npm 名称影响首发

应对：

- 立即改 scoped 包或拿权限。
- README 和 launch 文案不使用无法安装的命令。
- 未来再做裸名迁移。

## 推荐最终定位

主标题：

```text
The cross-agent package manager and trust gate for AI agent workflows.
```

副标题：

```text
Search, preview, install, score, and audit reusable agent workflows across Claude Code, Codex, GitHub Copilot, Cursor, OpenCode, and local TRAE Skill directories.
```

中文理解：

```text
Packsmith 是 AI agent 技能的跨运行时包管理器。
它不只是复制 SKILL.md，而是把技能变成可发现、可验证、可安装、可升级、可审计的软件包。
```

## 最终建议

Packsmith 现在已经有不错的骨架，最不应该做的是继续把它当内部 CLI 慢慢补。要面向大众交付，应当立刻把优先级压到：

1. 解决 npm 发布路径。
2. 做强 preview、score、audit 这三个信任能力。
3. 建立 remote registry 和 checksum/pinning。
4. 支持 GitHub Copilot adapter。
5. 把官方 pack 做成有 README、examples、评分的真实内容。
6. 用真实 demo 和 GitHub 项目包装完成 launch。

只要这六件事完成，Packsmith 在 GitHub 市场里的叙事就会从“另一个技能打包工具”变成：

```text
一个让 AI agent skills 像 npm 包一样被安装、信任、复用和治理的产品。
```

这才是可以直接交付给大众使用、并且有机会在 GitHub 上获得强竞争力的版本。

## 参考来源

- GitHub Docs: Adding agent skills for GitHub Copilot, https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/add-skills
- GitHub Topics: agent-skills, https://github.com/topics/agent-skills
- Agent Skills specification and ecosystem, https://agentskills.io/
- GitHub repository: github/awesome-copilot, https://github.com/github/awesome-copilot
- GitHub repository: VoltAgent/awesome-agent-skills, https://github.com/VoltAgent/awesome-agent-skills
- npm package lookup for `packsmith`, checked on 2026-05-25 with `npm view packsmith`
