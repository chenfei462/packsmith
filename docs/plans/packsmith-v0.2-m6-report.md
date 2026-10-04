# Packsmith v0.2 Wave 2 — M6 实现报告（运行时适配器层）

日期：2026-10-04 · 分支：`feat/v0.2-reliability-gate` · 范围：计划 §14–16（Milestone 6），不含 M7/M8
实现：ZCode（GLM-5.3-Flash）· 独立验收：Codex（协议核查记录 `docs/plans/packsmith-v0.2-wave2-runtime-verification.md`）

## 1. 交付内容

- `src/runtimes/base.mjs` — 适配器契约与共享运行引擎：六状态执行态模型（triggered / not_triggered / ambiguous / infra_error / timeout / unsupported，plan §13/§14）、规范化结果构造器、**显式隔离上下文门禁**（`requireTriggerContext`：workspace/trace/home/runtimeState/temp/timeout 缺一即契约错误，路径必须非空绝对路径，绝不回落真实项目）、子进程环境构造（`buildChildEnv`：大小写不敏感地剥离父进程全部 `CODEX_`/`CLAUDE_`/`ANTHROPIC_`/`OPENAI_` 会话身份与凭据以及 `NODE_OPTIONS`/`NODE_PATH` 执行钩子；显式设置 HOME/USERPROFILE/CODEX_HOME/CLAUDE_CONFIG_DIR/TMP/TEMP；context.env 不可覆盖保护键、不可夹带凭据）、进程树终止（taskkill 先取 System32 绝对路径、PATH 回退、5s 上限、失败重试一次并如实上报）、raw 证据保留（**逐字节 Buffer 落盘**，CRLF/空行/末尾状态/非法 UTF-8 不被重编码；parser 只解码自己的副本）、超时软/硬双期限（kill 失败或孙进程持管道时 KILL_GRACE 后强制完成，绝不无限等待）。
- `src/runtimes/codex.mjs` — codex-cli 0.148.0 live 适配器：`exec --json --sandbox read-only --skip-git-repo-check -`，prompt 走 stdin；无 shell、argv 数组、Windows .cmd shim 解析到真实入口（node 脚本经 `process.execPath` 启动 / .exe 直接启动）。**PowerShell wrapper 仅支持可信前缀**：powershell/pwsh + 显式无影响选项（-NoProfile/-NonInteractive/-NoLogo）+ 恰好一个 -Command/-c + 单一脚本参数，且内层为单句受支持 Get-Content（-LiteralPath/-Path/-Raw）时才判 read；任何 compound（分号/换行/管道/条件）含目标读取一律保守 ambiguous——不假设分隔符后的语句必然执行（`exit 0; Get-Content` 类早退负例实测不得 triggered）；-File/-EncodedCommand/未知选项/多余参数一律 ambiguous（-File 的 -Command 是脚本参数不是命令）。**激活证据 = completed + exit 0 + 已知内容读取命令（type/cat/Get-Content 等）且文件操作数经规范化路径精确等于本次安装的 SKILL.md**（Windows 才大小写不敏感）；搜索工具（grep -q 无正文）、复合/未知语法、失败/declined/in_progress/null-exit、started-未完成、截断流 → ambiguous；流内 error / turn.failed（官方协议）→ infra_error；echo/Write-Output 提及、其他 skill、SKILL.md.bak 等扩展路径 → decoy；干净完成无尝试 → not_triggered。`--ignore-user-config`/`--ignore-rules` 不作为隔离证据使用。
- `src/runtimes/claude-code.mjs` — claude 2.1.215 live 适配器：`-p --output-format stream-json --verbose --permission-mode dontAsk`，prompt 走 stdin。SDK 消息顶层 envelope（session_id / parent_tool_use_id / error / aborted 为顶层字段，官方 Agent SDK typescript 参考 2026-10-04 只读副本核对；本机 sdk-tools.d.ts 无 SkillInput，故只匹配 `input.skill` 精确等于目标名，未知输入形状保守 ambiguous，不从 args 等其他值猜测）。关联按 (session_id, parent_tool_use_id) 作用域 + 顺序：tool_result 必须在调用之后、同一作用域内；重放（result 先于 call）、重复 id 一律 ambiguous。最终 result error 臂 / assistant error 枚举 → infra_error；aborted / 缺关联结果 / is_error 结果 → ambiguous；成功 result + 无目标调用 → not_triggered。
- `src/runtimes/static-runtime.mjs` + `cursor.mjs` / `gemini-cli.mjs` / `opencode.mjs` — 静态兼容适配器（plan §15）：detect/version/capabilities（staticCompatibility:true, liveTriggerRunner:false），live run 一律 `unsupported`（独立于任何二元指标），trace 解析同样返回 unsupported。
- fixtures 先行：`tests/fixtures/runtime-traces/` 共 18 个文件（17 个事件流 fixture + README 溯源表） + README 溯源表——人工构造（依据已核验官方协议形状：codex exec_events.rs@0.148.0 的 thread/turn/item/error 与 CommandExecutionItem 字段；Claude 官方 headless/SDK 消息顶层字段），明确标注非真实捕获；真实 captured trace 留待隔离审查后的显式运行，届时补充 `*-captured` 并要求 parser 判定一致。
- `tests/fixtures/mock-runtime-cli.mjs` + `scripts/smoke-runtimes.mjs` + package.json 登记（test 列表 +5 文件、`smoke:runtimes`）。

