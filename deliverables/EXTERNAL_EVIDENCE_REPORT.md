# External evidence report

Verified 2026-10-26 where the host permitted a current check. URLs are retained as source metadata; long external documents are not copied into the repository.

| Source family | Why it matters | Distilled/adopted | Intentionally not adopted | Revision status |
|---|---|---|---|---|
| Agent Skills specification | Normative SKILL.md shape | Static conformance rules and fixtures | Full documentation mirror | URL source, revision not pinned |
| OpenAI/Codex skills docs | Codex discovery and metadata boundaries | Codex runtime record and adapter scope | Claims about unsupported live behavior | Current docs checked; CLI 0.148.0 observed |
| Anthropic Claude Code docs | Claude discovery, headless output, Skill tool evidence | Claude adapter contract and trace correlation | Implicit success from final prose | Current docs checked; CLI 2.1.289 observed |
| Cursor skills docs | Static compatibility and discovery paths | Cursor static runtime record | Cursor live runner | Current docs checked; CLI unavailable |
| Gemini CLI docs | Static discovery and frontmatter facts | Gemini static runtime record | Gemini live runner | CLI 0.42.0 observed |
| OpenCode docs | Static discovery and name/description facts | OpenCode static runtime record | OpenCode live runner | CLI unavailable |
| skills-ref | Conformance oracle | Covered behavior used as design reference | Production dependency | Revision not pinned in executable KB |
| agent-skill-eval | Repeated isolated evaluation ideas | Fresh workspaces, repeated cases, raw traces | Generic benchmark framework | Revision not pinned |
| skill-up | Evaluation/reporting ideas | Runtime abstraction and CI separation | Optimizer/evolution scope | Revision not pinned |
| Anthropic skill-creator | Trigger/negative-case methodology | Positive and negative trigger-suite shape | Automatic optimization | Revision not pinned |
| Microsoft SkillOpt | Validation-gated changes | Held-out/regression boundary as future hook | Skill rewriting | Revision not pinned |
| agnix and Google skills_lint | Knowledge-driven static checks | Stable rule IDs and deterministic diagnostics | Broad generic lint catalog | Revision not pinned |
| NVIDIA Skills | Provenance/security direction | Security and provenance as future hooks | Signing/trust marketplace in v0.2 | Revision not pinned |
| Promptfoo | Provider/assertion/reporting ideas | Baseline comparison concepts | Generic LLM judge | Revision not pinned |
| SkillsBench, skill-usage, Vercel experiment | Research context | Activation is separate from outcome; future uplift work | Normative rules from research | Research records not yet executable KB objects |

The current official OpenAI skills documentation confirms the folder-based `SKILL.md` format and progressive disclosure; Cursor's current documentation likewise describes automatic discovery and on-demand references. These support the static portability model, while the live trigger gate remains evidence-driven.
