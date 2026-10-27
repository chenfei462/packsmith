# Release Checklist

维护者发布 `@packsmith/cli` 的唯一事实来源。两条发布路径：**路径 A（维护者本机四步发布）** 是本清单的主路径；**路径 B（tag 驱动的 Release 工作流）** 是可选的自动化路径。两条路径发布的是同一个 `v1.1.0`，**只能二选一**，同时走两条会因 npm 版本重复而失败（见第 3 步警告与回滚注意 4）。

发布状态红线（Do not claim published until the external commands below truly succeed）：npm `npm view @packsmith/cli` 返回 404、本机 `npm whoami` 返回 `ENEEDAUTH` 时，包**未发布**。不得在任何材料里声称已发布，直到下述外部命令真实成功。

## 路径 A：维护者四步发布（Primary Automated Path，首选，需 npm 凭据）

### 第 1 步：npm login

```bash
npm login
npm whoami   # 必须输出维护者的 npm 用户名
```

- 本仓库此前所有发布准备都在无凭据环境完成（`npm whoami` 返回 `ENEEDAUTH`），本步必须由持有 `@packsmith/cli` 发布权限的维护者完成。
- 若包从未发布过，scope `@packsmith` 下尚无同名包；注意 npm 公网已有他人发布的 `packsmith@1.0.0`，本仓库只发布 scoped 包 `@packsmith/cli`。

### 第 2 步：npm publish（prepublishOnly 自动跑全量校验）

```bash
npm publish --access public
```

- `--access public` 必须携带：`@packsmith/cli` 是 scoped 包，默认为 restricted，会发布失败。
- `package.json` 的 `prepublishOnly`（`package.json:117`）会自动依次执行，任何一步失败则 publish 中止、npm 上不会产生版本：
  1. `npm test` —— 单元与合同测试（`tests/pack.test.mjs`、`tests/hackathon-demo.test.mjs`、`tests/contract.test.mjs`）
  2. `npm run verify:hackathon:ci` —— 完整发布门禁
  3. `node scripts/i18n-check.mjs --ci` —— i18n 完整性
  4. `npm run pack:dry-run` —— 打包内容核对
- 发布产物即已用 `npm pack --dry-run` 核对过的 tarball：341 个文件，覆盖 `src`（9 个）、`registry`（catalog.json + starter-kits.json）、54 个 `official-packs/` 目录（含新增 `risk-probe`）、`docs/`（59 个）、`scripts/`（3 个）、`examples/`（4 个）及根文档。
- 不要跳过校验发布（如 `--ignore-scripts` 或临时删改 prepublishOnly）：全量校验就是发布门禁本身。

### 第 3 步：git tag v1.1.0 并推 GitHub Release

```bash
git tag v1.1.0 && git push origin v1.1.0
gh release create v1.1.0 dist/packsmith-cli-1.1.0.tgz dist/release-checksums.txt --title "Packsmith v1.1.0" --notes-file RELEASE_NOTES.md
```

- tarball 与校验和在打 tag 前本地生成：

```bash
npm pack --pack-destination dist
sha256sum dist/packsmith-cli-1.1.0.tgz > dist/release-checksums.txt   # Windows PowerShell: Get-FileHash -Algorithm SHA256 dist\packsmith-cli-1.1.0.tgz
```

> ⚠️ **重要冲突警告**：推送 `v*` tag 会触发 `.github/workflows/release.yml`（`on.push.tags: v*`）。若仓库已配置 `NPM_TOKEN` secret，该工作流会对同一版本再次执行 `npm publish`，npm 会以“cannot publish over the previously published version”拒绝，工作流失败，且其后的“Create GitHub Release”步骤会被跳过（该步骤没有 `if: always()`）。因此：
> - 走路径 A 时，GitHub Release 必须用上面的 `gh release create` 手工创建；
> - 手工发布后触发的 Release 工作流变红是**预期现象**，不影响已发布的 npm 包，只需在记录发布证据时注明；
> - 若希望工作流全权负责发布，请改走路径 B，且**不要**先手工 `npm publish`。

### 第 4 步：npm run verify:postpublish

```bash
npm run verify:postpublish
```

- 脚本（`scripts/post-publish-verify.mjs`）使用隔离的临时 npm cache（`post-publish-verify.mjs:32-40`）验证 `npx --yes @packsmith/cli@1.1.0` 可从公网解析，并依次执行 5 项检查（`post-publish-verify.mjs:15-21`）：`--help`、`search review`、`show senior-code-reviewer`、`preview senior-code-reviewer --target codex`、`passport senior-code-reviewer`。
- 刚发布就运行可能遇到 npm CDN 传播延迟，等待几分钟后重跑；隔离 cache 已内置，无需额外清缓存。
- 手工等价抽查：

```bash
npx --yes @packsmith/cli@1.1.0 --help
npx --yes @packsmith/cli@1.1.0 search review
npx --yes @packsmith/cli@1.1.0 passport senior-code-reviewer
```

- 全部通过后，才把 npm 包 URL、GitHub Release URL、CI run URL、最终 checksum 写入 `docs/release-evidence.md` 与评审/投资材料。

## 失败回滚注意（Rollback）

