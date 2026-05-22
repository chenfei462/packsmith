# Post-Publish Verification Matrix

Run these checks after npm publication and before announcing the release broadly.

| Path | Command | Expected result |
| --- | --- | --- |
| Clean-machine demo | `npm run smoke:example` in a temporary workspace, temporary `HOME`, temporary npm prefix, and temporary install destinations | Source CLI, Codex `--dest`, Claude Code scoped lifecycle, and packaged tarball CLI paths all pass; install success rate is `4/4`. |
| Clean environment | `node --test tests/pack.test.mjs && node scripts/eval.mjs && node scripts/release-check.mjs` | Regression, eval, generated proof, clean-machine demo, install success rate, and release metadata all pass from a clean checkout. |
| Global install | `npm install -g @chenfei462/packsmith && packsmith --help && packsmith init demo-pack` | CLI help prints and `demo-pack/packsmith.json` exists. |
| Tarball install | `npm pack && npm install -g ./chenfei462-packsmith-0.1.0.tgz && packsmith --help` | Packed artifact installs a working CLI entrypoint. |
| Claude Code scoped install | `packsmith install examples/research-launchpad --target claude-code --scope user` | Skill files land under the resolved Claude Code user scope, metadata is mirrored, install source is recorded, and the version lock is written. |
| Claude Code upgrade | `packsmith upgrade examples/research-launchpad --target claude-code --scope user && packsmith doctor --target claude-code --scope user` | Managed files are replaced through the same lifecycle path and doctor reports the refreshed lock cleanly. |
| Claude Code project install | `packsmith install examples/research-launchpad --target claude-code --scope project && packsmith list --target claude-code --scope project && packsmith doctor --target claude-code --scope project` | Project scope paths resolve under `.claude/`, installed bundles list cleanly, and doctor reports writable path checks. |
| Codex --dest install | `packsmith install examples/research-launchpad --target codex --dest ./codex-packsmith-check` | `AGENTS.md` bridge exists in the destination bundle. |
| Missing install roots | `packsmith doctor --target claude-code --scope user` with no prior install in a temp `HOME` | Doctor reports missing skills and metadata roots without creating them, plus the install command to fix it. |
| Blocked Codex destination | `packsmith install examples/research-launchpad --target codex --dest <path-under-file>` | Install fails with the exact destination path and an actionable `--dest` fix. |
| Invalid scope | `packsmith install examples/research-launchpad --target claude-code --scope team` | Install fails before copying files and says `project` and `user` are the supported scopes. |
| Drift / unmanaged skills | Edit one managed skill file, remove one managed skill directory, add one manual skill directory, then run `packsmith doctor --target claude-code --scope user` | Doctor reports drift from the lock, broken integrity for the missing managed skill, and unmanaged skill directories. |

The post-publish verification refresh PR should be limited to generated proof assets:

- `README.md`
- `docs/verification.json`
- `docs/verification.md`
- `docs/assets/packsmith-verification-card.svg`
- `docs/assets/packsmith-demo-terminal.svg`
