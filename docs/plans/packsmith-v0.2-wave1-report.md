# Packsmith v0.2 Wave 1 实现报告

日期：2026-10-04 · 分支：`feat/v0.2-reliability-gate` · 范围：计划 §34 仅 Wave 1（M0–M4），不含 Wave 2
实现：ZCode（GLM-5.3-Flash）· 独立验收：Codex（两轮，验收结论见 Codex 自行维护的报告）

## 0. Wave 1 DoD 核对表（计划 §35）

| 项 | 状态 | 依据 |
| --- | --- | --- |
| Existing tests pass | ✓ | 最终 299/299（原 251 + 本轮 48） |
| v0.1 commands remain compatible | ✓ | `scripts/smoke-v01.mjs` 5/5（init/validate/inspect/build/install） |
| Real YAML frontmatter parsing | ✓ | `yaml` 2.9.1（计划授权的唯一依赖），无手写解析器 |
| Skill parser has unit tests | ✓ | `tests/core/skill-parser.test.mjs` |
| Diagnostic engine exists | ✓ | `src/core/diagnostics.mjs`（§8 结构 + 0/1/2 退出码契约） |
| Knowledge Base exists | ✓ | `knowledge-base/`（manifest/sources/runtimes/rules，纯 JSON） |
| Evidence provenance exists | ✓ | 每条规则/运行时记录 evidence{source,sourceType,normative,verifiedOn}，source 可溯源到 sources.json |
| Initial deterministic rules exist | ✓ | 20 条（见 §4），全部确定性启发式，无 LLM |
| packsmith doctor . works | ✓ | `doctor examples/research-launchpad` 实测 PASS |
| packsmith doctor <skill> works | ✓ | 单 skill 目录与 skills/ 容器两种形态 |
| --target works | ✓ | claude-code/codex/cursor/gemini-cli/opencode 五个静态 target |
| --format json works | ✓ | §12 形状 + usage/infra 错误 envelope（见 D4） |
| npm test requires no credentials | ✓ | 无凭据路径 |
| npm test performs no model calls | ✓ | 全离线，无网络/模型/登录 |
| CLI smoke tests pass | ✓ | smoke-v01 + smoke-doctor + smoke-doctor-packaged 全绿 |
| Changes are committed separately by milestone | ✓ | 6 个里程碑提交（快照→M0→M1→M2→M3→M4）+ 本轮验收修复提交 |

## 1. Files added（本验收修复轮新增）

- `src/` 无新增文件（增量修复既有模块）
- `tests/fixtures/doctor-fault-loader.mjs` — doctor I/O 故障注入 loader（stat/readdir/readFile → EACCES；`syncBuiltinESMExports` 使命名导入可注入）
- `tests/checks/spec-links.test.mjs` — PS-SPEC-010 链接语义 + bodyLineOffset 行号 + doctor 级端到端回归（18 例）
- `tests/core/workspace-missing.test.mjs` — skills/ 容器缺失 SKILL.md 候选发现（6 例）
- `tests/checks/doctor-json-envelope.test.mjs` — --format json 错误 envelope + exit 2（10 例，含参数解析前置失败 3 例与 -- 终止符 1 例）
- `tests/checks/doctor-faults.test.mjs` — EACCES 注入 → infrastructure_error/2，含正常对照与 target stat 注入（6 例）
- `tests/knowledge/runtime-facts.test.mjs` — claude-code 运行时事实/provenance 行为断言（4 例）
- `scripts/smoke-doctor-packaged.mjs` — 真实 npm pack → 解包 → 包内 doctor 验收（knowledge-base 随包 + 打包产物可用性）
- `docs/plans/packsmith-v0.2-wave1-report.md` — 本报告

（M0–M4 里程碑新增：`src/core/{skill-parser,paths,workspace,diagnostics}.mjs`、`src/knowledge/loader.mjs`、`src/checks/{spec,activation,context,compatibility,security,support}.mjs`、`src/reporters/{terminal,json}.mjs`、`src/doctor.mjs`、`knowledge-base/**`、`scripts/{smoke-v01,smoke-doctor}.mjs`、`tests/core|knowledge|checks/*.test.mjs`）

## 2. Files modified（本验收修复轮）

