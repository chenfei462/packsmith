# Packsmith v0.2 source inventory

The version-controlled evidence graph currently combines 7 executable-rule sources in `knowledge-base/sources/sources.json` with 21 extended source records in `knowledge-base/sources/extended.json`, for 28 total:

| Authority/use | Count | Records |
|---|---:|---|
| Canonical specification/standards | 3 | Agent Skills specification, AAIF, reference repository |
| Official runtime documentation | 5 | Codex, Claude Code, Cursor, Gemini CLI, OpenCode |
| Packsmith policy/product | 3 | Packsmith security and product boundary sources |
| Academic research | 3 | SkillsBench, realistic Skill usage, ecosystem survey |
| Community/product ecosystem | 7 | Vercel experiment, skills.sh, packaging and incident sources |
| Implementation references | 11 | skills-ref, skill-creator, skills_lint, NVIDIA Skills, agnix, agent-skill-eval, skill-up, SkillOpt, Promptfoo, APM, agentpack |

The source records are URL-backed and linked from claims, research, incidents, product evidence, runtime records, and rules. Current runtime verification was performed on 2026-10-26 for Codex CLI 0.148.0, Claude Code 2.1.289, and Gemini CLI 0.42.0; Cursor Agent and OpenCode were not installed on this host.
