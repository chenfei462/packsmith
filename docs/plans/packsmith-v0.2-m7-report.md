# Packsmith v0.2 Wave 2 — M7 实现报告（独立隔离层）

日期：2026-10-04 · 分支：`feat/v0.2-reliability-gate` · 范围：计划 §17（Milestone 7），不含 M8 及真实模型调用
实现：ZCode（GLM-5.3-Flash）· 独立验收：Codex · 基线：M6 checkpoint `6c7e2a9`（400 项 / 399 pass / 1 file-symlink skip）

## 1. 交付内容

- `src/trigger/isolation.mjs` — 每 case×runtime×repeat 的独立隔离编排：
  - **运行骨架与保留产物**（计划 §17 布局）：`.packsmith/runs/<uniqueid>/` 下 `workspace/`、`runtime.json`、`stdout.log`、`stderr.log`、`events.jsonl`、`result.json` 六个路径在骨架创建时全部预留；runtime.json 在 prepared/executed/failed 每种状态下都如实落盘（failed 状态携带失败摘要），部分产物始终可诊断。
  - **真实 git 仓库边界**：`initializeWorkspaceRepo` 用本机已安装 git 执行真实 `git init --template=<空模板>`，随后 `rev-parse --show-toplevel` 校验解析恰为本次 workspace；父进程 `GIT_*`（大小写不敏感）全部剥离，global/system 配置指向本 case 的空配置文件，`GIT_CONFIG_NOSYSTEM=1`、`GIT_TERMINAL_PROMPT=0`，杜绝全局 hooks/模板注入。git 不可用 = infra 错误，绝不把普通目录伪称仓库。runtimes 向父目录扫描 skills/AGENTS 直到 git root 的行为因此被边界截断（测试以"父链携带 .git/AGENTS/decoy skills"验证）。
  - **私有状态目录**（独占 OS-temp `packsmith-run-private-*`）：runtime-state（即 CODEX_HOME/CLAUDE_CONFIG_DIR）、home、cache、config、state、appdata、localappdata、temp 各自独立；运行结束（成功或失败）整树清理，清理失败按 infrastructure 如实上抛。
  - **最小认证桥（纯文件通道）**：Codex —— 父 `auth.json` 只读复制为私有 CODEX_HOME 内的 `auth.json`（0600）；Claude —— 从父 `settings.json` 仅读取受控显式字段 `env.ANTHROPIC_AUTH_TOKEN` / `env.ANTHROPIC_BASE_URL`，写出**只含这两个字段**的最小 `settings.json`（0600）；hooks/MCP/plugins/projects/整份配置一律不复制。缺文件 → `present:false` 如实报告；父文件只读（测试以前后 SHA-256 相等证明）；报告与 runtime.json 只含 auth 来源类型 + 存在性，**任何值不进入 result/error/日志/保留产物**（测试与 smoke 对全部保留文件做 sentinel 扫描）。环境变量通道零认证——`buildChildEnv` 的 vendor 键拦截未被放开。
  - **环境隔离**：`buildIsolatedChildEnv` 在 M6 `buildChildEnv`（大小写不敏感剥离 CODEX_/CLAUDE_/ANTHROPIC_/OPENAI_ 会话身份、凭据与 NODE_OPTIONS/NODE_PATH）之上再剥离全部父 GIT_*，钉住 APPDATA/LOCALAPPDATA/XDG_CACHE_HOME/XDG_CONFIG_HOME/XDG_STATE_HOME 至 case 私有目录，PATH 缩减为执行最小集（System32 + 运行中 Node 的目录），仅保留 SystemRoot/COMSPEC 等执行必需系统键。
  - **技能安装**：仅安装受测 skill 到该 runtime 的本地发现目录（codex → `.agents/skills/<name>/`，claude → `.claude/skills/<name>/`；静态 runtime 无安装）。名称 kebab-case 校验；源树安装前逐项 lstat 拒绝 symlink/junction + realpath 必须在源根内；安装后再校验产物（无 reparse point、解析位置在目标内），逃逸即清理并 infra。绝不触碰全局安装。
  - **isolationFlags（纵深防御，非隔离证据）**：codex `--ephemeral --ignore-user-config --ignore-rules`（按本机 0.148.0 help，不作为隔离证明）；claude `--no-session-persistence --setting-sources project --strict-mcp-config --settings <私有最小文件> --tools Read,Glob,Grep,Skill`（按本机 2.1.215 实际支持）；静态 runtime 空。flags 经 context.isolationFlags 传入 M6 适配器（协议参数之后追加），并记录进 runtime.json。
  - **runtime.json 元数据**：schemaVersion/runtime/实际 version 占位（由调用方填观测值）/flags/provenance/全部 context 路径/auth{source,present,endpointPinned}/status/skill/repeat——只记真实观测，不造 capture。