- `src/core/diagnostics.mjs` — 新增 `InfrastructureError`（基础设施故障 ≠ Skill finding，plan §4.4）
- `src/core/paths.mjs` — `skillFileExists`：仅 ENOENT 视为缺失，EACCES/EIO 抛 InfrastructureError；fs 改默认导入（可注入，沿用 pack.mjs 先例）
- `src/core/workspace.mjs` — 发现语义重设计：`skills/` 容器内**每个子目录都是候选**（缺失 SKILL.md → PS-SPEC-001）；宽松布局仍要求 SKILL.md 存在；readdir 非 ENOENT 故障抛出而非吞成 []
- `src/core/skill-parser.mjs` — `splitFrontmatter` 返回 `bodyStartLine`（由闭合 fence 结构推导，不搜索正文文本）
- `src/checks/support.mjs` — `bodyLineOffset` 改用 bodyStartLine（frontmatter 与正文重复文本时行号不再错位）
- `src/checks/spec.mjs` — 统一 Markdown destination 处理链路 `normalizeLinkDestination`：解 angle 包裹 → 反转义标点（bare/angle 皆生效，CommonMark 0.31.2）→ 去 `?query/#fragment` → 单次 percent 解码；存在性检查只看解码后路径（取消 raw 字面回退）；`fileExists` 仅 ENOENT 为缺失，其余抛 InfrastructureError
- `src/checks/security.mjs` — `readTextFile` 仅 ENOENT 跳过，EACCES/EIO 抛出（风险引用读取拒绝不再静默 PASS）
- `src/checks/compatibility.mjs` — PS-COMP-002 目标感知：target 支持的键对该 target 不报 COMP-001/002，不支持的 target 保留可理解警告
- `src/doctor.mjs` — 检查异常转发为 DoctorInfrastructureError；`resolveTargetDirectory`：ENOENT/ENOTDIR → usage_error，EACCES/EIO → infrastructure_error
- `src/cli.mjs` — doctor 分支：--format json 下**所有** usage/infra 失败路径输出稳定 JSON envelope（`{schemaVersion, ok:false, error:{code, message, exitCode}}`）并 exit 2；Skill 校验失败仍是标准 §12 报告 + exit 1。参数解析前置失败（未知 flag、缺选项值）发生在 doctor 分支之前：从 rawArgs 判定显式 JSON 意图（--json / --format json / --format=json，尊重 -- 终止符）后同样输出 usage_error envelope；文本模式与其他命令约定不变
- `package.json` — `files` 增加 `knowledge-base`；`test` 脚本登记 5 个新测试文件；新增 `smoke:doctor:packaged`
- `knowledge-base/runtimes/claude-code.json` — name 可省略（回退目录名）、description 为推荐字段（官方口径），evidence 更新 verifiedOn 2026-10-04
- `knowledge-base/rules/compatibility.json` — PS-COMP-002 knownRuntimeKeys 增加 `claude-code: [disable-model-invocation]`（与 Cursor 共同归属），evidence 补 claude-code-docs
- `knowledge-base/sources/sources.json` — claude-code-docs 记录按官方文档更正并注明验证日期
- `knowledge-base/manifest.json` — updatedAt → 2026-10-04
- `tests/knowledge/loader.test.mjs` — verifiedOn 断言放宽为「已知验证日期集合」（2026-10-03/04），provenance 纪律不变
- `tests/core/skill-parser.test.mjs` — splitFrontmatter 形状断言纳入 bodyStartLine
- `README.md` — **仅工作区修改，未提交**（见 §8 提交边界）

## 3. Architecture decisions（验收轮要点）

1. **基础设施故障走异常通道**：`InfrastructureError`（core）→ `DoctorInfrastructureError`（doctor 编排）→ CLI exit 2 + JSON envelope；Skill 事实（含校验失败）走诊断对象 → exit 0/1。resolveExitCode 的 0/1 与异常 2 保持 plan §8 的「infra 永不降级为 1」。
2. **候选目录 vs Skill 的区分**：`skills/` 是约定容器，其内所有子目录都是候选（缺失 SKILL.md 是 PS-SPEC-001 事实）；容器外的普通项目目录不被当作 skill（避免误报无关目录）。
3. **参数解析前置路径也守契约**：JSON 意图从 rawArgs 显式探测（parseOptions 失败时不存在 options 对象），仅作用于 doctor，尊重 -- 终止符；其他命令保持既有 UsageError 约定。
4. **链接语义单一管线**：CommonMark 0.31.2 口径 —— destination 是 URI，解码恰好一次；`%23`/`%3F` 解码为文件名字面字符；字面 `%xx` 文件须用双重编码（`%2520`）引用；仅畸形序列（`100%.md`）保持原样。
5. **fs 可注入性**：v0.2 core/checks 模块对 `node:fs/promises` 采用默认导入（仓库既有 pack.mjs 先例），配合 fault loader 的 `syncBuiltinESMExports` 让命名导入（doctor.mjs 的 stat）也可注入，回归测试因此自包含、无需外部脚本。
6. **运行时宽容与规范严格分离**：agent-skills spec 的 MUST 规则（PS-SPEC-004/008）保持 error；claude-code 运行时记录按官方文档表述（name 可省略、description 推荐），不互相污染。

## 4. Rules implemented（20 条，全部确定性）

- **spec**：PS-SPEC-001 SKILL.md 缺失 · 002 frontmatter 缺失 · 003 YAML 解析失败 · 004 name 缺失 · 005 name 格式非法 · 006 name 过长（>64）· 007 name 与目录不一致 · 008 description 缺失 · 009 description 过长（>1024）· 010 引用文件缺失
- **activation**：PS-ACT-001 描述语义过薄 · 002 缺激活边界 · 003 兄弟描述过度重叠（Jaccard>0.7）
- **context**：PS-CTX-001 SKILL.md 行数超限 · 002 chars/4 预估 token 超限（无合成评分）
- **compatibility**：PS-COMP-001 非标准 frontmatter 键（info）· 002 运行时专有键损害可移植性（warning，目标感知）
- **security**：PS-SEC-001 敏感文件访问 · 002 远程 shell 执行 · 003 危险删除命令（均 warning，供人工复核）

