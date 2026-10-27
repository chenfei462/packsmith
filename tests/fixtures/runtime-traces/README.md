# Runtime trace fixtures — provenance

日期：2026-10-04 · 这些 fixture 是**人工构造**的，不是真实模型捕获。

来源与构造规则（M6 §16：先保存有来源的 fixtures，再写 parser）：

- Codex JSONL 事件形状逐字段取自已核验的官方协议记录
  （docs/plans/packsmith-v0.2-wave2-runtime-verification.md）：
  codex-cli 0.148.0 的 exec JSONL 含 thread/turn/item/error 事件，
  CommandExecutionItem 字段为 command / aggregated_output / exit_code / status
  （[exec_events.rs @ rust-v0.148.0](https://github.com/openai/codex/blob/rust-v0.148.0/codex-rs/exec/src/exec_events.rs)）。
  此版本**没有**独立的 skill-invoked item 类型——任何此类 fixture 都会是编造。
- Claude stream-json 事件形状取自官方 headless / CLI reference / skills 文档与
  tool-use 关联字段（tool_use.id ↔ tool_result.tool_use_id、is_error）。
  实际 CLI envelope 的字段仍需隔离捕获验证；parser 按这些 fixture 保守实现，
  捕获验证后修正。
- 所有 prompt/输出内容为构造样例，不代表任何真实模型行为；路径样例使用
  `C:\ws\.agents\skills\...`（Codex 发现目录约定）。

| 文件 | 场景 | 预期状态 |
| --- | --- | --- |
| codex-triggered.jsonl | completed、exit 0、type 精确读取目标 SKILL.md | triggered |
| codex-not-triggered.jsonl | echo 提及路径（非读取）+ 干净完成 | not_triggered |
| codex-decoy-other-skill.jsonl | completed 读取**另一个** skill 的 SKILL.md | not_triggered |
| codex-ambiguous-failed-read.jsonl | 读取目标路径但 exit_code 1 | ambiguous |
| codex-ambiguous-incomplete.jsonl | 目标读取停在 in_progress、turn 未完成 | ambiguous |
| codex-ambiguous-truncated.jsonl | 最后一行 JSON 被截断 | ambiguous |
| codex-turn-failed.jsonl | turn.failed（官方协议：基础设施/服务错误） | infra_error |
| codex-error.jsonl | 流内 error 事件（基础设施/服务错误）、无 turn.completed | infra_error |
| claude-triggered.jsonl | Skill tool_use 精确名 + tool_result 成功 + result 成功 | triggered |
| claude-not-triggered.jsonl | 无 Skill 调用、result 成功 | not_triggered |
| claude-decoy-other-skill.jsonl | Skill 调用的是**另一个** skill | not_triggered |
| claude-ambiguous-missing-result.jsonl | tool_use 无对应 tool_result | ambiguous |
| claude-ambiguous-error-result.jsonl | tool_result is_error:true | ambiguous |
| claude-error.jsonl | 最终 result 为 error（subtype error_during_execution / is_error） | infra_error |
| claude-assistant-error.jsonl | assistant 消息带 error（认证/限流/服务错误枚举） | infra_error |
| claude-ambiguous-aborted.jsonl | assistant 带 aborted:true（中断截断证据） | ambiguous |
| claude-ambiguous-truncated.jsonl | 截断流 | ambiguous |

真实捕获 trace（隔离审查后的有限 live 运行）应存为 `*-captured.jsonl` 并在本表补充来源行；
parser 对 captured fixture 的判定必须与人工 fixture 一致后才可作为验收依据。
