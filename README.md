# Packsmith

Build one skill pack, ship it to every coding agent runtime.

[![CI](https://github.com/chenfei462/packsmith/actions/workflows/ci.yml/badge.svg)](https://github.com/chenfei462/packsmith/actions/workflows/ci.yml)
[![Publish](https://github.com/chenfei462/packsmith/actions/workflows/publish.yml/badge.svg)](https://github.com/chenfei462/packsmith/actions/workflows/publish.yml)
`Node >=20` `Zero runtime deps` `Targets: claude-code + codex`
[Verification Snapshot](./docs/verification.md)
![Packsmith verification card](./docs/assets/packsmith-verification-card.svg)
<!-- packsmith-verification:start -->
Current verification: `npm run eval` | example packs: 3 | npm published: false | npm pack files: 6
Clean-machine demo: npm run smoke:example
Install success rate: 4/4 install paths verified by smoke:example
Preferred install: source eval (npm run eval)
Global install: future path until npm publication
Global install command: npm install -g @chenfei462/packsmith
Claude Code scoped install: packsmith install examples/research-launchpad --target claude-code --scope user
Codex bridge: packsmith install examples/research-launchpad --target codex --dest <dir>
<!-- packsmith-verification:end -->

[English](#english) | [中文](#中文)

![Packsmith hero](./docs/assets/packsmith-hero.svg)

![Packsmith terminal demo](./docs/assets/packsmith-demo-terminal.svg)

## English

### What it is

`packsmith` is a zero-dependency CLI for packaging reusable agent skills and prompts. You author one source pack, validate it, inspect its context footprint, build target-specific bundles, and install those bundles locally.

Current targets:

- `claude-code`
- `codex`

### Target support matrix

| Runtime | Build bundles | Direct install | Installed bundle introspection |
| --- | --- | --- | --- |
| `claude-code` | yes | `install --scope user|project` | `list / doctor / uninstall` |
| `codex` | yes | explicit `install --dest` | no built-in `list / doctor / uninstall` flow yet |

### Why this project exists

The agent-skills ecosystem already has demand. What it lacks is packaging discipline.

As of May 13, 2026:

- GitHub `agent-skills` listed 4,526 public repositories.
- `anthropics/skills` showed 133k stars.
- real issues in that ecosystem were still about discoverability, duplicate loading, and install-path mismatches.

See [GitHub demand research](./docs/github-demand-2026-05.md) for source links and issue context.

That is the wedge for Packsmith: not another giant skills repo, but the distribution layer between authors and runtimes.

### The product loop

```bash
packsmith init my-pack
packsmith inspect my-pack
packsmith validate my-pack
packsmith install my-pack --target claude-code --scope user
packsmith list --target claude-code --scope user
packsmith doctor --target claude-code --scope user
packsmith uninstall my-pack --target claude-code --scope user
```

### First run

Packsmith currently requires Node.js `>=20`.

As of May 22, 2026, the scoped npm package `@chenfei462/packsmith` is not published yet. The fastest verifiable way to evaluate the project today is from the repo root:

```bash
npm install
npm run eval
```

After npm publication, the public install path becomes:

```bash
npm install -g @chenfei462/packsmith
packsmith --help
packsmith init demo-pack
```

`npm run eval` verifies four concrete things in temporary space:

1. `init`, `inspect`, `validate`, and `build` work from source
2. a Codex install with `--dest` emits a real `AGENTS.md` bridge file
3. a Claude Code scoped install can be listed, diagnosed, and uninstalled cleanly
4. the packed npm tarball installs a working `packsmith` CLI entrypoint

### Example packs

Packsmith ships three intentionally different example packs:

- [`examples/research-launchpad`](./examples/research-launchpad): discovery and product-positioning work driven by GitHub demand signals
- [`examples/incident-triage`](./examples/incident-triage): operational debugging and stakeholder-update workflows for production incidents
- [`examples/maintainer-handoff`](./examples/maintainer-handoff): onboarding, runbook capture, and ownership-transfer workflows for an incoming maintainer

### Copy this structure

If you are creating your first pack, start from one of these shapes instead of inventing your own tree:

Exact files to copy:

- `examples/research-launchpad/packsmith.json`
- `examples/research-launchpad/skills/github-demand/SKILL.md`
- `examples/research-launchpad/prompts/launch.md`
- `examples/incident-triage/packsmith.json`
- `examples/incident-triage/skills/service-triage/SKILL.md`
- `examples/incident-triage/prompts/status-brief.md`
- `examples/maintainer-handoff/packsmith.json`
- `examples/maintainer-handoff/skills/system-handoff/SKILL.md`
- `examples/maintainer-handoff/prompts/onboarding-brief.md`

```text
examples/research-launchpad/
  packsmith.json
  skills/github-demand/SKILL.md
  prompts/launch.md

examples/incident-triage/
  packsmith.json
  skills/service-triage/SKILL.md
  prompts/status-brief.md

examples/maintainer-handoff/
  packsmith.json
  skills/system-handoff/SKILL.md
  prompts/onboarding-brief.md
```

Each example shows the same pattern: one skill directory, one prompt, and names that match the workflow instead of generic placeholders.

### Why not copy folders by hand

Copying skill folders manually is fine for one-off experiments. It breaks down once you want repeatable installs and a repo you can trust.

- manual copying does not track installs, so you cannot reliably list what came from which pack later
- manual copying does not detect drift, so missing skills or mirrored prompts only show up after a runtime breaks
- manual copying gives you no strict validation, so prompt collisions and malformed `SKILL.md` files slip through until later

### Install

The unscoped npm package name `packsmith` is already taken by another project.

The scoped package for this project is `@chenfei462/packsmith`. Until npm publication completes, global install remains a future path and source evaluation is the trusted fallback:

```bash
npm test
npm run eval
```

Published user path:

```bash
npm install -g @chenfei462/packsmith
packsmith --help
packsmith init demo-pack
```

For Claude Code:

```bash
packsmith install examples/research-launchpad --target claude-code --scope user
packsmith install examples/research-launchpad --target claude-code --scope project
packsmith upgrade examples/research-launchpad --target claude-code --scope user
packsmith list --target claude-code --scope user
packsmith doctor --target claude-code --scope user
packsmith uninstall research-launchpad --target claude-code --scope user
```

After install, Packsmith writes managed metadata under `.claude/packsmith/<pack-name>/`: an install source, a version lock, file hashes, and mirrored bundle metadata. `packsmith doctor` compares that lock with the live skill and prompt files, so missing files and drift are visible before runtime use. `upgrade` uses the same replacement path as install and records the previous locked version; `uninstall` reads the same metadata so rollback-by-patch-release and removal clean up the same managed files.

For Codex, keep using explicit `--dest` because the runtime entry remains repo-oriented around an `AGENTS.md` bridge:

```bash
packsmith install examples/research-launchpad --target codex --dest ./codex-packsmith-check
```

### Release posture

Packsmith treats release readiness as a first-class check:

```bash
npm run release:check
```

The official release entry is a GitHub Release such as `v0.1.0`. That release triggers `publish.yml`, which uses npm trusted publishing and provenance. After publication, `post-publish-verification.yml` runs `npm run verification:sync` and opens a PR for generated proof updates instead of pushing directly to `main`.

Maintainer release docs:

- [Release playbook](./docs/release-playbook.md)
- [Launch kit](./docs/launch-kit.md)
- [Post-publish verification matrix](./docs/post-publish-verification-matrix.md)
- [Verification snapshot](./docs/verification.md)

Every release is tied to a clean-machine demo and install success rate in the generated verification snapshot. Today that evidence is `npm run smoke:example` in a temporary workspace, temporary `HOME`, temporary npm prefix, and temporary install destinations, with a `4/4` install success rate across source CLI, Codex `--dest`, Claude Code scoped lifecycle, and packaged tarball CLI paths.

### Publish footprint

The current `npm pack --dry-run` output is intentionally small. The footprint is verified by `npm run release:check`.

- published files: `LICENSE`, `README.md`, `package.json`, `src/cli.mjs`, `src/lib/fs-utils.mjs`, `src/lib/pack.mjs`
- excluded on purpose: docs, examples, tests, and release-only repo files

### Current limits

- maintained runtime targets are `claude-code` and `codex`
- Codex installs still rely on explicit `--dest`
- there is no remote pack registry or remote pack fetch flow yet
- no GUI or marketplace is included in the 0.1.x launch scope

### Commands

- `packsmith init <pack-dir>`: scaffold a new pack
- `packsmith validate <pack-dir>`: verify manifest, skills, prompts, and targets
- `packsmith validate <pack-dir> --strict`: fail on duplicate-content or oversized-pack diagnostics
- `packsmith inspect <pack-dir> [--json]`: summarize assets, context weight, and diagnostics
- `packsmith build <pack-dir> [--out dist]`: emit target bundles
- `packsmith install <pack-or-built-dir> --target <name> --dest <dir>`: copy one built bundle into a destination
- `packsmith install <pack-or-built-dir> --target claude-code --scope <project|user>`: install into known Claude Code directories
- `packsmith upgrade <pack-or-built-dir> --target claude-code --scope <project|user>`: replace a managed Claude Code install and refresh its version lock
- `packsmith list --target claude-code --scope <project|user> [--json]`: show installed Claude Code packs
- `packsmith doctor --target claude-code --scope <project|user> [--json]`: diagnose install paths and installed state
- `packsmith uninstall <pack-name> --target claude-code --scope <project|user>`: remove an installed Claude Code pack

### Repository story

This repo is intentionally small and launchable:

- three real example packs:
  [`examples/research-launchpad`](./examples/research-launchpad),
  [`examples/incident-triage`](./examples/incident-triage),
  and [`examples/maintainer-handoff`](./examples/maintainer-handoff)
- one CLI entrypoint in [`src/cli.mjs`](./src/cli.mjs)
- one core implementation module in [`src/lib/pack.mjs`](./src/lib/pack.mjs)
- tests covering `init`, `validate`, `inspect`, `build`, and `install`
- CI on pushes and pull requests

### Maintainer docs

- [Positioning](./docs/positioning.md)
- [Launch plan](./docs/launch-plan.md)
- [Release playbook](./docs/release-playbook.md)
- [Launch kit](./docs/launch-kit.md)
- [GitHub demand research](./docs/github-demand-2026-05.md)
- [Runtime assumptions](./docs/runtime-assumptions.md)
- [Specification](./docs/specification.md)

### License

MIT

## 中文

### 这是什么

`packsmith` 是一个零运行时依赖的 CLI，用来把可复用的 agent skills 和 prompts 打包成面向不同 coding-agent runtime 的分发产物。你只维护一个源 pack，然后执行验证、上下文体积检查、构建和本地安装。

当前目标 runtime：

- `claude-code`
- `codex`

### 目标支持矩阵

| Runtime | 构建 bundle | 直接安装 | 已安装 bundle 检查 |
| --- | --- | --- | --- |
| `claude-code` | 支持 | `install --scope user|project` | `list / doctor / uninstall` |
| `codex` | 支持 | 显式 `install --dest` | 还没有内建的 `list / doctor / uninstall` 流程 |

### 快速上手

Packsmith 需要 Node.js `>=20`。

在 npm 正式发布前，可信 fallback 是从源码运行：

```bash
npm install
npm run eval
```

发布后的用户路径是：

```bash
npm install -g @chenfei462/packsmith
packsmith --help
packsmith init demo-pack
```

### 示例 packs

Packsmith 自带三个不同场景的示例 pack：

- [`examples/research-launchpad`](./examples/research-launchpad)：需求研究和产品定位
- [`examples/incident-triage`](./examples/incident-triage)：生产事故排查和状态同步
- [`examples/maintainer-handoff`](./examples/maintainer-handoff)：维护者交接、runbook 补齐和新 owner 上手

### 抄这个结构

第一次创建 pack 时，直接照这个路径抄：

- `examples/research-launchpad/packsmith.json`
- `examples/research-launchpad/skills/github-demand/SKILL.md`
- `examples/research-launchpad/prompts/launch.md`
- `examples/incident-triage/packsmith.json`
- `examples/incident-triage/skills/service-triage/SKILL.md`
- `examples/incident-triage/prompts/status-brief.md`
- `examples/maintainer-handoff/packsmith.json`
- `examples/maintainer-handoff/skills/system-handoff/SKILL.md`
- `examples/maintainer-handoff/prompts/onboarding-brief.md`

### 为什么不要手动复制文件夹

手动复制 skill 文件夹适合一次性实验，但不适合可复现安装和可信仓库状态。

- 手动复制不会留下安装记录
- 手动复制不会检测 drift
- 手动复制没有 strict validation，prompt 冲突和坏的 `SKILL.md` 会更晚暴露

### 安装方式

无 scope 的 npm 名称 `packsmith` 已被其他项目占用。本项目的公开包名是 `@chenfei462/packsmith`。

Claude Code：

```bash
packsmith install examples/research-launchpad --target claude-code --scope user
packsmith list --target claude-code --scope user
packsmith doctor --target claude-code --scope user
```

Codex：

```bash
packsmith install examples/research-launchpad --target codex --dest ./codex-packsmith-check
```

### 发布体积

当前 `npm pack --dry-run` 的发布体积被刻意控制得很小，并由 `npm run release:check` 校验。

- 实际发布文件：`LICENSE`、`README.md`、`package.json`、`src/cli.mjs`、`src/lib/fs-utils.mjs`、`src/lib/pack.mjs`
- 不进入发布包：docs、examples、tests 和发布协作文件

### 当前边界

- 维护的 runtime 只有 `claude-code` 和 `codex`
- Codex 仍使用显式 `--dest`
- 0.1.x 不包含 remote pack registry、remote pack fetch、GUI 或 marketplace