## 5. Tests added（本验收轮，48 例）

链接与行号（spec-links 19 例：percent/angle/转义 bare+angle/anchor/query/标题/双重编码/%23 文件名/畸形 %/缺失正例 + bodyLineOffset 断言 + doctor 级端到端 2 例）；缺失候选发现（workspace-missing 6 例）；JSON envelope（doctor-json-envelope 6 例）；I/O 故障注入（doctor-faults 6 例，含正常对照组与 target stat）；知识库事实（runtime-facts 4 例）；既有文件断言更新 3 处。全部离线、自包含、临时目录夹具。

## 6. npm test result

- `node --test <package.json test 列表，17 个文件>`：**299 tests, 299 pass, 0 fail, 0 skipped（约 41s）**
- 本机 `npm test`（npm 11.12.1 shell shim）无法解析 node 命令（Git Bash 环境的 npm 包装问题，与仓库无关）；Codex 环境已独立验证 `npm test` 通过。脚本内容与上面直接运行的命令一致。

## 7. CLI smoke-test results

| 命令 | 结果 |
| --- | --- |
| `node scripts/smoke-v01.mjs` | 5/5（init→validate→inspect→build→install，隔离临时目录） |
| `node scripts/smoke-doctor.mjs` | PASS（example/fixture/json/broken/target 全过，正常调用永不 exit 2） |
| `node scripts/smoke-doctor-packaged.mjs` | PASS（`npm pack --pack-destination <temp>` → tar 解包 → knowledge-base 13 个文件随包 → 包内 CLI doctor example PASS / broken fixture exit 1；不触碰工作区根目录的 tgz） |
| `node src/cli.mjs doctor examples/research-launchpad --format json` | `{"status":"pass","skills":1,"errors":0,"warnings":0}`，exit 0 |

## 8. Backward-compatibility status 与提交边界

- v0.1 五命令行为未变（smoke-v01 为证）；`score` 命令承载原 doctor 质量分视图；registry/RAG/版本号（保持 1.1.0）均未越界。
- **README 提交边界**：用户本轮前对 README 已有未暂存改动（229+/117-，结构性的重写）。两个版本结构已分叉，无法用「HEAD+本轮 hunks」手术式提交；按约定本轮 doctor/score 说明**写入工作区但保留未提交**，用户既有改动原样保留，由用户自行决定合并与提交。工作区 README 现包含：用户既有改动 + 本轮新增「Reliability Gate: packsmith doctor」一节 + Core Commands 中 doctor/score 两行的口径修正。
- `docs/plans/packsmith-v0.2-codex-acceptance.md` 为 Codex 所有，未提交、未改动。
- 其余 300 个既有 staged/unstaged/untracked 改动未触碰。

## 9. Known limitations

1. doctor 为静态分析：不宣称已验证行为触发（trigger/matrix/ci 属 Wave 2/3）；live 运行时验证需真实凭据。
2. `src/knowledge/freshness.mjs`、`src/reporters/github.mjs`、manifest v2 迁移按计划不在 Wave 1。
3. 安全检查是 warning 级模式复核信号，非沙箱执行结论。
4. npm test 的 node --test 显式文件列表需随新增测试手工登记（计划 §26 的 `node --test` 全量发现留待后续）。
5. 链接检查覆盖 skill 目录内的相对文件引用；绝对路径/URL 不做网络探测（离线约束）。

## 10. Recommended Wave 2 changes

1. 按 §13–§18 实现 trigger schema、Claude Code/Codex 适配器（先以官方文档核实 CLI 参数与结构化输出， fixture traces 先行）、隔离执行与评分。
2. 把本报告的 infra/usage envelope 契约推广到 trigger/ci 命令；`resolveExitCode` 的 regressions/infraErrors 通道已在诊断引擎预留。
3. 诊断引擎补充 `regressions` 聚合（行为回归计数 → exit 1）。
4. README 的「Fastest Path」可在 Wave 2 发布时加入 trigger 工作流示例。
5. 测试基建：考虑 `node --test tests/` 全量发现替代显式列表（需评估 fixtures 目录误扫描）。

## 提交清单（本轮验收修复）

- `fix: doctor json contract covers pre-parse usage errors` — 参数解析前置路径的 envelope 修复 + 4 个 CLI 回归

- `fix: close wave 1 acceptance findings (discovery, links, exit codes, packaging)` — src 修复 + 全部回归测试 + package.json + 打包冒烟
- `docs: add wave 1 implementation report` — 本报告
- 知识库更正随 fix 提交（runtime-facts 测试依赖其一致性）
