# Packsmith v0.2 Wave 2 — M5 实现报告（trigger suite schema 与 trigger init）

日期：2026-10-05 · 分支：`feat/v0.2-reliability-gate` · 范围：计划 §13（Milestone 5），不含 M6–M8
实现：ZCode（GLM-5.3-Flash）· 独立验收：Codex（多轮对抗检查，结论由 Codex 维护）

## 1. 交付内容

- `packsmith trigger init <skill-dir>`（计划 §13）：在 `<skill-dir>/evals/triggers.json` 创建确定性的起始套件——4 个可编辑的 TODO 占位用例（trigger/no-trigger × 英文/中文），无模型、无网络、无凭据。
- `src/trigger/schema.mjs`：严格的套件契约（schemaVersion 必须为 1；skill 非空；cases 非空数组；每条恰好 id/prompt/expect；id 为 kebab-case 且唯一；expect ∈ trigger|no-trigger；可选 expectedSkill 一致性）+ 纯校验器 + 起始套件生成器。M8 runner 将以此校验。
- `src/trigger/init.mjs`：init 编排，含完整的 fs 完整性守卫（见 §3）。
- `src/cli.mjs`：trigger 接线 + 契约化 JSON 输出（与 doctor 同构）。
- `scripts/smoke-trigger-init.mjs` + package.json 登记（`smoke:trigger:init`，测试列表 +2 文件）。

## 2. 契约

退出码（沿用计划 §8 / doctor 先例）：0 = created；1 = 校验/工作区状态问题（已存在套件拒绝覆盖、目标无 SKILL.md、evals 越界）；2 = usage（缺参、未知 flag、未知子命令、多余 positional、未知 --target）与基础设施故障（EACCES/EIO/close 失败等）。

JSON（`--format json` / `--json`，意图从 rawArgs 探测、尊重 `--`）：
- 成功/拒绝：`{schemaVersion:1, status:"created"|"exists"|"invalid-target", skill, path, cases?, message?, warning?}`（exit 0/1）；
- usage/infra 异常：`{schemaVersion:1, ok:false, error:{code:"usage_error"|"infrastructure_error", message, exitCode:2}}`（stdout 单一可解析对象、stderr 空、exit 2）；
- 参数解析前置失败（在命令分支之前）同样按 JSON 意图输出 usage_error envelope。

## 3. fs 完整性设计（对抗验收驱动）

1. **evals 双重校验**：mkdir 前后各做一次 lstat（拒绝 symlink/junction/非目录）+ realpath 归属（必须解析为 skill 根自己的 evals）；**写目标使用验证后的真实目录**，不信任"刚才不存在"。
2. **独占临时文件 + 原子发布**：内容写入 `triggers.json.tmp-<randomUUID>`（`open "wx"` 独占创建），经 handle 身份核验（dev/ino）后以 `link(tmp, final)` 原子发布——非覆盖式，EEXIST 即作者文件获胜；发布前后各做一次身份断言。final 路径从不被 rename 覆盖、从不被按所有权假设删除。
3. **身份不可验证时不清权**：handle.stat 失败 → 关闭句柄、明报残留位置；写失败 → 身份校验后才清理自己的 temp；**close 失败（真实 close 后 EIO）→ 不发布**，清理自有 temp 并 exit 2。次级 close 失败保留在诊断中，绝不静默。
4. **失败诊断不吞**：清理 rm 失败按 infrastructure 上抛并披露 temp 残留路径；created/exists 结果可携带 warning（JSON 字段 + 文本行）。
5. **无误覆盖**：任何时序下作者文件（含发布窗口内真实创建、temp 被换位、dangling symlink）都保留原样。

## 4. 测试与验证结果

- 本轮实现侧（`node --test` 全 19 文件）：**338 项，335 pass / 0 fail / 3 skip**（skip 为本机沙箱无法创建 junction/file-symlink 的权限门控用例；skip 不计入通过）。
- 新增回归：schema 13 例 + CLI/契约/故障注入 22 例（触发器目录空格与中文名、UTF-8 起始套件、拒绝覆盖且字节不变、未知子命令/多余 positional/重复 --format/--quiet、JSON envelope 全失败路径、EACCES 注入、evals junction 越界（mkdir 竞争窗口注入）、真实创建竞争（RACE_CREATE）、temp 换位身份校验（TEMP_SWAP）、部分写 EIO + 重试、close EIO 不得发布、清理失败不吞、dangling symlink 跳过门控）。
- 故障注入 loader（`tests/fixtures/doctor-fault-loader.mjs`）新增：HANDLE_STAT_EIO / CLOSE_EIO（真实 close 后再抛）/ TEMP_SWAP / RM / MKDIR_JUNCTION_SWAP / RACE_CREATE；所有测试预加载一律 `pathToFileURL`。
- **Codex 独立验收（真实 Windows 环境）**：`npm test` **338 项 / 337 pass / 0 fail / 1 skip**（文件 symlink 权限跳过）；4 项 smoke（smoke-v01、doctor:example、smoke:doctor:packaged、smoke:trigger:init）全部 exit 0；7 个独立 helper 全通过（temp 所有权 4 场景全部实际触发、close EIO 不得发布、竞争作者文件不覆盖、部分写 EIO+重试、mkdir 后 junction 拒绝、JSON 9 检查），另实测 dangling directory junction 保留而不创建外部目标。日志：`C:\Users\hacjr\AppData\Local\Temp\packsmith-m5-final-offline-tests-v2.log`。
- v0.1 兼容：init/validate/inspect/build/install 行为未动（smoke-v01 5/5）；`score` 命令继续承载旧 doctor 质量分视图；package 版本保持 1.1.0；依赖仍只有 yaml。

## 5. 提交清单（M5）

- `4e46eaf` feat: add trigger suite schema and trigger init
- `5b180fb` fix: harden trigger init against evals and publish race windows
- `b600803` fix: close out M5 identity and cleanup regressions from adversarial review（含 close 失败不得发布、身份前后断言、随机 temp、警告透传）
- `docs: add m5 implementation report`（本报告，单独提交）

## 6. 边界与遗留

- M5 只含 schema + init；trigger 运行器、runtime 适配器、隔离执行、评分属 M6–M8。
- README 未修改（用户既有未提交改动与本轮边界不变）；Codex 的验收/协议记录文件（docs/plans/ 下 3 个）未提交、未改动。
- 本机沙箱无法创建 junction/file-symlink：相关 3 例本地 skip，Codex 环境已实跑通过；skip 不计入 pass。
- 已知限制：init 生成的起始用例是待编辑占位（确定性生成，不虚构语义）；`trigger run` 尚不存在（`trigger` 仅 init 子命令）。