1. **publish 前校验失败**（prepublishOnly 任一步变红）：npm 上没有产生版本，无需回滚；修复问题后直接重跑 `npm publish --access public`。失败的版本号不会被 npm 占用。
2. **publish 成功但内容有误**：
   - npm 的 unpublish 政策限制严格（一般仅发布后 72 小时内、且该版本无依赖者时允许，以 npm 官方政策为准）：窗口内执行 `npm unpublish @packsmith/cli@1.1.0`（若 npm 要求再加 `--force`），修复后重新发布 1.1.0。
   - 超过窗口或已有下载者：**不要** unpublish。发布 1.1.1 修复版，并执行 `npm deprecate @packsmith/cli@1.1.0 "原因说明"`。
3. **`latest` dist-tag 指错版本**：`npm dist-tag add @packsmith/cli@1.1.0 latest` 重新指回。
4. **tag 已推送但 Release 工作流失败，或 GitHub Release 建错**：
   - 删除重建：`gh release delete v1.1.0 --cleanup-tag`（若 Release 已创建），或手工 `git push origin :refs/tags/v1.1.0 && git tag -d v1.1.0`；
   - 从修复后的正确 commit 重新 `git tag v1.1.0 && git push origin v1.1.0`。注意重推同名 tag 会再次触发 Release 工作流。
5. **回滚顺序原则**：npm 版本不可变，只能 unpublish / deprecate；Git tag 与 GitHub Release 可删可重建。先处理 npm 侧，再处理 Git/GitHub 侧，避免制造新的不一致状态（例如 npm 有 1.1.0、GitHub Release 却对应旧 commit）。
6. **verify:postpublish 失败**：先区分是传播延迟（等待数分钟后重跑即可）还是真实缺包（`npm view @packsmith/cli@1.1.0` 确认）。真实缺包按第 2 条处理。

## 路径 B：tag 驱动的自动化发布（可选）

前提：仓库 secret `NPM_TOKEN` 已为 `@packsmith/cli` 配置。未配置时工作流只能走到产物上传为止，不得声称已发布。

1. 打 tag 前先跑本地发布门禁：

```bash
npm run verify:hackathon:ci
node scripts/i18n-check.mjs --ci
```

2. Push a signed or reviewed `v1.1.0` tag（从已评审的发布 commit 推送 `v1.1.0` tag）。
3. 观察 `Release` 工作流，它必须完成：`npm run verify:hackathon:ci` 门禁、`node scripts/i18n-check.mjs --ci`、打包进 `dist/`（`npm pack --pack-destination dist`）、生成 `dist/release-checksums.txt` 与 `dist/release-evidence-summary.md`（含包名、tag、commit、run URL）、用 `NPM_TOKEN` 发布同一 tarball、生成 CDN catalog shards、创建 GitHub Release 并附加 tarball / checksum / evidence / catalog 产物（`.github/workflows/release.yml`）。
4. 工作流成功后，才把 Actions run URL、npm 包 URL、GitHub Release URL、最终 checksum 写入对外材料。
5. 失败时按“失败回滚注意”第 4、6 条处理；工作流自身不可跳过门禁重试。

## Package Facts

- npm 包名：`@packsmith/cli`
- 版本：`1.1.0`
- CLI bin：`packsmith`
- 入口：`src/cli.mjs`
- Node 引擎：`^20.19.0 || ^22.13.0 || >=24.0.0`（`package.json:110`）
- License：MIT
- 运行时依赖：无
- `prepublishOnly`：`npm test && npm run verify:hackathon:ci && node scripts/i18n-check.mjs --ci && npm run pack:dry-run`
- 打包白名单：`src`、`registry`、54 个 `official-packs/` 目录（含 `risk-probe` 高危样本）、`examples/`、3 个 `scripts/`、`docs/` 及根文档（`package.json:20-92`）
- 内置 registry：54 个 official packs，含 category、license、risk、context、usage example、source、publisher 元数据；其中 31 个为 launch-ready（带 README 与 `examples/usage.md`）
- `verify:postpublish`：`node scripts/post-publish-verify.mjs`（隔离 cache 的 5 项 npx 检查）

npm 命名空间说明：npm 公网已有他人发布的 `packsmith@1.0.0`。本仓库以 `@packsmith/cli` 发布，`bin.packsmith` 命令名不受影响。

## Manual Fallback（无工作流、无 gh CLI 时的手工对照）

仅在上述路径都不可用时使用；命令必须真实执行完成，才能声称发布成功。

```bash
npm ci
npm run verify:hackathon:ci
node scripts/i18n-check.mjs --ci
New-Item -ItemType Directory -Force dist
npm pack --pack-destination dist
Get-FileHash -Algorithm SHA256 dist\*.tgz | Format-List
npm publish dist\packsmith-cli-1.1.0.tgz --dry-run --access public
npm publish dist\packsmith-cli-1.1.0.tgz --access public
node scripts/generate-catalog-shards.mjs
```

手工路径同样需要维护者已 `npm login`。npm 发布成功后再手工创建 GitHub Release，并附加 tarball、`release-checksums.txt`、release evidence summary 与 catalog shard 文件。

## After Publish

- 运行 `npm run verify:postpublish`（见第 4 步），确认公网 `npx --yes @packsmith/cli@1.1.0` 可解析。
- 把已发布版本、GitHub Release URL、包 checksum、CI run URL 写入 release evidence——只在这些外部系统真实报告成功之后。
- 保持 `docs/assets/packsmith-demo.svg` 与真实 Passport 输出同步，可选为发布页录制真实命令的 GIF。
