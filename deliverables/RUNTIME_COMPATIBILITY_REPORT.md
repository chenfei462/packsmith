# Runtime compatibility report

| Runtime | Static compatibility | Live runner | Host evidence |
|---|---|---|---|
| Claude Code | supported | implemented | CLI 2.1.289 installed; fresh bounded sample produced timeout states |
| Codex | supported | implemented | CLI 0.148.0 installed; fresh five-case sample retained mixed truthful states |
| Cursor | static-only | unsupported | CLI unavailable |
| Gemini CLI | static-only | unsupported | CLI 0.42.0 installed; no live adapter |
| OpenCode | static-only | unsupported | CLI unavailable |

`npm run smoke:runtimes` passed. Static records are evidence-backed capabilities; they are not fake observed activation scores. A real integration run requires `PACKSMITH_INTEGRATION=1`, an explicit skill, bounded case selection, and explicit auth source files for each selected runtime.