- 适配器衔接：`codex.mjs`/`claude-code.mjs` 的 `buildArgs` 追加 `context.isolationFlags`（缺省行为不变，M5/M6 测试零回归）。
- `scripts/smoke-isolation.mjs` + package.json 登记（test 列表 + isolation.test，`smoke:isolation`）。

## 2. 测试与验证（真实命令与结果）

- `node --test <package.json test 全列表，25 文件>`：**421 项，416 pass / 0 fail / 5 skip（约 61s）**。5 个 skip 全部为权限门控（3 个 junction/file-symlink 创建 + 1 个 M6 真实 PS 对照 + 1 个本测试的 symlink 源逃逸用例——本沙箱拒绝创建符号链接；Codex 真机须实跑），skip 不计入通过。
- 新增隔离回归 21 项，覆盖任务书要求的全部场景：
  - 布局与唯一性（两次运行不同 id/dir；六产物路径预留）；
  - 真实 git 边界（父链 `.git`+AGENTS.md+decoy skills 下 init 后 rev-parse 仍解析为本次 workspace；父 GIT_DIR/git_work_tree 混合大小写注入被剥离）；
  - case 私有目录齐全且都在独占 private root 之下；
  - 环境隔离（混合大小写 codex_session_id/Claude_Config_Dir/ANTHROPIC_AUTH_TOKEN/NODE_OPTIONS/node_path/GIT_DIR 全部不泄漏；APPDATA/LOCALAPPDATA/XDG_* 钉住 case 目录；PATH 不含父目录；HOME/CODEX_HOME/CLAUDE_CONFIG_DIR 指向私有态）；
  - 认证桥（codex 私有副本就位、claude 最小 settings 仅两字段、报告与 runtime.json 无值、缺文件 present:false、父文件前后 SHA-256 不变）；
  - 技能安装（双 runtime 各自目录、sibling 不被安装、symlink 源拒绝且零安装〔门控 skip〕）；
  - 清理与故障（private root 移除而保留产物不动；不可写 runs root → infrastructure；失败运行记录 `failed:*` 且 private 态仍被清理）；
  - 重复/跨运行时独立性（两 repeat 不同 runId、各自 workspace 安装可见、凭据零泄漏；codex/claude 各自 `.agents`/`.claude` 目录且 workspace 互不相同；静态 runtime 经隔离层仍 unsupported）。
- `scripts/smoke-isolation.mjs` PASS：两次 codex + 一次 claude + 一次静态 runtime 经 `withIsolatedTriggerRun` 端到端（mock CLI 执行）——git 边界存在、三次运行目录互异、父 auth fixture 字节不变、全部保留产物 sentinel 扫描零凭据、private 态清理无残留、runtime.json 元数据诚实、claude flags 到达 context、静态 unsupported。
- 既有门禁零回归：smoke-v01 5/5、smoke-trigger-init、smoke-doctor、smoke-doctor-packaged、smoke-runtimes 全 PASS。
- 本轮零真实模型调用、零账户依赖；mock CLI/fixture 均在独占 TEMP root（C:\ws 仅作为纯解析器测试的字符串常量，无任何文件物化）。

## 3. 提交清单（M7）

- `feat: add trigger isolation layer with real git boundary and minimal auth bridge`（src/trigger/isolation.mjs、tests/trigger/isolation.test.mjs、scripts/smoke-isolation.mjs、package.json、codex/claude 适配器 isolationFlags 衔接）
- `docs: add m7 implementation report; correct m6 report counts`（本报告 + M6 报告勘误：回归总数 47→62、fixtures 16→17 文件、smoke 措辞 mock-execution）

## 4. 边界与遗留

- M8（runner + 指标）未动：`trigger run` CLI、case 编排、precision/recall/divergence、缺数据不显示 100% 等待 M7 通过后实施。
- 真实模型调用未发生：live capture 由 Codex 在 M7 通过后按协议安排有限正负样本；isolation 层即为该 capture 准备的执行环境。
- 认证桥默认路径指向真实 `~/.codex/auth.json` / `~/.claude/settings.json`（只读），测试与 smoke 全部显式传入 fixture 路径；后续 live capture 将使用同一只读桥，不改用户认证。
- 静态 runtime（cursor/gemini-cli/opencode）保持 unsupported，不参与隔离执行。
- README/用户既有改动/Codex 三份记录未触碰；版本保持 1.1.0；依赖仅 yaml；无 push/publish。