## 2. 契约要点

- `runTriggerCase({skill, prompt, context})` 的 context 必须显式给出全部隔离位置；M7 负责真实隔离目录的内容，M6 只做形状与绝对路径门禁——缺上下文是调用方 bug（RuntimeContractError），绝不静默全局执行。
- 执行态与二元指标分离：infra_error/timeout/unsupported/ambiguous 永不折算为 not_triggered（plan §4.4 硬性要求）；runner 的 spawn/非零退出/超时分类优先于 parser 结论。
- 子进程环境默认拒绝继承父会话/凭据命名空间；认证只经 M7 的显式最小 bridge 进入，值不进入 result/trace artifact/日志。

## 3. 测试与验证（真实命令与结果）

- `node --test <package.json test 全列表，24 文件>`：**400 项，396 pass / 0 fail / 4 skip（约 50s）**。4 个 skip 为权限门控用例（3 个本机沙箱无法创建 junction/file-symlink + 1 个真实 PowerShell 对照在拒绝 spawn powershell 的沙箱中门控跳过；Codex 真机必须实跑通过），skip 不计入通过。
- 新增回归 62 项（最终）：base 契约/环境隔离 11、codex parser 22（含 round-3 PowerShell wrapper/compound 语义）、claude parser 10、静态适配器 9、spawn/stdin/shim/超时/raw 字节 10。
- Codex 独立负例矩阵（42 个可误判负例，含 echo/Write-Output 提及、Get-Item/Test-Path 元数据、相似路径与 .bak 后缀、grep 模式 vs 操作数、grep -q、失败/declined/in_progress/null-exit、复合与注释陷阱、跨会话/跨父/重放/重复 id、args 内目标名等）：**42/42 通过**（round-3 复测确认）；Codex 终态场景 5/5（成功 read 后流 error / 缺 terminal / 截断 / turn.failed 均不再误判 triggered；turn.failed → infra_error）；PowerShell 真实本地反例（早退 compound、-File wrapper decoy）经独立 harness 验证修复，且新增 Windows 门控真实 PS 对照测试（真实 spawn 取证：正向读取 sentinel 命中 → triggered；-File wrapper 目标正文未读 → 不 triggered；全部物化文件仅位于本次 mkdtemp 独占 root，绝不写 C:ws）。
- `scripts/smoke-runtimes.mjs` PASS（codex live×2、claude live、timeout+partial、静态 unsupported、显式上下文契约拒绝）。
- 既有门禁全部保持：smoke-v01 5/5、smoke-trigger-init PASS、smoke-doctor PASS、smoke-doctor-packaged PASS（knowledge-base 13 文件随包）；v0.1 五命令行为未动；M5 338 项测试全部保留并通过。
- 本机 detect/version 离线探针（Codex 实测）：codex 0.148.0、claude 2.1.215 均可离线解析入口并应答 --version，不触发模型/账户。

## 4. 提交清单（M6）

- `feat: add runtime adapter layer with trace parsers and safe spawn`（src/runtimes/ 7 模块、tests/runtimes/ 5 文件、fixtures、mock CLI、smoke、package.json）
- `docs: add m6 implementation report`（本报告）+ M5 报告日期更正（2026-10-05 → 2026-10-04，并入 docs 提交）

## 5. 边界与遗留

- M7 完成每 case×runtime×run 的真实隔离（独立仓库边界/home/state/cache/temp、父目录技能不泄漏回归、最小认证桥）；M6 的 context 只是显式形状门禁，目录仅由 runner 物化、内容留空。
- Skill 工具输入字段名、tool_use/result 信封细节、Windows 真实 wrapper 语法（powershell 包装的最终语义）均标注 pre-capture，待 Codex 审查后的隔离 live capture 验证并可能收紧 parser。
- 指标计算（precision/recall/divergence、零有效样本不显示 100%）属 M8。
- README/用户既有改动未触碰；Codex 三份验收/协议记录未提交未改动；版本保持 1.1.0；依赖仍只有 yaml；无 push/publish。
